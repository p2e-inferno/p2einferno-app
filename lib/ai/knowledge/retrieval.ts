// /lib/ai/knowledge/retrieval.ts
// Server-only — never import from client components.

import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ai:kb:retrieval");

function summarizeResults(results: SearchAiKbChunkRow[]) {
  return results.slice(0, 5).map((row, index) => ({
    index,
    title: row.title,
    documentId: row.document_id,
    sourcePath:
      typeof row.metadata?.source_path === "string"
        ? row.metadata.source_path
        : null,
    rank: row.rank,
    semanticRank: row.semantic_rank,
    keywordRank: row.keyword_rank,
    chunkLength: row.chunk_text.length,
    chunkPreview: row.chunk_text.slice(0, 160),
  }));
}

interface SearchAiKbChunkRow {
  chunk_id: string;
  document_id: string;
  title: string;
  chunk_text: string;
  metadata: Record<string, unknown>;
  rank: number;
  keyword_rank: number;
  semantic_rank: number;
}

export async function searchKnowledgeBase(params: {
  queryText: string;
  queryEmbedding: number[];
  audience?: string[];
  domainTags?: string[];
  limit?: number;
  freshnessDays?: number;
}) {
  const supabase = createAdminClient();
  log.debug("Searching knowledge base", {
    queryText: params.queryText,
    queryLength: params.queryText.length,
    embeddingDimensions: params.queryEmbedding.length,
    audience: params.audience ?? null,
    domainTags: params.domainTags ?? null,
    limit: params.limit ?? 8,
    freshnessDays: params.freshnessDays ?? null,
  });
  const { data, error } = await supabase.rpc("search_ai_kb_chunks", {
    query_text: params.queryText,
    query_embedding: params.queryEmbedding,
    audience_filter: params.audience ?? null,
    domain_filter: params.domainTags ?? null,
    limit_count: params.limit ?? 8,
  });

  if (error) {
    log.error("search rpc failed", { err: error.message });
    throw error;
  }

  const results = (data ?? []) as SearchAiKbChunkRow[];
  log.debug("Knowledge base search returned", {
    resultCount: results.length,
    topResults: summarizeResults(results),
  });
  if (params.freshnessDays === undefined || results.length === 0) {
    return results;
  }

  const cutoffMs = Date.now() - params.freshnessDays * 24 * 60 * 60 * 1000;
  const documentIds = [...new Set(results.map((row) => row.document_id))];
  const { data: documents, error: documentsError } = await supabase
    .from("ai_kb_documents")
    .select("id, last_reviewed_at")
    .in("id", documentIds);

  if (documentsError) {
    log.error("freshness lookup failed", { err: documentsError.message });
    throw documentsError;
  }

  const freshDocumentIds = new Set(
    (documents ?? [])
      .filter((document) => {
        if (!document.last_reviewed_at) {
          return false;
        }
        return new Date(document.last_reviewed_at).getTime() >= cutoffMs;
      })
      .map((document) => document.id),
  );

  const filteredResults = results.filter((row) =>
    freshDocumentIds.has(row.document_id),
  );

  log.debug("Applied freshness filter to KB results", {
    freshnessDays: params.freshnessDays,
    initialResultCount: results.length,
    filteredResultCount: filteredResults.length,
    topResults: summarizeResults(filteredResults),
  });

  if (results.length > 0 && filteredResults.length === 0) {
    log.warn("freshness filtering removed all KB results", {
      retrievalOutcome: "freshness_collapse",
      queryText: params.queryText,
      audience: params.audience ?? null,
      domainTags: params.domainTags ?? null,
      freshnessDays: params.freshnessDays,
      initialResultCount: results.length,
    });
  }

  return filteredResults;
}
