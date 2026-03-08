/**
 * Unit tests for AI Knowledge Base verify.ts
 *
 * Tests all 6 check categories by calling real exported functions
 * with mocked Supabase responses.
 */

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

const mockLoadSourceRegistry = jest.fn();

jest.mock("@/lib/ai/knowledge/sources", () => ({
  loadSourceRegistry: (...args: unknown[]) => mockLoadSourceRegistry(...args),
}));

jest.mock("@/lib/ai/knowledge/embeddings", () => ({
  embedTexts: jest.fn(),
}));

jest.mock("@/lib/ai/knowledge/retrieval", () => ({
  searchKnowledgeBase: jest.fn(),
}));

import {
  checkModelConsistency,
  checkStaleness,
  checkCoverageGaps,
  checkEmptyChunks,
  checkLatestRunHealth,
  topResultsMatchCanary,
} from "@/scripts/ai-kb/verify";

/** Creates a mock supabase-like object for passing to check functions. */
function createMockSupabase() {
  return {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  };
}

/** Creates a chainable PostgREST mock that resolves to `value` for any terminal call. */
function createQueryChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock | ((...args: unknown[]) => unknown)> = {};

  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.like = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolvedValue);
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(onFulfilled);

  return chain;
}

// ─── Check 5: topResultsMatchCanary (canary search quality) ────────────────

describe("topResultsMatchCanary", () => {
  const canary = {
    query: "active cohort schedules",
    expectedSourceType: "db_snapshot",
    expectedDomainTag: "cohort",
  };

  it("matches on source_type in top results", () => {
    expect(
      topResultsMatchCanary(
        [{ document_id: "doc-1", metadata: { source_type: "db_snapshot" } }],
        new Map(),
        canary,
      ),
    ).toBe(true);
  });

  it("matches on parent document domain tags", () => {
    expect(
      topResultsMatchCanary(
        [{ document_id: "doc-2", metadata: { source_type: "faq" } }],
        new Map([["doc-2", ["bootcamp", "cohort"]]]),
        canary,
      ),
    ).toBe(true);
  });

  it("returns false when neither source type nor domain tags match", () => {
    expect(
      topResultsMatchCanary(
        [{ document_id: "doc-3", metadata: { source_type: "faq" } }],
        new Map([["doc-3", ["bootcamp"]]]),
        canary,
      ),
    ).toBe(false);
  });

  it("only checks top 3 results", () => {
    expect(
      topResultsMatchCanary(
        [
          { document_id: "d1", metadata: { source_type: "faq" } },
          { document_id: "d2", metadata: { source_type: "faq" } },
          { document_id: "d3", metadata: { source_type: "faq" } },
          { document_id: "d4", metadata: { source_type: "db_snapshot" } },
        ],
        new Map(),
        canary,
      ),
    ).toBe(false);
  });
});

// ─── Check 1: Embedding model consistency ──────────────────────────────────

describe("checkModelConsistency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("FAIL — 2 distinct embedding models", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { embedding_model: "openai/text-embedding-3-small" },
        { embedding_model: "openai/text-embedding-ada-002" },
      ],
      error: null,
    });

    const result = await checkModelConsistency(createMockSupabase());
    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("Multiple models found");
    expect(result.message).toContain("openai/text-embedding-3-small");
    expect(result.message).toContain("openai/text-embedding-ada-002");
  });

  it("PASS — 1 consistent embedding model", async () => {
    mockRpc.mockResolvedValue({
      data: [{ embedding_model: "openai/text-embedding-3-small" }],
      error: null,
    });

    const result = await checkModelConsistency(createMockSupabase());
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("openai/text-embedding-3-small");
  });

  it("PASS — empty KB (no active chunks)", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await checkModelConsistency(createMockSupabase());
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("empty KB");
  });

  it("FAIL — query error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    const result = await checkModelConsistency(createMockSupabase());
    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("connection refused");
  });
});

// ─── Check 2: Staleness ────────────────────────────────────────────────────

describe("checkStaleness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("WARN — staleDays 7, last_reviewed_at 10 days ago", async () => {
    mockLoadSourceRegistry.mockReturnValue({
      schemaVersion: "1",
      sources: [
        { sourcePath: "docs/faq.md", staleDays: 7 },
      ],
    });

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      createQueryChain({
        data: { last_reviewed_at: tenDaysAgo },
        error: null,
      }),
    );

    const results = await checkStaleness(createMockSupabase());
    const staleResult = results.find((r) => r.name.startsWith("Staleness:"));
    expect(staleResult).toBeDefined();
    expect(staleResult!.status).toBe("WARN");
    expect(staleResult!.message).toContain("days since last review");
  });

  it("PASS — staleDays 7, last_reviewed_at 3 days ago", async () => {
    mockLoadSourceRegistry.mockReturnValue({
      schemaVersion: "1",
      sources: [
        { sourcePath: "docs/faq.md", staleDays: 7 },
      ],
    });

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      createQueryChain({
        data: { last_reviewed_at: threeDaysAgo },
        error: null,
      }),
    );

    const results = await checkStaleness(createMockSupabase());
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("PASS");
    expect(results[0].message).toContain("within freshness thresholds");
  });
});

