import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import type { ServerChatRouteProfile } from "@/lib/chat/server/respond-types";
import {
  filterResultsForPrompt,
  mapChunksToToolResults,
  shouldUseWeakRetrievalFallback,
} from "@/lib/chat/server/respond-kb-utils";
import { SEARCH_KNOWLEDGE_BASE_TOOL_NAME } from "@/lib/chat/server/tools/search-knowledge-base-tool";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:tool-executor");
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 5;
const MAX_QUERY_LENGTH = 500;

interface ExecuteChatToolParams {
  toolName: string;
  rawArguments: string;
  routeProfile: ServerChatRouteProfile;
}

export interface ExecutedToolResult {
  toolName: string;
  content: string;
  normalizedQuery?: string;
  sourceCount: number;
}

function stringifyToolResult(payload: Record<string, unknown>) {
  return JSON.stringify(payload);
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function parseToolArguments(rawArguments: string) {
  try {
    if (!rawArguments.trim()) {
      return { ok: false as const, error: "Tool arguments are empty." };
    }

    const parsed = JSON.parse(rawArguments) as Record<string, unknown>;
    return { ok: true as const, value: parsed };
  } catch {
    return { ok: false as const, error: "Tool arguments are not valid JSON." };
  }
}

export async function executeChatTool(
  params: ExecuteChatToolParams,
): Promise<ExecutedToolResult> {
  if (params.toolName !== SEARCH_KNOWLEDGE_BASE_TOOL_NAME) {
    return {
      toolName: params.toolName,
      content: stringifyToolResult({
        ok: false,
        code: "unknown_tool",
        error: `Unknown tool: ${params.toolName}`,
      }),
      sourceCount: 0,
    };
  }

  const parsed = parseToolArguments(params.rawArguments);
  if (!parsed.ok) {
    return {
      toolName: params.toolName,
      content: stringifyToolResult({
        ok: false,
        code: "malformed_arguments",
        error: parsed.error,
      }),
      sourceCount: 0,
    };
  }

  const query =
    typeof parsed.value.query === "string"
      ? normalizeQuery(parsed.value.query)
      : "";
  const limitCandidate =
    typeof parsed.value.limit === "number" && Number.isFinite(parsed.value.limit)
      ? Math.trunc(parsed.value.limit)
      : DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitCandidate || DEFAULT_LIMIT));

  if (!query) {
    return {
      toolName: params.toolName,
      content: stringifyToolResult({
        ok: false,
        code: "empty_query",
        error: "A non-empty query is required.",
      }),
      sourceCount: 0,
    };
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return {
      toolName: params.toolName,
      content: stringifyToolResult({
        ok: false,
        code: "query_too_long",
        error: `Query must be at most ${MAX_QUERY_LENGTH} characters.`,
      }),
      normalizedQuery: query.slice(0, MAX_QUERY_LENGTH),
      sourceCount: 0,
    };
  }

  try {
    const [queryEmbedding] = await embedTexts([query]);
    if (!queryEmbedding) {
      return {
        toolName: params.toolName,
        content: stringifyToolResult({
          ok: false,
          code: "embedding_failed",
          error: "Embedding generation returned no vectors.",
        }),
        normalizedQuery: query,
        sourceCount: 0,
      };
    }

    const results = await searchKnowledgeBase({
      queryText: query,
      queryEmbedding,
      audience: params.routeProfile.audience,
      domainTags: params.routeProfile.domainTags,
      limit: Math.min(limit, params.routeProfile.retrievalLimit),
      freshnessDays: params.routeProfile.freshnessDays,
    });
    const filteredResults = filterResultsForPrompt(results);
    const weak = shouldUseWeakRetrievalFallback(results);
    const mappedResults = mapChunksToToolResults(filteredResults);

    log.debug("Executed knowledge-base tool", {
      toolName: params.toolName,
      query,
      limit,
      profileId: params.routeProfile.id,
      audience: params.routeProfile.audience,
      domainTags: params.routeProfile.domainTags,
      resultCount: results.length,
      promptResultCount: filteredResults.length,
      weak,
    });

    return {
      toolName: params.toolName,
      normalizedQuery: query,
      sourceCount: mappedResults.length,
      content: stringifyToolResult({
        ok: true,
        results: mappedResults,
        weak,
        profileId: params.routeProfile.id,
        appliedAudience: params.routeProfile.audience,
        appliedDomainTags: params.routeProfile.domainTags,
        normalizedQuery: query,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool error";
    log.warn("Knowledge-base tool execution failed", {
      toolName: params.toolName,
      query,
      profileId: params.routeProfile.id,
      error: message,
    });

    return {
      toolName: params.toolName,
      normalizedQuery: query,
      sourceCount: 0,
      content: stringifyToolResult({
        ok: false,
        code: "tool_execution_failed",
        error: message,
        normalizedQuery: query,
      }),
    };
  }
}
