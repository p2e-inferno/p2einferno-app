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
import { runChatAgentLoop } from "@/lib/chat/server/chat-agent-loop";
import {
  areResultsMeaningfullyConflicting,
  buildAttachmentOnlyRetrievalQuery,
  filterResultsForPrompt,
  formatRetrievedKnowledge,
  mapSources,
  shouldUseWeakRetrievalFallback,
} from "@/lib/chat/server/respond-kb-utils";
import {
  resolveAgentChatRouteProfile,
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

// Few-shot examples injected as message pairs before conversation history.
// Anchors tone, length, and style without relying on abstract rules alone.
const DIRECT_CHAT_EXAMPLES: AIChatMessage[] = [
  { role: "user", content: "hey" },
  { role: "assistant", content: "Hey — what can I help with?" },
  { role: "user", content: "thanks" },
  { role: "assistant", content: "Anytime. Let me know if anything else comes up." },
];

const CLARIFY_EXAMPLES: AIChatMessage[] = [
  { role: "user", content: "it's not working" },
  { role: "assistant", content: "What step were you trying to complete and what's not working?" },
];

const AGENT_EXAMPLES: AIChatMessage[] = [
  { role: "user", content: "I completed the task but it still says pending." },
  {
    role: "assistant",
    content:
      "Pending means the submission was received but not yet confirmed. Tasks that verify automatically should clear quickly. If yours needs proof checking or admin review, it may stay pending until that completes — if it comes back as retry, there will be feedback on what to fix and you can resubmit. Also worth checking: the task itself may be done but there is still a separate reward or claim step that needs to be completed.",
  },
  { role: "user", content: "I linked my wallet but I'm not seeing my balance." },
  {
    role: "assistant",
    content:
      "In P2E Inferno, the wallet that is linked, the wallet the app is actively reading, and the wallet that actually holds the balance are not always the same. The app prefers your linked external wallet if it is available on the current device — otherwise it falls back to your embedded wallet. Check which wallet is active in your profile. If you are on mobile, try opening the app from your wallet app's in-app browser instead of a standard browser.",
  },
];

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

  if (!Array.isArray(body.messages) || body.messages.length > MAX_HISTORY_MESSAGES) {
    return "messages must be an array of up to 12 chat history entries";
  }

  const invalidMessage = body.messages.find((m) => !isValidHistoryMessage(m));
  if (invalidMessage) {
    return "messages must be an array of up to 12 chat history entries with valid roles and attachments";
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
  attachmentOwnerIdentityKey?: string,
): Promise<AIChatMessage[]> {
  // Defensive: drop ghost messages (empty content + no attachments) before windowing.
  // Attachments are now persisted to the DB so this should not occur for new messages,
  // but pre-migration rows may still arrive without attachment data.
  const withoutGhosts = messages.filter(
    (m) => m.content.trim() || (m.attachments?.length ?? 0) > 0,
  );
  const recent = withoutGhosts.slice(-HISTORY_WINDOW);
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

  const latestAttachmentBearingHistoryIndex = budgetedRecent.findLastIndex(
    (message) => message.role === "user" && (message.attachments?.length ?? 0) > 0,
  );

  return Promise.all(budgetedRecent.map(async (message, index) => {
    if (message.role === "assistant") {
      return {
        role: message.role,
        content: truncateHistoryContent(message.content),
      };
    }

    const resolvedAttachments =
      index === latestAttachmentBearingHistoryIndex
        ? await resolveChatAttachmentsForModel(
            message.attachments,
            attachmentOwnerIdentityKey,
          )
        : [];

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

function buildSystemInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
  objective: string;
  responseStyle: string;
  weakRetrievalMode: "sales" | "support";
}) {
  const authContext = params.isAuthenticated ? "User is signed in." : "User may be anonymous.";
  const weakMode =
    params.weakRetrievalMode === "support"
      ? "When retrieved knowledge is weak, give the safest likely explanation and a clear next step. Don't invent account state, balances, or permissions."
      : "When retrieved knowledge is weak, stay high-level on product value. Don't invent support details or user-specific outcomes.";

  return [
    "You are the P2E Inferno in-app assistant.",
    params.objective,
    "",
    "Use only the retrieved knowledge for factual or operational claims. If knowledge is incomplete, say that clearly before giving your best safe answer.",
    weakMode,
    "",
    "Lead with the most useful answer or next step. Keep responses concise — 3–4 sentences by default unless the user needs more. Use conversation history and current route to stay in context.",
    "Sound natural and direct. Don't invent product behavior, policies, or user-specific state.",
    "",
    `Style: ${params.responseStyle}`,
    `Pathname: ${params.pathname}`,
    authContext,
  ].join("\n");
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
  const authContext = params.isAuthenticated ? "User is signed in." : "User may be anonymous.";

  return [
    "You are the P2E Inferno in-app assistant.",
    params.objective,
    "",
    "Be natural, warm, and direct. Keep replies short. For greetings and thanks, respond like a capable friendly guide — not a support form.",
    "Treat short follow-ups as continuations of the active topic. Don't invent account state or operational facts.",
    "If the user seems to need product guidance, give a brief helpful bridge toward the right next step.",
    "",
    `Style: ${params.responseStyle}`,
    `Pathname: ${params.pathname}`,
    authContext,
  ].join("\n");
}

function buildClarifyInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
}) {
  const authContext = params.isAuthenticated ? "User is signed in." : "User may be anonymous.";

  return [
    "You are the P2E Inferno in-app assistant.",
    "The user's message is unclear. Ask one short clarifying question to understand what they need.",
    "Be natural and brief. Don't mention routing, retrieval, or knowledge bases.",
    `Pathname: ${params.pathname}`,
    authContext,
  ].join("\n");
}

function buildAgentInstruction(params: {
  pathname: string;
  isAuthenticated: boolean;
  objective: string;
  responseStyle: string;
}) {
  const authContext = params.isAuthenticated ? "User is signed in." : "User may be anonymous.";

  return [
    "You are the P2E Inferno in-app assistant.",
    params.objective,
    "",
    "Help users move forward clearly and naturally. Lead with the most useful answer or next step. Be direct and conversational — not robotic or policy-heavy.",
    "Use conversation history and current route to stay in context. Treat short follow-ups as continuations unless the user clearly changes topic.",
    "",
    "Rules:",
    "- Ground every question involving what, how, why, when, where, or who with data from the knowledge base using the search_knowledge_base tool before responding. Never answer these from memory.",
    "- Always use the knowledge base for any product, feature, operational, or procedural question. Never guess.",
    "- Only skip the knowledge base for pure greetings, thanks, and simple banter with no product question.",
    "- When the knowledge base result is weak or missing, say so clearly and give the safest next step. Never invent account state, balances, permissions, or outcomes.",
    "For attachments, use what the user shared directly. Only suggest sending a screenshot or recording if it would materially improve accuracy on a UI-specific issue.",
    "",
    `Style: ${params.responseStyle}`,
    `Pathname: ${params.pathname}`,
    authContext,
  ].join("\n");
}

function isToolAgentEnabled() {
  return process.env.CHAT_TOOL_AGENT_ENABLED === "true";
}

function shouldPreferToolGrounding(params: {
  pathname: string;
  userText: string;
  attachments?: ChatAttachment[];
}) {
  if ((params.attachments?.length ?? 0) > 0 && params.userText.trim()) {
    return true;
  }

  const normalizedText = params.userText.trim().toLowerCase();
  if (!normalizedText) {
    return false;
  }

  if (
    normalizeChatRoutePathname(params.pathname) === "/" &&
    /(?:what should i do first|what do i do here|where do i begin|how do i start|how do i begin|get started|just landed here|first step)/i.test(
      normalizedText,
    )
  ) {
    return true;
  }

  return /(?:where do i|how do i|why can'?t i|can i|should i|next step|first step|get started|wallet|quest|bootcamp|vendor|membership|profile|eligib|connect)/i.test(
    normalizedText,
  );
}

function getTextResultContent(
  result: Awaited<ReturnType<typeof chatCompletion>>,
): string | null {
  if (!result.success) {
    return null;
  }

  return "content" in result ? result.content : null;
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
  historyMessages: AIChatMessage[];
  attachmentOwnerIdentityKey?: string;
  signal?: AbortSignal;
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
      ...params.historyMessages,
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
    signal: params.signal,
  });

  if (!router.success) {
    if (router.code === "AI_CANCELLED") {
      throw new DOMException("Chat intent routing was cancelled", "AbortError");
    }
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

  const routerContent = getTextResultContent(router);
  if (!routerContent) {
    log.warn("Chat intent router returned a non-text response; using fallback route", {
      pathname: params.pathname,
      profile: params.profile.id,
    });
    return getRouterFailureFallback({
      pathname: params.pathname,
      userText: params.userText,
      attachments: params.attachments,
    });
  }

  const decision = parseIntentDecision(routerContent);
  if (!decision) {
    log.warn("Chat intent router returned unparseable output; using fallback route", {
      pathname: params.pathname,
      profile: params.profile.id,
      outputPreview: routerContent.slice(0, 200),
    });
    const fallback = getRouterFailureFallback({
      pathname: params.pathname,
      userText: params.userText,
      attachments: params.attachments,
    });
    log.debug("Using router fallback decision after parse failure", {
      fallback,
      rawRouterOutput: routerContent.slice(0, 200),
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
  attachmentOwnerIdentityKey?: string;
  signal?: AbortSignal;
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
  const userText = params.body.message.trim();
  const legacyProfile = resolveServerChatRouteProfile(normalizedPathname, {
    isAuthenticated: params.isAuthenticated,
  });
  const profile = resolveAgentChatRouteProfile({
    pathname: normalizedPathname,
    isAuthenticated: params.isAuthenticated,
    userText,
  });
  const toolAgentEnabled = isToolAgentEnabled();
  const hasAttachments = Boolean(params.body.attachments?.length);
  const hasVideo = params.body.attachments?.some((a) => a.type === "video");
  const multimodalModel = hasVideo
    ? "google/gemini-3.1-flash-lite-preview"
    : "google/gemini-2.0-flash-001";
  const thinkingLevel = hasVideo ? "medium" : undefined;
  const historyMessages = await formatHistoryMessages(
    params.body.messages,
    userText,
    params.body.attachments,
    params.attachmentOwnerIdentityKey,
  );
  const resolvedAttachments = await resolveChatAttachmentsForModel(
    params.body.attachments,
    params.attachmentOwnerIdentityKey,
  );

  if (toolAgentEnabled) {
    const agentMessages: AIChatMessage[] = [
      {
        role: "system",
        content: buildAgentInstruction({
          pathname: normalizedPathname,
          isAuthenticated: params.isAuthenticated,
          objective: profile.assistantObjective,
          responseStyle: profile.responseStyle,
        }),
      },
      ...AGENT_EXAMPLES,
      ...historyMessages,
      {
        role: "user",
        content: formatUserMessageContent(userText, resolvedAttachments),
      },
    ];

    try {
      const agentResult = await runChatAgentLoop({
        messages: agentMessages,
        routeProfile: profile,
        model: hasAttachments ? multimodalModel : undefined,
        fallbacks: ["anthropic/claude-3-haiku"],
        temperature: hasAttachments ? 0.2 : 0.3,
        maxTokens: profile.maxTokens ?? 450,
        thinkingLevel,
        signal: params.signal,
      });

      if (agentResult.usedToolCalls || !shouldPreferToolGrounding({
        pathname: normalizedPathname,
        userText,
        attachments: params.body.attachments,
      })) {
        log.debug("Returning tool-agent chat response", {
          conversationId: params.body.conversationId,
          profile: profile.id,
          usedToolCalls: agentResult.usedToolCalls,
          sourceCount: agentResult.sources.length,
          iterations: agentResult.iterations,
          stopReason: agentResult.stopReason,
          responseLength: agentResult.content.length,
          responsePreview: agentResult.content.slice(0, 200),
        });
        return {
          message: createAssistantMessage(normalizeAppLinks(agentResult.content)),
          sources: agentResult.sources,
          retrievalMeta: {
            profile: profile.id,
            audience: profile.audience,
            domainTags: profile.domainTags,
            resultCount: agentResult.sources.length,
          },
        };
      }

      log.warn("Tool-agent path produced no tool calls for a grounding-preferred request; falling back to legacy router path", {
        conversationId: params.body.conversationId,
        profile: profile.id,
        pathname: normalizedPathname,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      log.warn("Tool-agent path failed; falling back to legacy router path", {
        conversationId: params.body.conversationId,
        profile: profile.id,
        pathname: normalizedPathname,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const intentDecision = await routeChatIntent({
    pathname: normalizedPathname,
    isAuthenticated: params.isAuthenticated,
    profile: legacyProfile,
    userText,
    attachments: params.body.attachments,
    messages: params.body.messages,
    historyMessages,
    attachmentOwnerIdentityKey: params.attachmentOwnerIdentityKey,
    signal: params.signal,
  });

  log.debug("Resolved chat route profile and intent", {
    conversationId: params.body.conversationId,
    normalizedPathname,
    profile: legacyProfile.id,
    audience: legacyProfile.audience,
    domainTags: legacyProfile.domainTags,
    intentDecision,
  });

  if (intentDecision.route === "chat_only") {
    const direct = await chatCompletion({
      model: hasAttachments ? multimodalModel : undefined,
      thinkingLevel,
      fallbacks: ["anthropic/claude-3-haiku"],
      temperature: 0.4,
      maxTokens: 220,
      messages: [
        {
          role: "system",
          content: buildDirectChatInstruction({
            pathname: normalizedPathname,
            isAuthenticated: params.isAuthenticated,
            objective: legacyProfile.assistantObjective,
            responseStyle: legacyProfile.responseStyle,
          }),
        },
        ...DIRECT_CHAT_EXAMPLES,
        ...historyMessages,
        {
          role: "user",
          content: formatUserMessageContent(userText, resolvedAttachments),
        },
      ],
      signal: params.signal,
    });

    if (!direct.success) {
      if (direct.code === "AI_CANCELLED") {
        throw new DOMException("Direct chat completion was cancelled", "AbortError");
      }
      log.error("Direct chat completion failed", {
        pathname: normalizedPathname,
        profile: legacyProfile.id,
        code: direct.code,
        error: direct.error,
      });
      throw new Error("Unable to generate a chat response right now.");
    }
    const directContent = getTextResultContent(direct);
    if (!directContent) {
      throw new Error("Unable to generate a chat response right now.");
    }

    log.debug("Returning direct chat response", {
      conversationId: params.body.conversationId,
      profile: legacyProfile.id,
      responseLength: directContent.length,
      responsePreview: directContent.slice(0, 200),
    });
    return {
      message: createAssistantMessage(normalizeAppLinks(directContent)),
      sources: [],
      retrievalMeta: {
        profile: legacyProfile.id,
        audience: legacyProfile.audience,
        domainTags: legacyProfile.domainTags,
        resultCount: 0,
      },
    };
  }

  if (intentDecision.route === "clarify") {
    const clarify = await chatCompletion({
      model: hasAttachments ? multimodalModel : undefined,
      thinkingLevel,
      fallbacks: ["anthropic/claude-3-haiku"],
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
        ...CLARIFY_EXAMPLES,
        ...historyMessages,
        {
          role: "user",
          content: formatUserMessageContent(userText, resolvedAttachments),
        },
      ],
      signal: params.signal,
    });

    if (!clarify.success) {
      if (clarify.code === "AI_CANCELLED") {
        throw new DOMException("Clarifying chat completion was cancelled", "AbortError");
      }
      log.error("Clarifying chat completion failed", {
        pathname: normalizedPathname,
        profile: legacyProfile.id,
        code: clarify.code,
        error: clarify.error,
      });
      throw new Error("Unable to generate a chat response right now.");
    }
    const clarifyContent = getTextResultContent(clarify);
    if (!clarifyContent) {
      throw new Error("Unable to generate a chat response right now.");
    }

    log.debug("Returning clarifying chat response", {
      conversationId: params.body.conversationId,
      profile: legacyProfile.id,
      responseLength: clarifyContent.length,
      responsePreview: clarifyContent.slice(0, 200),
    });
    return {
      message: createAssistantMessage(normalizeAppLinks(clarifyContent)),
      sources: [],
      retrievalMeta: {
        profile: legacyProfile.id,
        audience: legacyProfile.audience,
        domainTags: legacyProfile.domainTags,
        resultCount: 0,
      },
    };
  }

  const retrievalQuery =
    intentDecision.retrievalQuery ||
    userText ||
    buildAttachmentOnlyRetrievalQuery(
      normalizedPathname, 
      legacyProfile.domainTags, 
      hasVideo ? "video" : "image"
    );
  log.debug("Preparing grounded retrieval", {
    conversationId: params.body.conversationId,
    profile: legacyProfile.id,
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
    audience: legacyProfile.audience,
    domainTags: legacyProfile.domainTags,
    limit: legacyProfile.retrievalLimit,
    freshnessDays: legacyProfile.freshnessDays,
  });

  log.debug("Retrieved knowledge base results for chat", {
    conversationId: params.body.conversationId,
    profile: legacyProfile.id,
    retrievalQuery,
    resultCount: results.length,
    results: summarizeRetrievedChunks(results),
  });

  if (shouldUseWeakRetrievalFallback(results)) {
    if (results.length === 0) {
      log.warn("Using zero-result retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: legacyProfile.id,
        retrievalOutcome: "no_usable_results",
      });
    } else {
      log.warn("Using weak retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: legacyProfile.id,
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
    profile: legacyProfile.id,
    promptResultCount: promptResults.length,
    promptResults: summarizeRetrievedChunks(promptResults),
  });

  const completion = await chatCompletion({
    model: hasAttachments ? multimodalModel : undefined,
    thinkingLevel,
    fallbacks: ["anthropic/claude-3-haiku"],
    temperature: 0.2,
    maxTokens: legacyProfile.maxTokens ?? 450,
      messages: [
      {
        role: "system",
        content: buildSystemInstruction({
          pathname: normalizedPathname,
          isAuthenticated: params.isAuthenticated,
          objective: legacyProfile.assistantObjective,
          responseStyle: legacyProfile.responseStyle,
          weakRetrievalMode: legacyProfile.weakRetrievalMode,
        }),
      },
      ...historyMessages,
      {
        role: "user",
        content: formatUserMessageContent(
          [
            userText
              ? `User question:\n${userText}`
              : `The user shared ${hasVideo ? "a video" : "an image"} without any text. Analyse the ${hasVideo ? "video" : "image"}, describe what you observe, connect it to the P2E Inferno context, and offer relevant assistance.`,
            `Retrieved knowledge:\n${formatRetrievedKnowledge(promptResults)}`,
            "Answer using the retrieved knowledge. If the knowledge is incomplete, say that clearly.",
          ].join("\n\n"),
          resolvedAttachments,
        ),
      },
    ],
    signal: params.signal,
  });

  if (!completion.success) {
    if (completion.code === "AI_CANCELLED") {
      throw new DOMException("Grounded chat completion was cancelled", "AbortError");
    }
    log.error("Model completion failed for chat respond", {
      code: completion.code,
      error: completion.error,
      pathname: params.body.route.pathname,
      profile: legacyProfile.id,
    });
    throw new Error("Unable to generate a grounded response right now.");
  }
  const completionContent = getTextResultContent(completion);
  if (!completionContent) {
    throw new Error("Unable to generate a grounded response right now.");
  }

  log.debug("Returning grounded chat response", {
    conversationId: params.body.conversationId,
    profile: legacyProfile.id,
    sourceCount: promptResults.length,
    responseLength: completionContent.length,
    responsePreview: completionContent.slice(0, 200),
  });
  return {
    message: createAssistantMessage(normalizeAppLinks(completionContent)),
    sources: mapSources(promptResults),
      retrievalMeta: {
      profile: legacyProfile.id,
      audience: legacyProfile.audience,
      domainTags: legacyProfile.domainTags,
      resultCount: results.length,
    },
  };
}