// ─── Check 3: Coverage gaps ────────────────────────────────────────────────

describe("checkCoverageGaps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("WARN — registry has 3 sources, DB has 2 (missing source)", async () => {
    mockLoadSourceRegistry.mockReturnValue({
      schemaVersion: "1",
      sources: [
        { sourcePath: "docs/faq.md" },
        { sourcePath: "db:bootcamps" },
        { sourcePath: "db:cohorts" },
      ],
    });

    mockFrom.mockReturnValue(
      createQueryChain({
        data: [
          { source_path: "docs/faq.md" },
          { source_path: "db:bootcamps" },
        ],
        error: null,
      }),
    );

    const results = await checkCoverageGaps(createMockSupabase());
    const missing = results.find((r) => r.name === "Coverage gap: missing");
    expect(missing).toBeDefined();
    expect(missing!.status).toBe("WARN");
    expect(missing!.message).toContain("db:cohorts");
  });

  it("WARN — DB has 1 extra active doc (orphaned doc)", async () => {
    mockLoadSourceRegistry.mockReturnValue({
      schemaVersion: "1",
      sources: [
        { sourcePath: "docs/faq.md" },
      ],
    });

    mockFrom.mockReturnValue(
      createQueryChain({
        data: [
          { source_path: "docs/faq.md" },
          { source_path: "db:orphaned" },
        ],
        error: null,
      }),
    );

    const results = await checkCoverageGaps(createMockSupabase());
    const orphaned = results.find((r) => r.name === "Coverage gap: orphaned");
    expect(orphaned).toBeDefined();
    expect(orphaned!.status).toBe("WARN");
    expect(orphaned!.message).toContain("db:orphaned");
  });

  it("PASS — all sources match, no orphans", async () => {
    mockLoadSourceRegistry.mockReturnValue({
      schemaVersion: "1",
      sources: [
        { sourcePath: "docs/faq.md" },
        { sourcePath: "db:bootcamps" },
      ],
    });

    mockFrom.mockReturnValue(
      createQueryChain({
        data: [
          { source_path: "docs/faq.md" },
          { source_path: "db:bootcamps" },
        ],
        error: null,
      }),
    );

    const results = await checkCoverageGaps(createMockSupabase());
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("PASS");
  });
});

// ─── Check 4: Empty chunks ────────────────────────────────────────────────

describe("checkEmptyChunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("WARN — count > 0 short chunks", async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });

    const result = await checkEmptyChunks(createMockSupabase());
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("3 chunk(s)");
  });

  it("PASS — count = 0 short chunks", async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });

    const result = await checkEmptyChunks(createMockSupabase());
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("No short chunks");
  });

  it("FAIL — RPC error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "timeout" } });

    const result = await checkEmptyChunks(createMockSupabase());
    expect(result.status).toBe("FAIL");
  });
});

// ─── Check 6: Latest run health ────────────────────────────────────────────

describe("checkLatestRunHealth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("FAIL — latest run status is failed", async () => {
    mockFrom.mockReturnValue(
      createQueryChain({
        data: {
          status: "failed",
          error_message: "embedding API timeout",
          finished_at: new Date().toISOString(),
        },
        error: null,
      }),
    );

    const result = await checkLatestRunHealth(createMockSupabase());
    expect(result.status).toBe("FAIL");
    expect(result.message).toContain("embedding API timeout");
  });

  it("PASS — completed with recent finished_at (< 24h)", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      createQueryChain({
        data: {
          status: "completed",
          finished_at: twoHoursAgo,
        },
        error: null,
      }),
    );

    const result = await checkLatestRunHealth(createMockSupabase());
    expect(result.status).toBe("PASS");
    expect(result.message).toContain("completed");
  });

  it("WARN — completed but finished_at older than 24h", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      createQueryChain({
        data: {
          status: "completed",
          finished_at: thirtyHoursAgo,
        },
        error: null,
      }),
    );

    const result = await checkLatestRunHealth(createMockSupabase());
    expect(result.status).toBe("WARN");
    expect(result.message).toContain(">24h");
  });

  it("WARN — no ingestion runs found", async () => {
    mockFrom.mockReturnValue(
      createQueryChain({ data: null, error: null }),
    );

    const result = await checkLatestRunHealth(createMockSupabase());
    expect(result.status).toBe("WARN");
    expect(result.message).toContain("No ingestion runs found");
  });
});
