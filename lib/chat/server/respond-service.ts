import { chatCompletion } from "@/lib/ai/client";
import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import { normalizeAppLinks } from "@/lib/ai/utils/normalize-app-links";
import type { ChatMessage as AIChatMessage } from "@/lib/ai/types";
import {
  getChatAttachmentPayloadSize,
  validateChatAttachmentPayload,
} from "@/lib/chat/attachment-validation";
import { CHAT_ATTACHMENT_LIMITS } from "@/lib/chat/constants";
import { resolveChatAttachmentsForModel } from "@/lib/chat/server/attachment-content";
import {
  normalizeChatRoutePathname,
  resolveServerChatRouteProfile,
} from "@/lib/chat/server/respond-route-profile";
import type {
  ChatRespondRequestBody,
  ChatRespondResponseBody,
} from "@/lib/chat/server/respond-types";
import type {
  ChatAttachment,
  ChatMessage,
  ChatSourceReference,
} from "@/lib/chat/types";
import { createAssistantMessage } from "@/lib/chat/utils";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:respond-service");
const MAX_CONVERSATION_ID_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGE_LENGTH = 4_000;
const MAX_HISTORY_TOTAL_CHARS = 12_000;
const MAX_HISTORY_MESSAGES = 12;
const HISTORY_WINDOW = 6;
const MIN_STRONG_RESULT_RANK = 0.15;
const MIN_STRONG_SEMANTIC_RANK = 0.15;
const MIN_VERY_STRONG_RESULT_RANK = 0.35;
const MIN_VERY_STRONG_SEMANTIC_RANK = 0.35;
const CONFLICT_RANK_GAP = 0.03;
const MAX_PROMPT_RESULTS = 4;
const MAX_TRAILING_RESULT_DROP_FROM_TOP = 0.12;
const ROUTER_MAX_TOKENS = 160;
const ROUTER_RESPONSE_FORMAT = {
  type: "json_object" as const,
};

type ChatIntentRoute = "chat_only" | "grounded_kb" | "clarify";

interface ChatIntentDecision {
  route: ChatIntentRoute;
  retrievalQuery?: string;
  rationale?: string;
}

type RetrievedChunk = Awaited<ReturnType<typeof searchKnowledgeBase>>[number];

function summarizeChatAttachment(attachment: ChatAttachment, index: number) {
  return {
    index,
    type: attachment.type,
    name: attachment.name ?? null,
    declaredSize: attachment.size ?? null,
    dataLength: attachment.data.length,
    dataPrefix: attachment.data.slice(0, 48),
  };
}

function summarizeHistoryMessage(
  message: Pick<ChatMessage, "role" | "content" | "attachments">,
  index: number,
) {
  return {
    index,
    role: message.role,
    contentLength: message.content.length,
    contentPreview: message.content.slice(0, 160),
    attachmentCount: message.attachments?.length ?? 0,
    attachments:
      message.attachments?.map((attachment, attachmentIndex) =>
        summarizeChatAttachment(attachment, attachmentIndex),
      ) ?? [],
  };
}

function summarizeRetrievedChunks(results: RetrievedChunk[]) {
  return results.slice(0, 5).map((result, index) => ({
    index,
    title: result.title,
    documentId: result.document_id,
    sourcePath:
      typeof result.metadata?.source_path === "string"
        ? result.metadata.source_path
        : null,
    rank: result.rank,
    semanticRank: result.semantic_rank,
    keywordRank: result.keyword_rank,
    chunkLength: result.chunk_text.length,
    chunkPreview: result.chunk_text.slice(0, 160),
  }));
}

function isValidHistoryMessage(
  value: unknown,
): value is Pick<ChatMessage, "role" | "content" | "attachments"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const attachments = candidate.attachments;
  const hasValidAttachments =
    attachments === undefined ||
    (Array.isArray(attachments) &&
      attachments.every((attachment, index) => {
        if (!attachment || typeof attachment !== "object") {
          return false;
        }

        const result = validateChatAttachmentPayload(
          attachment as ChatAttachment,
          index,
        );
        return result.isValid;
      }) &&
      getChatAttachmentPayloadSize(attachments as ChatAttachment[]) <=
        CHAT_ATTACHMENT_LIMITS.maxTotalSize);
  const text = typeof candidate.content === "string" ? candidate.content : "";
  const hasText = text.trim().length > 0;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    (hasText || hasAttachments) &&
    hasValidAttachments
  );
}

