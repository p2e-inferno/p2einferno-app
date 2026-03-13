import { chatCompletion } from "@/lib/ai/client";
import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import type { ChatMessage as AIChatMessage } from "@/lib/ai/types";
import {
  getChatAttachmentPayloadSize,
  validateChatAttachmentPayload,
} from "@/lib/chat/attachment-validation";
import { CHAT_ATTACHMENT_LIMITS } from "@/lib/chat/constants";
import {
  normalizeChatRoutePathname,
  resolveServerChatRouteProfile,
} from "@/lib/chat/server/respond-route-profile";
import type {
  ChatRespondRequestBody,
  ChatRespondResponseBody,
  ServerChatRouteProfileId,
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
const MIN_STRONG_RESULT_RANK = 0.7;
const MIN_STRONG_SEMANTIC_RANK = 0.7;
const MIN_VERY_STRONG_RESULT_RANK = 0.82;
const MIN_VERY_STRONG_SEMANTIC_RANK = 0.82;
const CONFLICT_RANK_GAP = 0.03;
const MAX_PROMPT_RESULTS = 4;
const MAX_TRAILING_RESULT_DROP_FROM_TOP = 0.12;
const GREETING_PATTERN =
  /^(?:hi|hello|hey|yo|sup|what'?s up|good (?:morning|afternoon|evening)|howdy)\b[!. ]*$/i;
const THANKS_PATTERN = /^(?:thanks|thank you|thx|ty)\b[!. ]*$/i;
const ACK_PATTERN = /^(?:ok|okay|cool|got it|sounds good|nice)\b[!. ]*$/i;

type RetrievedChunk = Awaited<ReturnType<typeof searchKnowledgeBase>>[number];

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

function formatHistoryMessages(
  messages: Array<Pick<ChatMessage, "role" | "content" | "attachments">>,
  latestUserText: string,
  latestAttachments: ChatAttachment[] = [],
): AIChatMessage[] {
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

  const budgetedRecent = selectHistoryMessagesWithinBudget(normalizedRecent);

  return budgetedRecent.map((message) => {
    if (message.role === "assistant") {
      return {
        role: message.role,
        content: truncateHistoryContent(message.content),
      };
    }

    return {
      role: message.role,
      content: formatUserMessageContent(
        truncateHistoryContent(message.content),
        message.attachments,
      ),
    };
  });
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
) {
  const tags = domainTags.slice(0, 3).join(", ");
  return `Help request for ${pathname}${tags ? ` about ${tags}` : ""} based on an attached image.`;
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
        "The user shared image(s) and wants help based on what is shown.",
    },
    ...normalizedAttachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: {
        url: attachment.data,
      },
    })),
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

function detectLightweightIntent(userText: string) {
  const normalized = userText.trim();

  if (!normalized) {
    return null;
  }

  if (GREETING_PATTERN.test(normalized)) {
    return "greeting" as const;
  }

  if (THANKS_PATTERN.test(normalized)) {
    return "thanks" as const;
  }

  if (ACK_PATTERN.test(normalized)) {
    return "ack" as const;
  }

  return null;
}

function buildLightweightReply(params: {
  intent: "greeting" | "thanks" | "ack";
  profileId: ServerChatRouteProfileId;
}) {
  const routeHintByProfile: Record<ServerChatRouteProfileId, string> = {
    home_sales:
      "I can explain what P2E Inferno is, how it works, and where to start.",
    general_support:
      "I can help you understand what this page does and what to try next.",
    lobby_support:
      "I can help you get oriented, find quests or bootcamps, and figure out the next useful step.",
    quest_support:
      "I can help you choose a quest, understand requirements, or troubleshoot progress blockers.",
    bootcamp_support:
      "I can help you understand applications, cohorts, milestones, and next steps here.",
    vendor_support:
      "I can help you understand vendor progression, renewal, and related wallet or membership steps.",
  };

  if (params.intent === "thanks") {
    return "You’re welcome. If you want, tell me what you’re trying to do and I’ll help with the next step.";
  }

  if (params.intent === "ack") {
    return "Alright. Tell me what you want to do here and I’ll guide you.";
  }

  return `Hey 👋 ${routeHintByProfile[params.profileId]}`;
}

export async function generateChatResponse(params: {
  body: ChatRespondRequestBody;
  isAuthenticated: boolean;
}): Promise<ChatRespondResponseBody> {
  const normalizedPathname = normalizeChatRoutePathname(
    params.body.route.pathname,
  );
  const profile = resolveServerChatRouteProfile(normalizedPathname, {
    isAuthenticated: params.isAuthenticated,
  });
  const userText = params.body.message.trim();
  const lightweightIntent = detectLightweightIntent(userText);

  if (lightweightIntent && (!params.body.attachments || params.body.attachments.length === 0)) {
    return {
      message: createAssistantMessage(
        buildLightweightReply({
          intent: lightweightIntent,
          profileId: profile.id,
        }),
      ),
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
    userText ||
    buildAttachmentOnlyRetrievalQuery(normalizedPathname, profile.domainTags);
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

  if (shouldUseWeakRetrievalFallback(results)) {
    if (results.length === 0) {
      log.warn("Using zero-result retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: profile.id,
        retrievalOutcome: "no_usable_results",
      });
    }

    if (results.length > 0) {
      log.warn("Using weak retrieval fallback for chat response", {
        pathname: normalizedPathname,
        profile: profile.id,
        topRank: results[0]?.rank ?? null,
        topSemanticRank: results[0]?.semantic_rank ?? null,
        conflicting: areResultsMeaningfullyConflicting(results),
        resultCount: results.length,
      });
    }

    return {
      message: createAssistantMessage(profile.weakRetrievalReply),
      sources: [],
      retrievalMeta: {
        profile: profile.id,
        audience: profile.audience,
        domainTags: profile.domainTags,
        resultCount: results.length,
      },
    };
  }

  const promptResults = filterResultsForPrompt(results);

  const completion = await chatCompletion({
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
      ...formatHistoryMessages(
        params.body.messages,
        userText,
        params.body.attachments,
      ),
      {
        role: "user",
        content: formatUserMessageContent(
          [
            userText ? `User question:\n${userText}` : "The user did not send text.",
            `Retrieved knowledge:\n${formatRetrievedKnowledge(promptResults)}`,
            "Answer using the retrieved knowledge. If the knowledge is incomplete, say that clearly.",
          ].join("\n\n"),
          params.body.attachments,
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

  return {
    message: createAssistantMessage(completion.content),
    sources: mapSources(promptResults),
    retrievalMeta: {
      profile: profile.id,
      audience: profile.audience,
      domainTags: profile.domainTags,
      resultCount: results.length,
    },
  };
}
