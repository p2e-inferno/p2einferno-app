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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

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

    const models = (rows ?? [])
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
      const { data: doc } = await supabase
        .from("ai_kb_documents")
        .select("last_reviewed_at")
        .eq("source_path", entry.sourcePath)
        .eq("is_active", true)
        .single();

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

    const { data: activeDocs } = await supabase
      .from("ai_kb_documents")
      .select("source_path")
      .eq("is_active", true);

    const activeSet = new Set((activeDocs ?? []).map((d: { source_path: string }) => d.source_path));
    const registrySet = new Set(registry.sources.map((s) => s.sourcePath));

    const results: CheckResult[] = [];

    // Missing sources (in registry but not in DB)
    for (const entry of registry.sources) {
      if (!activeSet.has(entry.sourcePath)) {
        results.push({
          name: `Coverage gap: missing`,
          status: "WARN",
          message: `Registry entry "${entry.sourcePath}" has no active document.`,
        });
      }
    }

    // Orphaned documents (in DB but not in registry)
    for (const sp of activeSet) {
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
    const { data: latestRun } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

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

    const finishedAt = latestRun.finished_at
      ? new Date(latestRun.finished_at).getTime()
      : 0;
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

async function main() {
  console.log("=== AI KB Verification ===\n");

  const supabase = createAdminClient();
  const results: CheckResult[] = [];

  // ─── Check 1 ──────────────────────────────────────────────────────────────
  console.log("Check 1: Embedding model consistency...");
  results.push(await checkModelConsistency(supabase));

  // ─── Check 2 ──────────────────────────────────────────────────────────────
  console.log("Check 2: Staleness...");
  results.push(...(await checkStaleness(supabase)));

  // ─── Check 3 ──────────────────────────────────────────────────────────────
  console.log("Check 3: Coverage gaps...");
  results.push(...(await checkCoverageGaps(supabase)));

  // ─── Check 4 ──────────────────────────────────────────────────────────────
  console.log("Check 4: Empty chunks...");
  results.push(await checkEmptyChunks(supabase));

  // ─── Check 5: Canary search quality ─────────────────────────────────────
  console.log("Check 5: Canary search quality...");
  for (const canary of CANARY_QUERIES) {
    try {
      const start = Date.now();
      const [embedding] = await embedTexts([canary.query]);
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
      if (
        searchResults.length > 0 &&
        (searchResults[0] as Record<string, unknown>).rank !== undefined
      ) {
        const topRank = Number((searchResults[0] as Record<string, unknown>).rank);
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
            .map((result: Record<string, unknown>) => String(result.document_id)),
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
  console.log("Check 6: Latest run health...");
  results.push(await checkLatestRunHealth(supabase));

  // ─── Summary ────────────────────────────────────────────────────────────
  console.log("\n=== Verification Results ===\n");

  const maxNameLen = Math.max(...results.map((r) => r.name.length));

  for (const r of results) {
    const statusIcon =
      r.status === "PASS" ? "✓" : r.status === "WARN" ? "⚠" : "✗";
    console.log(
      `  ${statusIcon} [${r.status}] ${r.name.padEnd(maxNameLen)}  ${r.message}`,
    );
  }

  const hasFail = results.some((r) => r.status === "FAIL");
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const passCount = results.filter((r) => r.status === "PASS").length;

  console.log(
    `\n  Total: ${results.length} checks — ${passCount} PASS, ${warnCount} WARN, ${hasFail ? results.filter((r) => r.status === "FAIL").length : 0} FAIL`,
  );

  if (hasFail) {
    console.error("\n✗ Verification FAILED.");
    process.exit(1);
  }

  console.log("\n✓ Verification passed.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}