export function validateChatRespondBody(
  body: ChatRespondRequestBody | null,
): string | null {
  if (!body) {
    return "Request body is required";
  }

  if (
    typeof body.conversationId !== "string" ||
    !body.conversationId.trim() ||
    body.conversationId.length > MAX_CONVERSATION_ID_LENGTH
  ) {
    return "conversationId must be a non-empty string under 120 characters";
  }

  if (
    typeof body.message !== "string" ||
    body.message.length > MAX_MESSAGE_LENGTH
  ) {
    return "message must be a string under 2000 characters";
  }

  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments)) {
      return "attachments must be an array when provided";
    }

    if (body.attachments.length > CHAT_ATTACHMENT_LIMITS.maxCount) {
      return `attachments must contain at most ${CHAT_ATTACHMENT_LIMITS.maxCount} images`;
    }

    const totalAttachmentSize = getChatAttachmentPayloadSize(body.attachments);
    if (totalAttachmentSize > CHAT_ATTACHMENT_LIMITS.maxTotalSize) {
      return `attachments must total no more than ${CHAT_ATTACHMENT_LIMITS.maxTotalSize / 1024 / 1024}MB`;
    }

    for (const [index, attachment] of body.attachments.entries()) {
      const validation = validateChatAttachmentPayload(attachment, index);
      if (!validation.isValid) {
        return validation.error ?? "attachments are invalid";
      }
    }
  }

  if (!body.message.trim() && (!body.attachments || body.attachments.length === 0)) {
    return "message or attachments are required";
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length > MAX_HISTORY_MESSAGES ||
    !body.messages.every(isValidHistoryMessage)
  ) {
    return "messages must be an array of up to 12 non-empty chat role/content pairs under 1500 characters each";
  }

  if (
    !body.route ||
    typeof body.route.pathname !== "string" ||
    !body.route.pathname.trim()
  ) {
    return "route.pathname is required";
  }

  if (typeof body.route.routeKey !== "string" || !body.route.routeKey.trim()) {
    return "route.routeKey is required";
  }

  return null;
}

async function formatHistoryMessages(
  messages: Array<Pick<ChatMessage, "role" | "content" | "attachments">>,
  latestUserText: string,
  latestAttachments: ChatAttachment[] = [],
): Promise<AIChatMessage[]> {
  const recent = messages.slice(-HISTORY_WINDOW);
  const normalizedRecent =
    recent[recent.length - 1]?.role === "user" &&
    recent[recent.length - 1]?.content.trim() === latestUserText.trim() &&
    haveMatchingAttachments(
      recent[recent.length - 1]?.attachments,
      latestAttachments,
    )
      ? recent.slice(0, -1)
      : recent;

  // Server-side safety net: collapse consecutive same-role messages.
  // When a prior request failed, the client may send history with two
  // consecutive user messages and no assistant response between them.
  // Keeping only the later message in each run prevents AI confusion.
  const deduplicatedRecent = normalizedRecent.reduce<
    Array<Pick<ChatMessage, "role" | "content" | "attachments">>
  >((acc, msg) => {
    const last = acc[acc.length - 1];
    if (last && last.role === msg.role && msg.role === "user") {
      // Replace the earlier orphaned user message with the newer one
      return [...acc.slice(0, -1), msg];
    }
    return [...acc, msg];
  }, []);

  const budgetedRecent = selectHistoryMessagesWithinBudget(deduplicatedRecent);

  log.debug("Formatted chat history for model input", {
    requestedHistoryCount: messages.length,
    recentHistoryCount: recent.length,
    normalizedHistoryCount: normalizedRecent.length,
    budgetedHistoryCount: budgetedRecent.length,
    latestUserTextLength: latestUserText.length,
    latestAttachmentCount: latestAttachments.length,
    selectedHistory: budgetedRecent.map((message, index) =>
      summarizeHistoryMessage(message, index),
    ),
  });

  return Promise.all(budgetedRecent.map(async (message) => {
    if (message.role === "assistant") {
      return {
        role: message.role,
        content: truncateHistoryContent(message.content),
      };
    }

    const resolvedAttachments = await resolveChatAttachmentsForModel(
      message.attachments,
    );

    return {
      role: message.role,
      content: formatUserMessageContent(
        truncateHistoryContent(message.content),
        resolvedAttachments,
      ),
    };
  }));
}

