import { chatCompletion } from "@/lib/ai/client";
import type { AIConversationMessage } from "@/lib/ai/types";
import {
  mapToolResultSources,
  type ToolSearchResult,
} from "@/lib/chat/server/respond-kb-utils";
import type { ServerChatRouteProfile } from "@/lib/chat/server/respond-types";
import { executeChatTool } from "@/lib/chat/server/tools/execute-chat-tool";
import { searchKnowledgeBaseToolDefinition } from "@/lib/chat/server/tools/search-knowledge-base-tool";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:agent-loop");
const MAX_ITERATIONS = 3;
const DEFAULT_AGENT_LOOP_TIMEOUT_MS = 30_000;

export interface RunChatAgentLoopParams {
  messages: AIConversationMessage[];
  routeProfile: ServerChatRouteProfile;
  model?: string;
  fallbacks?: string[];
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ChatAgentLoopResult {
  content: string;
  sources: ReturnType<typeof mapToolResultSources>;
  usedToolCalls: boolean;
  iterations: number;
  stopReason:
    | "final_answer"
    | "max_iterations"
    | "duplicate_query"
    | "malformed_arguments"
    | "tool_execution_error";
}

function parseToolPayload(content: string): {
  ok: boolean;
  code?: string;
  results: ToolSearchResult[];
} | null {
  try {
    const parsed = JSON.parse(content) as {
      ok?: boolean;
      code?: string;
      results?: ToolSearchResult[];
    };

    return {
      ok: parsed.ok !== false,
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch {
    return null;
  }
}

function getAgentLoopTimeoutMs(explicitTimeoutMs?: number) {
  if (typeof explicitTimeoutMs === "number" && explicitTimeoutMs > 0) {
    return explicitTimeoutMs;
  }

  const raw = process.env.CHAT_AGENT_LOOP_TIMEOUT_MS;
  const parsed = typeof raw === "string" && raw.trim() ? Number(raw) : NaN;

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AGENT_LOOP_TIMEOUT_MS;
}

function createAbortError(message: string) {
  return new DOMException(message, "AbortError");
}

export async function runChatAgentLoop(
  params: RunChatAgentLoopParams,
): Promise<ChatAgentLoopResult> {
  const conversation = [...params.messages];
  const seenQueries = new Set<string>();
  const accumulatedResults: ToolSearchResult[] = [];
  let usedToolCalls = false;
  let stopReason: ChatAgentLoopResult["stopReason"] = "final_answer";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, getAgentLoopTimeoutMs(params.timeoutMs));
  const externalSignal = params.signal;
  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      if (controller.signal.aborted) {
        throw createAbortError("Chat agent loop was cancelled");
      }

      const completion = await chatCompletion({
        model: params.model,
        fallbacks: params.fallbacks,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        thinkingLevel: params.thinkingLevel,
        tools: [searchKnowledgeBaseToolDefinition],
        toolChoice: "auto",
        parallelToolCalls: false,
        messages: conversation,
        signal: controller.signal,
      });

      if (!completion.success) {
        if (completion.code === "AI_CANCELLED") {
          throw createAbortError("Chat agent loop was cancelled");
        }

        throw new Error(completion.error);
      }

      if (
        completion.finishReason !== "tool_calls" ||
        !("toolCalls" in completion) ||
        completion.toolCalls.length === 0
      ) {
        if (!("content" in completion)) {
          throw new Error("AI returned an unexpected non-text response");
        }

        return {
          content: completion.content,
          sources: mapToolResultSources(accumulatedResults),
          usedToolCalls,
          iterations: iteration + 1,
          stopReason,
        };
      }

      usedToolCalls = true;
      if (!("assistantMessage" in completion) || !("toolCalls" in completion)) {
        throw new Error("AI returned incomplete tool-call payload");
      }
      conversation.push(completion.assistantMessage);

      let malformedArgumentsSeen = false;
      for (const toolCall of completion.toolCalls) {
        if (controller.signal.aborted) {
          throw createAbortError("Chat agent loop was cancelled");
        }

        const executed = await executeChatTool({
          toolName: toolCall.function.name,
          rawArguments: toolCall.function.arguments,
          routeProfile: params.routeProfile,
        });

        if (executed.normalizedQuery) {
          const dedupeKey = executed.normalizedQuery.toLowerCase();
          if (seenQueries.has(dedupeKey)) {
            log.debug("Suppressing duplicate tool query", {
              query: executed.normalizedQuery,
              profileId: params.routeProfile.id,
              iteration: iteration + 1,
            });
            stopReason = "duplicate_query";
            return {
              content:
                "I couldn't confirm anything new from the knowledge I searched. Share the exact page, status, or error you see and I'll narrow the next step.",
              sources: mapToolResultSources(accumulatedResults),
              usedToolCalls,
              iterations: iteration + 1,
              stopReason,
            };
          }
          seenQueries.add(dedupeKey);
        }

        const parsedPayload = parseToolPayload(executed.content);
        if (parsedPayload) {
          accumulatedResults.push(...parsedPayload.results);
          if (!parsedPayload.ok) {
            if (parsedPayload.code === "malformed_arguments") {
              malformedArgumentsSeen = true;
            } else {
              stopReason = "tool_execution_error";
            }
          }
        }

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: executed.content,
        });
      }

      if (malformedArgumentsSeen) {
        stopReason = "malformed_arguments";
      }
    }
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }

  if (stopReason === "final_answer") {
    stopReason = "max_iterations";
  }
  return {
    content:
      "I reached the limit of what I could confirm from the current knowledge. Share the exact page, status, or error you see and I'll narrow the next safe step.",
    sources: mapToolResultSources(accumulatedResults),
    usedToolCalls,
    iterations: MAX_ITERATIONS,
    stopReason,
  };
}
