/**
 * AI Knowledge Base — Verification Script
 *
 * Runs health checks on the knowledge base: embedding model consistency,
 * staleness, coverage gaps, empty chunks, canary search quality, and run health.
 *
 * Usage: ts-node scripts/ai-kb/verify.ts
 */

import { createAdminClient } from "@/lib/supabase/server";
import { loadSourceRegistry } from "@/lib/ai/knowledge/sources";
import { embedTexts } from "@/lib/ai/knowledge/embeddings";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";
import { getLogger } from "@/lib/utils/logger";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export type CheckStatus = "PASS" | "WARN" | "FAIL";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
}

export interface CanaryQuery {
  query: string;
  expectedSourceType: string;
  expectedDomainTag: string;
}

export interface SearchResultLike {
  document_id: string;
  metadata?: Record<string, unknown>;
  rank?: number;
}

type SupabaseAdmin = {
  rpc: (...args: any[]) => any;
  from: (...args: any[]) => any;
};
const log = getLogger("scripts:ai-kb:verify");
const RAW_DIR = resolve(process.cwd(), "automation/data/ai-kb/raw");

export const CANARY_QUERIES: CanaryQuery[] = [
  {
    query: "how do bootcamps work",
    expectedSourceType: "faq",
    expectedDomainTag: "bootcamp",
  },
  {
    query: "active cohort schedules",
    expectedSourceType: "db_snapshot",
    expectedDomainTag: "cohort",
  },
  {
    query: "milestone completion requirements",
    expectedSourceType: "db_snapshot",
    expectedDomainTag: "milestone",
  },
];

export function topResultsMatchCanary(
  results: SearchResultLike[],
  domainTagsByDocumentId: Map<string, string[]>,
  canary: CanaryQuery,
): boolean {
  return results.slice(0, 3).some((result) => {
    const sourceType = result.metadata?.source_type;
    if (sourceType === canary.expectedSourceType) {
      return true;
    }

    const domainTags = domainTagsByDocumentId.get(result.document_id) ?? [];
    return domainTags.includes(canary.expectedDomainTag);
  });
}

function hasEmptySnapshotFile(sourcePath: string): boolean {
  if (!sourcePath.startsWith("db:")) {
    return false;
  }

  const filePath = resolve(RAW_DIR, "db", `${sourcePath.slice(3)}.jsonl`);
  if (!existsSync(filePath)) {
    return false;
  }

  return readFileSync(filePath, "utf-8").trim().length === 0;
}

// ─── Check 1: Embedding model consistency ──────────────────────────────────