function selectHistoryMessagesWithinBudget(
  messages: Array<Pick<ChatMessage, "role" | "content" | "attachments">>,
) {
  let remainingBudget = MAX_HISTORY_TOTAL_CHARS;
  const selected: Array<Pick<ChatMessage, "role" | "content" | "attachments">> = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }

    const truncatedContent = truncateHistoryContent(message.content);
    const attachmentTextCost = (message.attachments?.length ?? 0) * 64;
    const messageCost = truncatedContent.length + attachmentTextCost;

    if (selected.length > 0 && messageCost > remainingBudget) {
      continue;
    }

    selected.push(message);
    remainingBudget -= Math.min(messageCost, remainingBudget);

    if (remainingBudget <= 0) {
      break;
    }
  }

  return selected.reverse();
}

function truncateHistoryContent(content: string) {
  if (content.length <= MAX_HISTORY_MESSAGE_LENGTH) {
    return content;
  }

  return `...${content.slice(-MAX_HISTORY_MESSAGE_LENGTH)}`;
}

function haveMatchingAttachments(
  left?: ChatAttachment[],
  right?: ChatAttachment[],
) {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((attachment, index) => {
    const other = normalizedRight[index];
    return (
      other?.type === attachment.type &&
      other?.data === attachment.data &&
      other?.name === attachment.name
    );
  });
}

function buildAttachmentOnlyRetrievalQuery(
  pathname: string,
  domainTags: string[],
  mediaType: "image" | "video" = "image",
) {
  const tags = domainTags.slice(0, 3).join(", ");
  return `Help request for ${pathname}${tags ? ` about ${tags}` : ""} based on an attached ${mediaType}.`;
}

function formatUserMessageContent(
  userText: string,
  attachments?: ChatAttachment[],
): AIChatMessage["content"] {
  const normalizedText = userText.trim();
  const normalizedAttachments = attachments ?? [];

  if (normalizedAttachments.length === 0) {
    return normalizedText || "User asked for help.";
  }

  return [
    {
      type: "text",
      text:
        normalizedText ||
        "The user shared media attachment(s) and wants help based on what is shown.",
    },
    ...normalizedAttachments.map((attachment) => {
      if (attachment.type === "video") {
        return {
          type: "video_url" as const,
          video_url: { url: attachment.data },
        };
      }
      return {
        type: "image_url" as const,
        image_url: { url: attachment.data },
      };
    }),
  ];
}

