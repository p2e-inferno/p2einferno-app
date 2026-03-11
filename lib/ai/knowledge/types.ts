// /lib/ai/knowledge/types.ts

// ─── Domain enums ───────────────────────────────────────────────────────────

export type KnowledgeAudience = "support" | "sales" | "social" | "ops";
export type KnowledgeSourceType = "code" | "doc" | "db_snapshot" | "faq" | "playbook";

// ─── Source registry types ──────────────────────────────────────────────────
// Matches the shape of automation/config/ai-kb-sources.json entries.

export interface KnowledgeSourceEntry {
  /** Unique logical path. For repo files: relative path from repo root (e.g. "docs/bootcamp-faq.md").
   *  For DB snapshots: "db:<table_name>" (e.g. "db:bootcamps"). */
  sourcePath: string;
  sourceType: KnowledgeSourceType;
  title: string;
  audience: KnowledgeAudience[];
  domainTags: string[];
  /** Maximum number of days since last ingestion before verify.ts flags as stale.
   *  Recommended: 7 for db_snapshot, 30 for doc/code, 14 for faq/playbook. */
  staleDays: number;
}

export interface KnowledgeSourceRegistry {
  /** Schema version for forward-compatible parsing. Must be "1". */
  schemaVersion: "1";
  sources: KnowledgeSourceEntry[];
}

// ─── Document input (passed to upsert RPC) ──────────────────────────────────

export interface KnowledgeDocumentInput {
  sourceType: KnowledgeSourceType;
  sourcePath: string;
  title: string;
  contentMarkdown: string;
  audience: KnowledgeAudience[];
  domainTags: string[];
  /** Run date as ISO date string (e.g. "2026-03-04"). Used as human-readable
   *  audit label. The content_hash is the primary change-detection mechanism. */
  version: string;
}

// ─── Chunk types ────────────────────────────────────────────────────────────

/** Metadata stored in ai_kb_chunks.metadata JSONB column.
 *  build.ts must populate all required fields before calling the upsert RPC. */
export interface ChunkMetadata {
  /** The embedding model used to generate this chunk's vector.
   *  e.g. "openai/text-embedding-3-small". Stored so verify.ts can detect
   *  model drift across chunks. */
  embedding_model: string;
  /** Section heading from the source document, if applicable. */
  section_heading?: string;
  /** Original source_path of the parent document (denormalized for retrieval convenience). */
  source_path: string;
  /** Source type of the parent document (denormalized). */
  source_type: KnowledgeSourceType;
  /** For db_snapshot sources: the record ID from the source table, if applicable. */
  record_id?: string;
  /** Additional key/value pairs as needed. */
  [key: string]: unknown;
}

export interface KnowledgeChunk {
  chunkIndex: number;
  chunkText: string;
  tokenEstimate: number;
  metadata: ChunkMetadata;
}

// ─── Upsert RPC response ───────────────────────────────────────────────────

export interface UpsertDocumentResult {
  document_id: string;
  chunks_written: number;
  was_updated: boolean;
}

// ─── Search result types ────────────────────────────────────────────────────

export interface HybridSearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  chunkText: string;
  metadata: ChunkMetadata;
  rank: number;
  keywordRank: number;
  semanticRank: number;
}

// ─── Ingestion run stats ────────────────────────────────────────────────────
// Stored in ai_kb_ingestion_runs.stats JSONB column.

export interface IngestionRunStats {
  total_sources: number;
  documents_inserted: number;
  documents_updated: number;
  documents_unchanged: number;
  documents_deactivated: number;
  chunks_written: number;
  embedding_model: string;
  /** source_paths that failed during this run, with error messages. */
  failed_sources: Array<{ sourcePath: string; error: string }>;
  /** source_path of the last successfully processed document
   *  (for resumability context on failed runs). */
  last_processed_source: string | null;
}
