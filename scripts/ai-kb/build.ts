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
import type {
  IngestionRunStats,
  UpsertDocumentResult,
} from "@/lib/ai/knowledge/types";

const RAW_DIR = resolve(process.cwd(), "automation/data/ai-kb/raw");
const STALE_RUN_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
export const EXPECTED_EMBEDDING_DIM = 1536;

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

function loadJsonlForSource(sourcePath: string): JsonlRecord[] {
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
      return [];
    }
  }

  const raw = readFileSync(jsonlPath, "utf-8");
  const lines = raw.trim().split("\n").filter((l) => l.trim());
  const records: JsonlRecord[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as JsonlRecord;
      if (parsed.sourcePath && parsed.title && parsed.content) {
        records.push(parsed);
      }
    } catch {
      // Skip invalid lines
    }
  }

  return records;
}

// ─── Exported helpers for testability ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export interface ConcurrencyCheckResult {
  blocked: boolean;
  staleRunCleared: boolean;
  staleRunId?: string;
}

export async function checkConcurrentRun(
  supabase: SupabaseAdmin,
): Promise<ConcurrencyCheckResult> {
  const { data: activeRuns } = await supabase
    .from("ai_kb_ingestion_runs")
    .select("id, started_at")
    .eq("status", "started")
    .order("started_at", { ascending: false })
    .limit(1);

  if (!activeRuns || activeRuns.length === 0) {
    return { blocked: false, staleRunCleared: false };
  }

  const activeRun = activeRuns[0];
  const startedAt = new Date(activeRun.started_at).getTime();
  const ageMs = Date.now() - startedAt;

  if (ageMs < STALE_RUN_THRESHOLD_MS) {
    return { blocked: true, staleRunCleared: false };
  }

  // Stale run — mark as failed
  await supabase
    .from("ai_kb_ingestion_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message:
        "Timed out: no completion after 60 minutes (likely crashed)",
    })
    .eq("id", activeRun.id);

  return { blocked: false, staleRunCleared: true, staleRunId: activeRun.id };
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