function formatRetrievedKnowledge(chunks: RetrievedChunk[]) {
  return chunks
    .map((chunk, index) => {
      const sectionHeading =
        typeof chunk.metadata?.section_heading === "string"
          ? ` | section: ${chunk.metadata.section_heading}`
          : "";
      const sourcePath =
        typeof chunk.metadata?.source_path === "string"
          ? ` | source: ${chunk.metadata.source_path}`
          : "";

      return [
        `Source ${index + 1}: ${chunk.title}${sectionHeading}${sourcePath}`,
        chunk.chunk_text,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}

function extractSourceHref(chunk: RetrievedChunk) {
  const sourcePath =
    typeof chunk.metadata?.source_path === "string"
      ? chunk.metadata.source_path
      : null;

  if (sourcePath && /^https?:\/\//i.test(sourcePath)) {
    return sourcePath;
  }

  return undefined;
}

function mapSources(chunks: RetrievedChunk[]): ChatSourceReference[] {
  const uniqueSources = new Map<string, ChatSourceReference>();

  for (const chunk of chunks) {
    const key =
      typeof chunk.metadata?.source_path === "string"
        ? chunk.metadata.source_path
        : chunk.document_id;

    if (!uniqueSources.has(key)) {
      uniqueSources.set(key, {
        id: key,
        title: chunk.title,
        href: extractSourceHref(chunk),
      });
    }
  }

  return [...uniqueSources.values()];
}

function buildSystemInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
  objective: string;
  responseStyle: string;
  weakRetrievalMode: "sales" | "support";
}) {
  const routeContext = params.isAuthenticated
    ? "The user may be signed in."
    : "The user may be anonymous.";

  return [
    "You are the P2E Inferno in-app chat assistant.",
    params.objective,
    `Route style: ${params.responseStyle}`,
    `Current pathname: ${params.pathname}`,
    routeContext,
    "Use only the retrieved knowledge for factual or operational claims.",
    "If the retrieved knowledge is insufficient, say so explicitly instead of guessing.",
    params.weakRetrievalMode === "support"
      ? "For weak support evidence, give safe next steps and route-aware navigation guidance without inventing account state."
      : "For weak sales evidence, stay high-level on product value and getting started, and do not invent support or troubleshooting details.",
    "Keep answers concise and practical.",
  ].join("\n");
}

function isMeaningfullyWeakResult(result: RetrievedChunk | undefined) {
  if (!result) {
    return true;
  }

  return (
    result.rank < MIN_STRONG_RESULT_RANK ||
    result.semantic_rank < MIN_STRONG_SEMANTIC_RANK
  );
}

function areResultsMeaningfullyConflicting(results: RetrievedChunk[]) {
  if (results.length < 2) {
    return false;
  }

  const [first, second] = results;
  if (!first || !second) {
    return false;
  }

  const closeRanks = Math.abs(first.rank - second.rank) <= CONFLICT_RANK_GAP;
  const differentTitles = first.title !== second.title;
  const differentSources =
    first.metadata?.source_path !== second.metadata?.source_path;
  const sameSourceType =
    first.metadata?.source_type &&
    second.metadata?.source_type &&
    first.metadata.source_type === second.metadata.source_type;
  const bothVeryStrong =
    first.rank >= MIN_VERY_STRONG_RESULT_RANK &&
    second.rank >= MIN_VERY_STRONG_RESULT_RANK &&
    first.semantic_rank >= MIN_VERY_STRONG_SEMANTIC_RANK &&
    second.semantic_rank >= MIN_VERY_STRONG_SEMANTIC_RANK;

  return (
    closeRanks &&
    differentTitles &&
    differentSources &&
    Boolean(sameSourceType) &&
    !bothVeryStrong
  );
}

function shouldUseWeakRetrievalFallback(results: RetrievedChunk[]) {
  if (results.length === 0) {
    return true;
  }

  if (isMeaningfullyWeakResult(results[0])) {
    return true;
  }

  if (areResultsMeaningfullyConflicting(results)) {
    return true;
  }

  return false;
}

function filterResultsForPrompt(results: RetrievedChunk[]) {
  const topResult = results[0];
  if (!topResult) {
    return [];
  }

  return results
    .filter((result, index) => {
      if (index === 0) {
        return true;
      }

      return (
        !isMeaningfullyWeakResult(result) &&
        topResult.rank - result.rank <= MAX_TRAILING_RESULT_DROP_FROM_TOP
      );
    })
    .slice(0, MAX_PROMPT_RESULTS);
}

function buildRouterInstruction(hasAttachments: boolean) {
  const baseInstructions = [
    "You route chat requests for the P2E Inferno in-app assistant.",
  ];

  if (hasAttachments) {
    return [
      ...baseInstructions,
      "The user provided an image. Image requests should almost ALWAYS be routed to 'grounded_kb'.",
      "Return ONLY a raw JSON object string with NO markdown formatting, like this: {\"route\": \"grounded_kb\", \"retrievalQuery\": \"<short description of image>\", \"rationale\": \"<reason>\"}",
    ].join("\n");
  }

  return [
    ...baseInstructions,
    "Output your decision as a JSON object with the following properties:",
    '- route: must be one of "chat_only", "grounded_kb", "clarify".',
    '- retrievalQuery: string.',
    '- rationale: string.',
    'Use "chat_only" for greetings, thanks, acknowledgements, and lightweight conversational turns that do not need grounded operational facts.',
    'Use "grounded_kb" for product, navigation, troubleshooting, quest, bootcamp, vendor, wallet, membership, or process questions that need factual grounding.',
    'Use "clarify" only when the message is too ambiguous to answer safely or search well.',
    "If route is grounded_kb, provide a short retrievalQuery optimized for knowledge-base search.",
    "If route is not grounded_kb, retrievalQuery should be an empty string.",
    "Prefer chat_only over clarify for plain greetings like hello/hi/hey.",
  ].join("\n");
}

function buildDirectChatInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
  objective: string;
  responseStyle: string;
}) {
  const routeContext = params.isAuthenticated
    ? "The user may be signed in."
    : "The user may be anonymous.";

  return [
    "You are the P2E Inferno in-app chat assistant.",
    params.objective,
    `Route style: ${params.responseStyle}`,
    `Current pathname: ${params.pathname}`,
    routeContext,
    "Respond naturally and conversationally.",
    "For greetings, acknowledgements, or thanks, reply like a helpful AI assistant would.",
    "Do not invent account state or operational facts.",
    "If the user seems to need factual app guidance, give a short helpful bridge rather than pretending certainty.",
    "Keep answers concise and practical.",
  ].join("\n");
}

function buildClarifyInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
}) {
  const routeContext = params.isAuthenticated
    ? "The user may be signed in."
    : "The user may be anonymous.";

  return [
    "You are the P2E Inferno in-app chat assistant.",
    `Current pathname: ${params.pathname}`,
    routeContext,
    "The user message is too ambiguous to answer safely.",
    "Ask exactly one short clarifying question.",
    "Do not mention routing, retrieval, or knowledge bases.",
    "Keep it brief and natural.",
  ].join("\n");
}

function parseIntentDecision(content: string): ChatIntentDecision | null {
  const trimmed = content.trim();
  const jsonCandidate = (() => {
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  })();

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<ChatIntentDecision>;
    if (
      parsed.route !== "chat_only" &&
      parsed.route !== "grounded_kb" &&
      parsed.route !== "clarify"
    ) {
      return null;
    }

    return {
      route: parsed.route,
      retrievalQuery:
        typeof parsed.retrievalQuery === "string"
          ? parsed.retrievalQuery.trim()
          : undefined,
      rationale:
        typeof parsed.rationale === "string" ? parsed.rationale.trim() : undefined,
    };
  } catch {
    return null;
  }
}

function getRouterFailureFallback(params: {
  pathname: string;
  userText: string;
  attachments?: ChatAttachment[];
}) {
  if ((params.attachments?.length ?? 0) > 0) {
    return {
      route: "grounded_kb" as const,
      retrievalQuery: params.userText.trim(),
      rationale: "Router failed; attachments should stay grounded.",
    };
  }

  const looksOperationalQuestion =
    params.userText.includes("?") ||
    /(?:what should i do|what do i do|where do i|how do i|why can'?t i|can i|should i|next step|first step|get started)/i.test(
      params.userText,
    );

  if (looksOperationalQuestion) {
    return {
      route: "grounded_kb" as const,
      retrievalQuery: params.userText.trim(),
      rationale:
        "Router failed; defaulted to grounded retrieval for an operational question.",
    };
  }

  return {
    route: "chat_only" as const,
    retrievalQuery: "",
    rationale: `Router failed; defaulted to direct chat for ${params.pathname}.`,
  };
}

