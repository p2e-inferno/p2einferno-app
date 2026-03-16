import type { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import type { ChatSourceReference } from "@/lib/chat/types";

type RetrievedChunk = Awaited<ReturnType<typeof searchKnowledgeBase>>[number];

const MIN_STRONG_RESULT_RANK = 0.15;
const MIN_STRONG_SEMANTIC_RANK = 0.15;
const MIN_VERY_STRONG_RESULT_RANK = 0.35;
const MIN_VERY_STRONG_SEMANTIC_RANK = 0.35;
const CONFLICT_RANK_GAP = 0.03;
const MAX_PROMPT_RESULTS = 4;
const MAX_TRAILING_RESULT_DROP_FROM_TOP = 0.12;

export interface ToolSearchResult {
  title: string;
  sourcePath: string | null;
  sectionHeading: string | null;
  chunkText: string;
  rank: number;
  semanticRank: number;
  keywordRank: number;
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

export function areResultsMeaningfullyConflicting(
  results: RetrievedChunk[],
): boolean {
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

export function shouldUseWeakRetrievalFallback(results: RetrievedChunk[]): boolean {
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

export function filterResultsForPrompt(
  results: RetrievedChunk[],
): RetrievedChunk[] {
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

export function buildAttachmentOnlyRetrievalQuery(
  pathname: string,
  domainTags: string[],
  mediaType: "image" | "video" = "image",
): string {
  const tags = domainTags.slice(0, 3).join(", ");
  return `Help request for ${pathname}${tags ? ` about ${tags}` : ""} based on an attached ${mediaType}.`;
}

export function formatRetrievedKnowledge(chunks: RetrievedChunk[]): string {
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

export function mapSources(chunks: RetrievedChunk[]): ChatSourceReference[] {
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

export function mapToolResultSources(results: ToolSearchResult[]) {
  const uniqueSources = new Map<string, ChatSourceReference>();

  for (const result of results) {
    const key = result.sourcePath ?? result.title;

    if (!uniqueSources.has(key)) {
      uniqueSources.set(key, {
        id: key,
        title: result.title,
        href:
          result.sourcePath && /^https?:\/\//i.test(result.sourcePath)
            ? result.sourcePath
            : undefined,
      });
    }
  }

  return [...uniqueSources.values()];
}

export function mapChunksToToolResults(
  chunks: RetrievedChunk[],
): ToolSearchResult[] {
  return chunks.map((chunk) => ({
    title: chunk.title,
    sourcePath:
      typeof chunk.metadata?.source_path === "string"
        ? chunk.metadata.source_path
        : null,
    sectionHeading:
      typeof chunk.metadata?.section_heading === "string"
        ? chunk.metadata.section_heading
        : null,
    chunkText: chunk.chunk_text,
    rank: chunk.rank,
    semanticRank: chunk.semantic_rank,
    keywordRank: chunk.keyword_rank,
  }));
}