export function validateEmbeddingDimensions(
  embeddings: number[][],
  expected: number,
): void {
  for (let i = 0; i < embeddings.length; i++) {
    if (embeddings[i].length !== expected) {
      throw new Error(
        `Embedding dimension mismatch for chunk ${i}: expected ${expected}, got ${embeddings[i].length}`,
      );
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const mode = parseModeFromArgv(process.argv);
  console.log(`=== AI KB Build (${mode}) ===\n`);

  const supabase = createAdminClient();
  const embeddingModel = getEmbeddingModel();
  console.log(`Embedding model: ${embeddingModel}`);

  // ─── Step 0: Concurrency check ──────────────────────────────────────────
  console.log("\nStep 0: Checking for concurrent runs...");

  const concurrency = await checkConcurrentRun(supabase);
  if (concurrency.blocked) {
    console.warn("Another ingestion run is in progress, exiting.");
    process.exit(0);
  }
  if (concurrency.staleRunCleared) {
    console.warn(`Stale run ${concurrency.staleRunId} marked as failed.`);
  }

  console.log("  No concurrent run detected.\n");

  // ─── Step 1: Create ingestion run ───────────────────────────────────────
  console.log("Step 1: Creating ingestion run...");

  const { data: runData, error: runError } = await supabase
    .from("ai_kb_ingestion_runs")
    .insert({ run_type: mode, status: "started" })
    .select("id")
    .single();

  if (runError || !runData) {
    console.error("Failed to create ingestion run:", runError?.message);
    process.exit(1);
  }

  const runId = runData.id;
  console.log(`  Run ID: ${runId}\n`);

  // ─── Step 2: Load registry ──────────────────────────────────────────────
  console.log("Step 2: Loading source registry...");
  const registry = loadSourceRegistry();
  console.log(`  ${registry.sources.length} source(s) registered.\n`);

  // ─── Step 3: Process each source ────────────────────────────────────────
  console.log("Step 3: Processing sources...\n");

  const stats: IngestionRunStats = {
    total_sources: registry.sources.length,
    documents_inserted: 0,
    documents_updated: 0,
    documents_unchanged: 0,
    documents_deactivated: 0,
    chunks_written: 0,
    embedding_model: embeddingModel,
    failed_sources: [],
    last_processed_source: null,
  };

  for (const entry of registry.sources) {
    console.log(`  Processing: ${entry.sourcePath}`);

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
      const records = loadJsonlForSource(entry.sourcePath);
      if (records.length === 0) {
        console.warn(`    ⚠ No JSONL data found for "${entry.sourcePath}", skipping.`);
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
        contentMarkdown = records[0].content;
        if (records[0].recordId) {
          extraMetadata.record_id = records[0].recordId;
        }
      }

      // 3.2: Compute content hash
      const contentHash = sha256(contentMarkdown);

      // 3.3: In incremental mode, check if content has changed
      if (mode === "incremental") {
        if (existingDoc && existingDoc.content_hash === contentHash) {
          console.log("    Content unchanged, stamping freshness.");
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

      // 3.5: Filter out short chunks (already done by chunkMarkdown, but log)
      const validChunks = chunks.filter((c) => c.chunkText.length >= 100);
      if (validChunks.length === 0) {
        console.warn(`    ⚠ No valid chunks produced for "${entry.sourcePath}".`);
        stats.failed_sources.push({
          sourcePath: entry.sourcePath,
          error: "No valid chunks (all below 100 chars)",
        });
        continue;
      }

      // 3.6: Embed all chunk texts
      console.log(`    Embedding ${validChunks.length} chunk(s)...`);
      const chunkTexts = validChunks.map((c) => c.chunkText);
      const embeddings = await embedTexts(chunkTexts);

      // Validate embedding dimensions
      validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM);

      // 3.7-3.8: Build p_chunks JSONB array with metadata
      const pChunks = validChunks.map((chunk, i) => ({
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.chunkText,
        token_estimate: chunk.tokenEstimate,
        embedding: embeddings[i],
        metadata: {
          ...chunk.metadata,
          embedding_model: embeddingModel,
        },
      }));

      // 3.9: Call upsert RPC
      console.log(`    Upserting document + ${pChunks.length} chunk(s)...`);
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
      console.log(
        `    ✓ Done (updated: ${result?.was_updated ?? false}, chunks: ${result?.chunks_written ?? 0})`,
      );
    } catch (err) {
      // 3.11: Per-document failure — log and continue
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`    ✗ Failed: ${errorMsg}`);
      stats.failed_sources.push({
        sourcePath: entry.sourcePath,
        error: errorMsg,
      });
    }
  }

  // ─── Step 4: Deactivate missing sources ─────────────────────────────────
  console.log("\nStep 4: Deactivating orphaned documents...");

  const registryPaths = registry.sources.map((s) => s.sourcePath);
  const { data: activeDocs } = await supabase
    .from("ai_kb_documents")
    .select("id, source_path")
    .eq("is_active", true);

  if (activeDocs) {
    const orphaned = activeDocs.filter(
      (d: { source_path: string }) => !registryPaths.includes(d.source_path),
    );
    if (orphaned.length > 0) {
      const orphanedIds = orphaned.map((d: { id: string }) => d.id);
      await supabase
        .from("ai_kb_documents")
        .update({ is_active: false })
        .in("id", orphanedIds);
      stats.documents_deactivated = orphaned.length;
      console.log(
        `  Deactivated ${orphaned.length} orphaned document(s):`,
        orphaned.map((d: { source_path: string }) => d.source_path),
      );
    } else {
      console.log("  No orphaned documents found.");
    }
  }

  // ─── Step 5: Finalize run ──────────────────────────────────────────────
  console.log("\nStep 5: Finalizing run...");

  const { status: finalStatus, errorMessage } = computeFinalStatus(stats);

  await supabase
    .from("ai_kb_ingestion_runs")
    .update({
      status: finalStatus,
      finished_at: new Date().toISOString(),
      stats: stats as unknown as Record<string, unknown>,
      error_message: errorMessage,
    })
    .eq("id", runId);

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log("\n=== Build Summary ===");
  console.log(`  Status:              ${finalStatus}`);
  console.log(`  Total sources:       ${stats.total_sources}`);
  console.log(`  Inserted:            ${stats.documents_inserted}`);
  console.log(`  Updated:             ${stats.documents_updated}`);
  console.log(`  Unchanged:           ${stats.documents_unchanged}`);
  console.log(`  Deactivated:         ${stats.documents_deactivated}`);
  console.log(`  Chunks written:      ${stats.chunks_written}`);
  console.log(`  Failed sources:      ${stats.failed_sources.length}`);
  if (errorMessage) console.log(`  Error:               ${errorMessage}`);
  console.log(`  Run ID:              ${runId}`);

  if (finalStatus === "failed") {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Build pipeline failed:", err);
    process.exit(1);
  });
}