async function routeChatIntent(params: {
  pathname: string;
  isAuthenticated: boolean;
  profile: ReturnType<typeof resolveServerChatRouteProfile>;
  userText: string;
  attachments?: ChatAttachment[];
  messages: Array<Pick<ChatMessage, "role" | "content" | "attachments">>;
}): Promise<ChatIntentDecision> {
  log.debug("Routing chat intent", {
    pathname: params.pathname,
    isAuthenticated: params.isAuthenticated,
    profile: params.profile.id,
    userTextLength: params.userText.length,
    userTextPreview: params.userText.slice(0, 200),
    attachmentCount: params.attachments?.length ?? 0,
    attachments:
      params.attachments?.map((attachment, index) =>
        summarizeChatAttachment(attachment, index),
      ) ?? [],
    historyCount: params.messages.length,
    history: params.messages.map((message, index) =>
      summarizeHistoryMessage(message, index),
    ),
  });

  if (!params.userText.trim() && (params.attachments?.length ?? 0) > 0) {
    const decision = {
      route: "grounded_kb" as const,
      retrievalQuery: buildAttachmentOnlyRetrievalQuery(
        params.pathname,
        params.profile.domainTags,
      ),
      rationale: "Attachment-only requests should use grounded retrieval.",
    };
    log.debug("Intent route resolved for attachment-only request", decision);
    return {
      ...decision,
    };
  }

  const hasAttachments = Boolean(params.attachments?.length);
  const historyMessages = await formatHistoryMessages(
    params.messages,
    params.userText,
    params.attachments,
  );
  const router = await chatCompletion({
    model: process.env.OPENROUTER_CHAT_ROUTER_MODEL,
    fallbacks: ["google/gemini-2.0-flash-001", "anthropic/claude-3-haiku"],
    temperature: 0,
    maxTokens: ROUTER_MAX_TOKENS,
    // Drop forced JSON object formatting when dealing with multi-modal inputs
    // as it frequently causes timeout failures during vision processing
    responseFormat: hasAttachments ? undefined : ROUTER_RESPONSE_FORMAT,
    messages: [
      {
        role: "system",
        content: buildRouterInstruction(hasAttachments),
      },
      ...historyMessages,
      {
        role: "user",
        content: JSON.stringify({
          pathname: params.pathname,
          isAuthenticated: params.isAuthenticated,
          profileId: params.profile.id,
          userMessage: params.userText,
          hasAttachments: Boolean(params.attachments?.length),
        }),
      },
    ],
  });

  if (!router.success) {
    log.warn("Chat intent routing failed; using fallback route", {
      pathname: params.pathname,
      profile: params.profile.id,
      code: router.code,
      error: router.error,
    });
    const fallback = getRouterFailureFallback({
      pathname: params.pathname,
      userText: params.userText,
      attachments: params.attachments,
    });
    log.debug("Using router fallback decision", fallback);
    return fallback;
  }

  const decision = parseIntentDecision(router.content);
  if (!decision) {
    log.warn("Chat intent router returned unparseable output; using fallback route", {
      pathname: params.pathname,
      profile: params.profile.id,
      outputPreview: router.content.slice(0, 200),
    });
    const fallback = getRouterFailureFallback({
      pathname: params.pathname,
      userText: params.userText,
      attachments: params.attachments,
    });
    log.debug("Using router fallback decision after parse failure", {
      fallback,
      rawRouterOutput: router.content.slice(0, 200),
    });
    return fallback;
  }

  log.debug("Chat intent route resolved", {
    pathname: params.pathname,
    profile: params.profile.id,
    decision,
  });
  return decision;
}

