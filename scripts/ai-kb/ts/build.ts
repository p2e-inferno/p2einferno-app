/**
 * AI Knowledge Base — Build Pipeline
 *
 * Reads MCP-exported JSONL files, chunks content, generates embeddings,
 * and upserts documents + chunks via the atomic RPC.
 *
 * Usage:
 *   ts-node scripts/ai-kb/build.ts --mode full
 *   ts-node scripts/ai-kb/build.ts --mode incremental
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabase/server";
import { loadSourceRegistry } from "@/lib/ai/knowledge/sources";
import { chunkMarkdown } from "@/lib/ai/knowledge/chunking";
import { embedTexts, getEmbeddingModel } from "@/lib/ai/knowledge/embeddings";
import { getLogger } from "@/lib/utils/logger";
import type {
  IngestionRunStats,
  UpsertDocumentResult,
} from "@/lib/ai/knowledge/types";

const RAW_DIR = resolve(process.cwd(), "automation/data/ai-kb/raw");
export const EXPECTED_EMBEDDING_DIM = 1536;
const log = getLogger("scripts:ai-kb:build");

export function parseModeFromArgv(argv: string[]): "full" | "incremental" {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  if (modeArg) {
    const value = modeArg.slice("--mode=".length);
    if (value === "full" || value === "incremental") {
      return value;
    }
  }

  const modeFlagIndex = argv.indexOf("--mode");
  if (modeFlagIndex !== -1) {
    const value = argv[modeFlagIndex + 1];
    if (value === "full" || value === "incremental") {
      return value;
    }
  }

  return "full";
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface JsonlRecord {
  sourcePath: string;
  title: string;
  content: string;
  recordId?: string;
}

interface JsonlLoadResult {
  exists: boolean;
  records: JsonlRecord[];
}

function loadJsonlForSource(sourcePath: string): JsonlLoadResult {
  // Determine JSONL file path based on source path convention
  // db:bootcamps -> automation/data/ai-kb/raw/db/bootcamps.jsonl
  // docs/bootcamp-faq.md -> automation/data/ai-kb/raw/docs/bootcamp-faq.md.jsonl
  let jsonlPath: string;
  if (sourcePath.startsWith("db:")) {
    const tableName = sourcePath.slice(3);
    jsonlPath = resolve(RAW_DIR, "db", `${tableName}.jsonl`);
  } else {
    jsonlPath = resolve(RAW_DIR, "docs", `${sourcePath.replace(/\//g, "_")}.jsonl`);
  }

  if (!existsSync(jsonlPath)) {
    // Try alternative: flattened filename
    const altPath = resolve(RAW_DIR, "docs", `${sourcePath.split("/").pop()}.jsonl`);
    if (existsSync(altPath)) {
      jsonlPath = altPath;
    } else {
      return { exists: false, records: [] };
    }
  }

  const raw = readFileSync(jsonlPath, "utf-8");
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  const records: JsonlRecord[] = [];

  let parseErrors = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    try {
      const parsed = JSON.parse(line) as JsonlRecord;
      if (parsed.sourcePath && parsed.title && parsed.content) {
        records.push(parsed);
      }
    } catch (err) {
      parseErrors++;
      log.warn(`JSONL parse error at line ${i + 1}`, {
        error: err instanceof Error ? err.message : String(err),
        path: jsonlPath,
      });
    }
  }
  if (parseErrors > 0) {
    log.warn(`${parseErrors} JSONL line(s) skipped due to parse errors`, { path: jsonlPath });
  }

  return { exists: true, records };
}

// ─── Exported helpers for testability ──────────────────────────────────────

type SupabaseAdmin = {
  rpc: (...args: any[]) => any;
  from: (...args: any[]) => any;
};

export interface AcquireLockResult {
  status: "acquired" | "blocked";
  run_id: string | null;
  blocking_run_id: string | null;
  stale_cleared: boolean;
}

/**
 * Atomically acquires the ingestion lock via a single RPC call.
 * Eliminates the TOCTOU race between checking for active runs and
 * inserting a new one — both happen inside one PL/pgSQL transaction
 * with row-level locking (SELECT ... FOR UPDATE SKIP LOCKED).
 *
 * Returns the lock result: 'acquired' with a new run_id, or 'blocked'
 * with the blocking_run_id.
 */