export async function checkModelConsistency(
  supabase: SupabaseAdmin,
): Promise<CheckResult> {
  try {
    const { data: rows, error } = await supabase.rpc(
      "get_distinct_embedding_models",
    );

    if (error) {
      return {
        name: "Embedding model consistency",
        status: "FAIL",
        message: `Query failed: ${error.message}`,
      };
    }

    const models = ((rows ?? []) as Array<{ embedding_model: string }>)
      .map((r: { embedding_model: string }) => r.embedding_model)
      .filter(Boolean);

    if (models.length === 0) {
      return {
        name: "Embedding model consistency",
        status: "PASS",
        message: "No active chunks found (empty KB).",
      };
    }

    if (models.length === 1) {
      return {
        name: "Embedding model consistency",
        status: "PASS",
        message: `All chunks use: ${models[0]}`,
      };
    }

    return {
      name: "Embedding model consistency",
      status: "FAIL",
      message: `Multiple models found: ${models.join(", ")}`,
    };
  } catch (err) {
    return {
      name: "Embedding model consistency",
      status: "FAIL",
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Check 2: Staleness ────────────────────────────────────────────────────

export async function checkStaleness(
  supabase: SupabaseAdmin,
): Promise<CheckResult[]> {
  try {
    const registry = loadSourceRegistry();
    const results: CheckResult[] = [];

    for (const entry of registry.sources) {
      const { data, error } = await supabase
        .from("ai_kb_documents")
        .select("last_reviewed_at")
        .eq("source_path", entry.sourcePath)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      const doc = data as { last_reviewed_at: string | null } | null;

      if (!doc) {
        // Will be caught by coverage gap check
        continue;
      }

      if (doc.last_reviewed_at) {
        const lastReviewed = new Date(doc.last_reviewed_at).getTime();
        const daysSince = (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24);
        if (daysSince > entry.staleDays) {
          results.push({
            name: `Staleness: ${entry.sourcePath}`,
            status: "WARN",
            message: `${Math.round(daysSince)} days since last review (threshold: ${entry.staleDays})`,
          });
        }
      }
    }

    // If no staleness warnings were added, record a pass
    if (results.length === 0) {
      results.push({
        name: "Staleness",
        status: "PASS",
        message: "All sources within freshness thresholds.",
      });
    }

    return results;
  } catch (err) {
    return [
      {
        name: "Staleness",
        status: "FAIL",
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

// ─── Check 3: Coverage gaps ────────────────────────────────────────────────

export async function checkCoverageGaps(
  supabase: SupabaseAdmin,
): Promise<CheckResult[]> {
  try {
    const registry = loadSourceRegistry();

    const { data, error } = await supabase
      .from("ai_kb_documents")
      .select("source_path")
      .eq("is_active", true);
    if (error) throw error;
    const activeDocs = data as Array<{ source_path: string }> | null;

    const activeSet = new Set<string>(
      (activeDocs ?? []).map((d: { source_path: string }) => d.source_path),
    );
    const registrySet = new Set(registry.sources.map((s) => s.sourcePath));

    const results: CheckResult[] = [];

    // Missing sources (in registry but not in DB)
    for (const entry of registry.sources) {
      if (!activeSet.has(entry.sourcePath)) {
        if (
          entry.sourceType === "db_snapshot" &&
          hasEmptySnapshotFile(entry.sourcePath)
        ) {
          continue;
        }

        results.push({
          name: `Coverage gap: missing`,
          status: "WARN",
          message: `Registry entry "${entry.sourcePath}" has no active document.`,
        });
      }
    }

    // Orphaned documents (in DB but not in registry)
    for (const sp of Array.from(activeSet)) {
      if (!registrySet.has(sp)) {
        results.push({
          name: `Coverage gap: orphaned`,
          status: "WARN",
          message: `Active document "${sp}" is not in the source registry.`,
        });
      }
    }

    if (results.length === 0) {
      results.push({
        name: "Coverage gaps",
        status: "PASS",
        message: "All registry sources have active documents; no orphans.",
      });
    }

    return results;
  } catch (err) {
    return [
      {
        name: "Coverage gaps",
        status: "FAIL",
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }
}

// ─── Check 4: Empty chunks ────────────────────────────────────────────────

export async function checkEmptyChunks(
  supabase: SupabaseAdmin,
): Promise<CheckResult> {
  try {
    const { data: shortCount, error } = await supabase.rpc(
      "count_short_chunks",
      { min_length: 100 },
    );

    if (error) {
      throw error;
    }

    const count = Number(shortCount ?? 0);

    if (count > 0) {
      return {
        name: "Empty chunks",
        status: "WARN",
        message: `${count} chunk(s) with text shorter than 100 characters.`,
      };
    }

    return {
      name: "Empty chunks",
      status: "PASS",
      message: "No short chunks found.",
    };
  } catch (err) {
    return {
      name: "Empty chunks",
      status: "FAIL",
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Check 6: Latest run health ────────────────────────────────────────────

export async function checkLatestRunHealth(
  supabase: SupabaseAdmin,
): Promise<CheckResult> {
  try {
    const { data, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const latestRun = data as {
      status: string;
      error_message: string | null;
      finished_at: string | null;
      started_at: string;
    } | null;

    if (!latestRun) {
      return {
        name: "Latest run health",
        status: "WARN",
        message: "No ingestion runs found.",
      };
    }

    if (latestRun.status === "failed") {
      return {
        name: "Latest run health",
        status: "FAIL",
        message: `Latest run failed: ${latestRun.error_message || "unknown error"}`,
      };
    }

    if (latestRun.status === "started") {
      const hoursSinceStarted =
        (Date.now() - new Date(latestRun.started_at).getTime()) / (1000 * 60 * 60);
      return {
        name: "Latest run health",
        status: hoursSinceStarted > 1 ? "WARN" : "PASS",
        message: `Latest run still in progress (started ${Math.round(hoursSinceStarted)}h ago).`,
      };
    }

    const finishedAt = latestRun.finished_at
      ? new Date(latestRun.finished_at).getTime()
      : Date.now();
    const hoursSinceFinished = (Date.now() - finishedAt) / (1000 * 60 * 60);

    if (hoursSinceFinished > 24) {
      return {
        name: "Latest run health",
        status: "WARN",
        message: `Latest run finished ${Math.round(hoursSinceFinished)} hours ago (>24h).`,
      };
    }

    return {
      name: "Latest run health",
      status: "PASS",
      message: `Latest run completed ${Math.round(hoursSinceFinished)}h ago.`,
    };
  } catch (err) {
    return {
      name: "Latest run health",
      status: "FAIL",
      message: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function main() {
  log.info("=== AI KB Verification ===");

  const supabase = createAdminClient();
  const results: CheckResult[] = [];

  // ─── Check 1 ──────────────────────────────────────────────────────────────
  log.info("Check 1: Embedding model consistency...");
  results.push(await checkModelConsistency(supabase));

  // ─── Check 2 ──────────────────────────────────────────────────────────────
  log.info("Check 2: Staleness...");
  results.push(...(await checkStaleness(supabase)));

  // ─── Check 3 ──────────────────────────────────────────────────────────────
  log.info("Check 3: Coverage gaps...");
  results.push(...(await checkCoverageGaps(supabase)));

  // ─── Check 4 ──────────────────────────────────────────────────────────────
  log.info("Check 4: Empty chunks...");
  results.push(await checkEmptyChunks(supabase));

  // ─── Check 5: Canary search quality ─────────────────────────────────────
  log.info("Check 5: Canary search quality...");
  for (const canary of CANARY_QUERIES) {
    try {
      const start = Date.now();
      const [embedding] = await embedTexts([canary.query]);
      if (!embedding) {
        throw new Error(`No embedding returned for canary query "${canary.query}"`);
      }

      const searchResults = await searchKnowledgeBase({
        queryText: canary.query,
        queryEmbedding: embedding,
        limit: 3,
      });
      const tookMs = Date.now() - start;

      const issues: string[] = [];

      // (a) at least 1 result
      if (searchResults.length === 0) {
        issues.push("no results returned");
      }

      // (b) top result rank > 0.1
      const topResult = searchResults[0] as SearchResultLike | undefined;
      if (topResult?.rank !== undefined) {
        const topRank = Number(topResult.rank);
        if (topRank <= 0.1) {
          issues.push(`top rank too low: ${topRank.toFixed(4)}`);
        }
      }

      // (c) response time < 2000ms
      if (tookMs > 2000) {
        issues.push(`response time too slow: ${tookMs}ms`);
      }

      // (d) at least one top-3 result has expected source_type or domain_tag
      if (searchResults.length > 0) {
        const documentIds = [...new Set(
          searchResults
            .slice(0, 3)
            .map((result) => result.document_id),
        )];
        const { data: documents, error: documentsError } = await supabase
          .from("ai_kb_documents")
          .select("id, domain_tags")
          .in("id", documentIds);

        if (documentsError) {
          throw documentsError;
        }

        const domainTagsByDocumentId = new Map(
          (documents ?? []).map((document: { id: string; domain_tags: string[] | null }) => [document.id, document.domain_tags ?? []]),
        );
        const hasExpected = topResultsMatchCanary(
          searchResults as SearchResultLike[],
          domainTagsByDocumentId,
          canary,
        );

        if (!hasExpected) {
          issues.push(
            `no top-3 result matched expected source_type "${canary.expectedSourceType}" or domain_tag "${canary.expectedDomainTag}"`,
          );
        }
      }

      if (issues.length > 0) {
        results.push({
          name: `Canary: "${canary.query}"`,
          status: "FAIL",
          message: issues.join("; "),
        });
      } else {
        results.push({
          name: `Canary: "${canary.query}"`,
          status: "PASS",
          message: `${searchResults.length} result(s), ${tookMs}ms`,
        });
      }
    } catch (err) {
      results.push({
        name: `Canary: "${canary.query}"`,
        status: "FAIL",
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ─── Check 6 ──────────────────────────────────────────────────────────────
  log.info("Check 6: Latest run health...");
  results.push(await checkLatestRunHealth(supabase));

  // ─── Summary ────────────────────────────────────────────────────────────
  log.info("=== Verification Results ===");

  for (const result of results) {
    const level =
      result.status === "FAIL"
        ? "error"
        : result.status === "WARN"
          ? "warn"
          : "info";
    log[level](`[${result.status}] ${result.name}`, { message: result.message });
  }

  const hasFail = results.some((r) => r.status === "FAIL");
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;

  log.info("Verification summary", {
    total: results.length,
    pass: passCount,
    warn: warnCount,
    fail: failCount,
  });

  if (hasFail) {
    log.error("Verification FAILED.");
    process.exit(1);
  }

  log.info("Verification passed.");
}

if (require.main === module) {
  main().catch((err) => {
    log.error("Verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