export async function generateChatResponse(params: {
  body: ChatRespondRequestBody;
  isAuthenticated: boolean;
}): Promise<ChatRespondResponseBody> {
  log.debug("Starting chat response generation", {
    conversationId: params.body.conversationId,
    pathname: params.body.route.pathname,
    routeKey: params.body.route.routeKey,
    behaviorKey: params.body.route.behaviorKey ?? null,
    segment: params.body.route.segment ?? null,
    isAuthenticated: params.isAuthenticated,
    messageLength: params.body.message.length,
    messagePreview: params.body.message.slice(0, 200),
    attachmentCount: params.body.attachments?.length ?? 0,
    attachments:
      params.body.attachments?.map((attachment, index) =>
        summarizeChatAttachment(attachment, index),
      ) ?? [],
    historyCount: params.body.messages.length,
    history: params.body.messages.map((message, index) =>
      summarizeHistoryMessage(message, index),
    ),
  });

  const normalizedPathname = normalizeChatRoutePathname(
    params.body.route.pathname,
  );
  const profile = resolveServerChatRouteProfile(normalizedPathname, {
    isAuthenticated: params.isAuthenticated,
  });
  const userText = params.body.message.trim();
  const intentDecision = await routeChatIntent({
    pathname: normalizedPathname,
    isAuthenticated: params.isAuthenticated,
    profile,
    userText,
    attachments: params.body.attachments,
    messages: params.body.messages,
  });

  const hasAttachments = Boolean(params.body.attachments?.length);
  const hasVideo = params.body.attachments?.some(a => a.type === "video");
  
  // For images and general chat, we use a balanced flash model.
  // For video, we route specifically to Gemini 3.1 Flash-Lite which has native video understanding.
  const multimodalModel = hasVideo 
    ? "google/gemini-3.1-flash-lite-preview" 
    : "google/gemini-2.0-flash-001";
  
  const thinkingLevel = hasVideo ? "medium" : undefined;

  log.debug("Resolved chat route profile and intent", {
    conversationId: params.body.conversationId,
    normalizedPathname,
    profile: profile.id,
    audience: profile.audience,
    domainTags: profile.domainTags,
    intentDecision,
  });

  if (intentDecision.route === "chat_only") {
    const historyMessages = await formatHistoryMessages(
      params.body.messages,
      userText,
      params.body.attachments,
    );
    const resolvedAttachments = await resolveChatAttachmentsForModel(
      params.body.attachments,
    );
    const direct = await chatCompletion({
      model: hasAttachments ? multimodalModel : undefined,
      thinkingLevel,
      fallbacks: [multimodalModel, "anthropic/claude-3-haiku"],
      temperature: 0.4,
      maxTokens: 220,
      messages: [
        {
          role: "system",
          content: buildDirectChatInstruction({
            pathname: normalizedPathname,
            isAuthenticated: params.isAuthenticated,
            objective: profile.assistantObjective,
            responseStyle: profile.responseStyle,
          }),
        },
        ...historyMessages,
        {
          role: "user",
          content: formatUserMessageContent(userText, resolvedAttachments),
        },
      ],
    });

    if (!direct.success) {
      log.error("Direct chat completion failed", {
        pathname: normalizedPathname,
        profile: profile.id,
        code: direct.code,
        error: direct.error,
      });
      throw new Error("Unable to generate a chat response right now.");
    }

    log.debug("Returning direct chat response", {
      conversationId: params.body.conversationId,
      profile: profile.id,
      responseLength: direct.content.length,
      responsePreview: direct.content.slice(0, 200),
    });
    return {
      message: createAssistantMessage(normalizeAppLinks(direct.content)),
      sources: [],
      retrievalMeta: {
        profile: profile.id,
        audience: profile.audience,
        domainTags: profile.domainTags,
        resultCount: 0,
      },
    };
  }

  if (intentDecision.route === "clarify") {
    const historyMessages = await formatHistoryMessages(
      params.body.messages,
      userText,
      params.body.attachments,
    );
    const resolvedAttachments = await resolveChatAttachmentsForModel(
      params.body.attachments,
    );
    const clarify = await chatCompletion({
      model: hasAttachments ? multimodalModel : undefined,
      thinkingLevel,
      fallbacks: [multimodalModel, "anthropic/claude-3-haiku"],
      temperature: 0.2,
      maxTokens: 120,
      messages: [
        {
          role: "system",
          content: buildClarifyInstruction({
            pathname: normalizedPathname,
            isAuthenticated: params.isAuthenticated,
          }),
        },
        ...historyMessages,
        {
          role: "user",
          content: formatUserMessageContent(userText, resolvedAttachments),
        },
      ],
    });

    if (!clarify.success) {
      log.error("Clarifying chat completion failed", {
        pathname: normalizedPathname,
        profile: profile.id,
        code: clarify.code,
        error: clarify.error,
      });
      throw new Error("Unable to generate a chat response right now.");
    }

    log.debug("Returning clarifying chat response", {
      conversationId: params.body.conversationId,
      profile: profile.id,
      responseLength: clarify.content.length,
      responsePreview: clarify.content.slice(0, 200),
    });
    return {
      message: createAssistantMessage(normalizeAppLinks(clarify.content)),
      sources: [],
      retrievalMeta: {
        profile: profile.id,
        audience: profile.audience,
        domainTags: profile.domainTags,
        resultCount: 0,
      },
    };
  }

  const retrievalQuery =
    intentDecision.retrievalQuery ||
    userText ||
    buildAttachmentOnlyRetrievalQuery(
      normalizedPathname, 
      profile.domainTags, 
      hasVideo ? "video" : "image"
    );
  log.debug("Preparing grounded retrieval", {
    conversationId: params.body.conversationId,
    profile: profile.id,
    retrievalQuery,
    retrievalQueryLength: retrievalQuery.length,
  });
  const [queryEmbedding] = await embedTexts([retrievalQuery]);

  if (!queryEmbedding) {
    throw new Error("No embedding returned for chat query");
  }

  const results = await searchKnowledgeBase({
    queryText: retrievalQuery,
    queryEmbedding,
    audience: profile.audience,
    domainTags: profile.domainTags,
    limit: profile.retrievalLimit,
    freshnessDays: profile.freshnessDays,
  });

  log.debug("Retrieved knowledge base results for chat", {
    conversationId: params.body.conversationId,
    profile: profile.id,
    retrievalQuery,
    resultCount: results.length,
    results: summarizeRetrievedChunks(results),
  });

  if (shouldUseWeakRetrievalFallback(results)) {
    if (results.length === 0) {
      log.warn("Using zero-result retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: profile.id,
        retrievalOutcome: "no_usable_results",
      });
    } else {
      log.warn("Using weak retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: profile.id,
        topRank: results[0]?.rank ?? null,
        topSemanticRank: results[0]?.semantic_rank ?? null,
        conflicting: areResultsMeaningfullyConflicting(results),
        resultCount: results.length,
      });
    }

    // We intentionally do NOT return early here with a hardcoded fallback string.
    // We let the AI naturally handle the lack of strong knowledge using the
    // `profile.weakRetrievalMode` instructions provided in the system prompt.
  }

  const promptResults = filterResultsForPrompt(results);

  log.debug("Selected prompt results for grounded answer", {
    conversationId: params.body.conversationId,
    profile: profile.id,
    promptResultCount: promptResults.length,
    promptResults: summarizeRetrievedChunks(promptResults),
  });

  const historyMessages = await formatHistoryMessages(
    params.body.messages,
    userText,
    params.body.attachments,
  );
  const resolvedAttachments = await resolveChatAttachmentsForModel(
    params.body.attachments,
  );
  const completion = await chatCompletion({
    model: hasAttachments ? multimodalModel : undefined,
    thinkingLevel,
    fallbacks: [multimodalModel, "anthropic/claude-3-haiku"],
    temperature: 0.2,
    maxTokens: profile.maxTokens ?? 450,
      messages: [
      {
        role: "system",
        content: buildSystemInstruction({
          pathname: normalizedPathname,
          isAuthenticated: params.isAuthenticated,
          objective: profile.assistantObjective,
          responseStyle: profile.responseStyle,
          weakRetrievalMode: profile.weakRetrievalMode,
        }),
      },
      ...historyMessages,
      {
        role: "user",
        content: formatUserMessageContent(
          [
            userText ? `User question:\n${userText}` : "The user did not send text.",
            `Retrieved knowledge:\n${formatRetrievedKnowledge(promptResults)}`,
            "Answer using the retrieved knowledge. If the knowledge is incomplete, say that clearly.",
          ].join("\n\n"),
          resolvedAttachments,
        ),
      },
    ],
  });

  if (!completion.success) {
    log.error("Model completion failed for chat respond", {
      code: completion.code,
      error: completion.error,
      pathname: params.body.route.pathname,
      profile: profile.id,
    });
    throw new Error("Unable to generate a grounded response right now.");
  }

  log.debug("Returning grounded chat response", {
    conversationId: params.body.conversationId,
    profile: profile.id,
    sourceCount: promptResults.length,
    responseLength: completion.content.length,
    responsePreview: completion.content.slice(0, 200),
  });
  return {
    message: createAssistantMessage(normalizeAppLinks(completion.content)),
    sources: mapSources(promptResults),
    retrievalMeta: {
      profile: profile.id,
      audience: profile.audience,
      domainTags: profile.domainTags,
      resultCount: results.length,
    },
  };
}