export async function acquireIngestionLock(
  supabase: SupabaseAdmin,
  runType: "full" | "incremental",
): Promise<AcquireLockResult> {
  const { data, error } = await supabase.rpc("acquire_ingestion_lock", {
    p_run_type: runType,
    p_stale_threshold_min: 60,
  });

  if (error) {
    throw new Error(`acquire_ingestion_lock RPC failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("acquire_ingestion_lock returned no data");
  }

  return row as AcquireLockResult;
}

export function computeFinalStatus(stats: IngestionRunStats): {
  status: "completed" | "failed";
  errorMessage: string | null;
} {
  const failedCount = stats.failed_sources.length;
  const failedThreshold = stats.total_sources * 0.5;

  if (failedCount > failedThreshold) {
    return {
      status: "failed",
      errorMessage: `Run failed: ${failedCount}/${stats.total_sources} sources failed (>50% threshold)`,
    };
  }

  return {
    status: "completed",
    errorMessage:
      failedCount > 0
        ? `${failedCount} source(s) failed: ${stats.failed_sources.map((f) => f.sourcePath).join(", ")}`
        : null,
  };
}

export const MIN_CHUNK_LENGTH = 100;

/**
 * Filters chunks, keeping only those with chunkText >= MIN_CHUNK_LENGTH.
 * Returns the filtered array. If zero valid chunks remain, the caller
 * should treat the source as failed (empty content before DB insert).
 */
export function filterValidChunks<T extends { chunkText: string }>(
  chunks: T[],
): T[] {
  return chunks.filter((c) => c.chunkText.length >= MIN_CHUNK_LENGTH);
}

export function validateEmbeddingDimensions(
  embeddings: number[][],
  expected: number,
): void {
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (!embedding || embedding.length !== expected) {
      throw new Error(
        `Embedding dimension mismatch for chunk ${i}: expected ${expected}, got ${embedding?.length ?? 0}`,
      );
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function main() {
  const mode = parseModeFromArgv(process.argv);
  log.info(`=== AI KB Build (${mode}) ===`);

  const supabase = createAdminClient();
  const embeddingModel = getEmbeddingModel();
  log.info(`Embedding model: ${embeddingModel}`);

  // ─── Step 0+1: Atomic concurrency check + run creation ─────────────────
  log.info("Step 0: Acquiring ingestion lock...");

  const lock = await acquireIngestionLock(supabase, mode);
  if (lock.status === "blocked") {
    log.warn(
      `Another ingestion run is in progress (run ${lock.blocking_run_id}), exiting.`,
    );
    process.exit(0);
  }
  if (lock.stale_cleared) {
    log.warn("Stale run marked as failed before acquiring lock.");
  }

  const runId = lock.run_id!;
  log.info(`Lock acquired. Run ID: ${runId}`);

  const stats: IngestionRunStats = {
    total_sources: 0,
    documents_inserted: 0,
    documents_updated: 0,
    documents_unchanged: 0,
    documents_deactivated: 0,
    chunks_written: 0,
    embedding_model: embeddingModel,
    failed_sources: [],
    last_processed_source: null,
  };
  let pipelineError: string | null = null;

  try {
  // ─── Step 2: Load registry ──────────────────────────────────────────────
  log.info("Step 2: Loading source registry...");
  const registry = loadSourceRegistry();
  log.info(`${registry.sources.length} source(s) registered.`);

  // ─── Step 3: Process each source ────────────────────────────────────────
  log.info("Step 3: Processing sources...");
  stats.total_sources = registry.sources.length;

  for (const entry of registry.sources) {
    log.info(`Processing: ${entry.sourcePath}`);

    try {
      const { data: existingDoc, error: existingDocError } = await supabase
        .from("ai_kb_documents")
        .select("id, content_hash")
        .eq("source_path", entry.sourcePath)
        .maybeSingle();

      if (existingDocError) {
        throw new Error(`Existing document lookup failed: ${existingDocError.message}`);
      }

      // 3.1: Read JSONL data
      const { exists: jsonlExists, records } = loadJsonlForSource(entry.sourcePath);
      if (records.length === 0) {
        if (entry.sourceType === "db_snapshot" && jsonlExists) {
          log.info(`Empty db_snapshot for "${entry.sourcePath}", skipping without failure.`);
          stats.last_processed_source = entry.sourcePath;
          continue;
        }

        log.warn(`No JSONL data found for "${entry.sourcePath}", skipping.`);
        stats.failed_sources.push({
          sourcePath: entry.sourcePath,
          error: "No JSONL data found",
        });
        continue;
      }

      // For db_snapshot sources, combine all records into one document
      let contentMarkdown: string;
      let extraMetadata: Record<string, unknown> = {};

      if (entry.sourceType === "db_snapshot") {
        // Combine all records into a single markdown document
        const parts = records.map((r) => {
          const recordContent = r.content;
          return r.recordId
            ? `### Record: ${r.recordId}\n${recordContent}`
            : recordContent;
        });
        contentMarkdown = `# ${entry.title}\n\n${parts.join("\n\n")}`;
      } else {
        // For non-db sources, use the first record's content
        const firstRecord = records[0];
        if (!firstRecord) {
          throw new Error(`No JSONL record found for "${entry.sourcePath}"`);
        }
        contentMarkdown = firstRecord.content;
        if (firstRecord.recordId) {
          extraMetadata.record_id = firstRecord.recordId;
        }
      }

      // 3.2: Compute content hash
      const contentHash = sha256(contentMarkdown);

      // 3.3: In incremental mode, check if content has changed
      if (mode === "incremental") {
        if (existingDoc && existingDoc.content_hash === contentHash) {
          log.info("Content unchanged, stamping freshness.");
          // Still call upsert RPC to stamp last_reviewed_at and ingestion_run_id
          const { error: upsertErr } = await supabase.rpc(
            "upsert_kb_document_with_chunks",
            {
              p_source_type: entry.sourceType,
              p_source_path: entry.sourcePath,
              p_title: entry.title,
              p_content_markdown: contentMarkdown,
              p_audience: entry.audience,
              p_domain_tags: entry.domainTags,
              p_content_hash: contentHash,
              p_version: new Date().toISOString().slice(0, 10),
              p_ingestion_run_id: runId,
              p_chunks: [],
            },
          );
          if (upsertErr) {
            throw new Error(`Upsert RPC failed: ${upsertErr.message}`);
          }
          stats.documents_unchanged++;
          stats.last_processed_source = entry.sourcePath;
          continue;
        }
      }

      // 3.4: Chunk the content
      const chunks = chunkMarkdown({
        contentMarkdown,
        sourcePath: entry.sourcePath,
        sourceType: entry.sourceType,
        extraMetadata,
      });

      // 3.5: Filter out short chunks (already done by chunkMarkdown, but defence in depth)
      const validChunks = filterValidChunks(chunks);
      if (validChunks.length === 0) {
        log.warn(`No valid chunks produced for "${entry.sourcePath}".`);
        stats.failed_sources.push({
          sourcePath: entry.sourcePath,
          error: "No valid chunks (all below 100 chars)",
        });
        continue;
      }

      // 3.6: Embed all chunk texts
      log.info(`Embedding ${validChunks.length} chunk(s)...`);
      const chunkTexts = validChunks.map((c) => c.chunkText);
      const embeddings = await embedTexts(chunkTexts);
      if (embeddings.length !== validChunks.length) {
        throw new Error(
          `Embedding count mismatch: expected ${validChunks.length}, got ${embeddings.length}`,
        );
      }

      // Validate embedding dimensions
      validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM);

      // 3.7-3.8: Build p_chunks JSONB array with metadata
      const pChunks = validChunks.map((chunk, i) => ({
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.chunkText,
        token_estimate: chunk.tokenEstimate,
        embedding: embeddings[i]!,
        metadata: {
          ...chunk.metadata,
          embedding_model: embeddingModel,
        },
      }));

      // 3.9: Call upsert RPC
      log.info(`Upserting document + ${pChunks.length} chunk(s)...`);
      const { data: upsertResult, error: upsertError } = await supabase.rpc(
        "upsert_kb_document_with_chunks",
        {
          p_source_type: entry.sourceType,
          p_source_path: entry.sourcePath,
          p_title: entry.title,
          p_content_markdown: contentMarkdown,
          p_audience: entry.audience,
          p_domain_tags: entry.domainTags,
          p_content_hash: contentHash,
          p_version: new Date().toISOString().slice(0, 10),
          p_ingestion_run_id: runId,
          p_chunks: pChunks,
        },
      );

      if (upsertError) {
        throw new Error(`Upsert RPC failed: ${upsertError.message}`);
      }

      // 3.10: Record result in stats
      const result = (upsertResult as UpsertDocumentResult[])?.[0];
      if (result) {
        if (result.was_updated) {
          if (existingDoc) {
            stats.documents_updated++;
          } else {
            stats.documents_inserted++;
          }
          stats.chunks_written += result.chunks_written;
        } else {
          stats.documents_unchanged++;
        }
      }

      stats.last_processed_source = entry.sourcePath;
      log.info(
        `    ✓ Done (updated: ${result?.was_updated ?? false}, chunks: ${result?.chunks_written ?? 0})`,
      );
    } catch (err) {
      // 3.11: Per-document failure — log and continue
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error(`Failed processing "${entry.sourcePath}"`, { error: errorMsg });
      stats.failed_sources.push({
        sourcePath: entry.sourcePath,
        error: errorMsg,
      });
    }
  }

  // ─── Step 4: Deactivate missing sources ─────────────────────────────────
  log.info("Step 4: Deactivating orphaned documents...");

  const registryPaths = registry.sources.map((s) => s.sourcePath);
  const { data: activeDocs, error: activeDocsError } = await supabase
    .from("ai_kb_documents")
    .select("id, source_path")
    .eq("is_active", true);

  if (activeDocsError) {
    throw new Error(`Failed to fetch active documents: ${activeDocsError.message}`);
  }

  if (activeDocs) {
    const orphaned = activeDocs.filter(
      (d: { source_path: string }) => !registryPaths.includes(d.source_path),
    );
    if (orphaned.length > 0) {
      const orphanedIds = orphaned.map((d: { id: string }) => d.id);
      const { error: deactivateError } = await supabase
        .from("ai_kb_documents")
        .update({ is_active: false })
        .in("id", orphanedIds);
      if (deactivateError) {
        throw new Error(`Failed to deactivate orphaned documents: ${deactivateError.message}`);
      }
      stats.documents_deactivated = orphaned.length;
      log.info(`Deactivated ${orphaned.length} orphaned document(s)`, {
        sourcePaths: orphaned.map((d: { source_path: string }) => d.source_path),
      });
    } else {
      log.info("No orphaned documents found.");
    }
  }

  } catch (err) {
    pipelineError = err instanceof Error ? err.message : String(err);
    log.error("Pipeline error", { error: pipelineError, runId });
  } finally {
    // ─── Step 5: Finalize run (always) ────────────────────────────────────
    log.info("Step 5: Finalizing run...");

    const { status: computedStatus, errorMessage: computedError } = computeFinalStatus(stats);
    const finalStatus = pipelineError ? "failed" : computedStatus;
    const errorMessage = pipelineError || computedError;

    const { error: finalizeError } = await supabase
      .from("ai_kb_ingestion_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        stats: stats as unknown as Record<string, unknown>,
        error_message: errorMessage,
      })
      .eq("id", runId);

    if (finalizeError) {
      log.error("Failed to finalize ingestion run", { error: finalizeError.message, runId });
    }

    // ─── Summary ──────────────────────────────────────────────────────────
    log.info("Build summary", {
      status: finalStatus,
      totalSources: stats.total_sources,
      inserted: stats.documents_inserted,
      updated: stats.documents_updated,
      unchanged: stats.documents_unchanged,
      deactivated: stats.documents_deactivated,
      chunksWritten: stats.chunks_written,
      failedSources: stats.failed_sources.length,
      error: errorMessage,
      runId,
    });

    if (finalStatus === "failed") {
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    log.error("Build pipeline failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
