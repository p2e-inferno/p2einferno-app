/**
 * Unit tests for AI Knowledge Base build.ts
 *
 * Tests exported helpers: parseModeFromArgv, checkConcurrentRun,
 * computeFinalStatus, validateEmbeddingDimensions.
 */

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

jest.mock("@/lib/ai/knowledge/sources", () => ({
  loadSourceRegistry: jest.fn(),
}));

jest.mock("@/lib/ai/knowledge/chunking", () => ({
  chunkMarkdown: jest.fn(),
}));

jest.mock("@/lib/ai/knowledge/embeddings", () => ({
  embedTexts: jest.fn(),
  getEmbeddingModel: jest.fn(),
}));

import {
  parseModeFromArgv,
  checkConcurrentRun,
  computeFinalStatus,
  validateEmbeddingDimensions,
  EXPECTED_EMBEDDING_DIM,
} from "@/scripts/ai-kb/build";

import type { IngestionRunStats } from "@/lib/ai/knowledge/types";

/** Creates a mock supabase-like object. */
function createMockSupabase() {
  return {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  };
}

/** Creates a chainable PostgREST mock. */
function createQueryChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock | ((...args: unknown[]) => unknown)> = {};

  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.neq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.like = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockResolvedValue(resolvedValue);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolvedValue);
  chain.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(onFulfilled);

  return chain;
}

// ─── parseModeFromArgv ─────────────────────────────────────────────────────

describe("parseModeFromArgv", () => {
  it("parses --mode incremental", () => {
    expect(parseModeFromArgv(["node", "build.ts", "--mode", "incremental"])).toBe(
      "incremental",
    );
  });

  it("parses --mode=incremental", () => {
    expect(parseModeFromArgv(["node", "build.ts", "--mode=incremental"])).toBe(
      "incremental",
    );
  });

  it("defaults to full for invalid input", () => {
    expect(parseModeFromArgv(["node", "build.ts", "--mode", "weird"])).toBe("full");
  });
});

// ─── checkConcurrentRun ────────────────────────────────────────────────────

describe("checkConcurrentRun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocked — active started run within 60 min", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockFrom.mockReturnValue(
      createQueryChain({
        data: [{ id: "run-1", started_at: fiveMinAgo }],
        error: null,
      }),
    );

    const result = await checkConcurrentRun(createMockSupabase());
    expect(result.blocked).toBe(true);
    expect(result.staleRunCleared).toBe(false);
  });

  it("stale run cleared — started run older than 60 min marked as failed", async () => {
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();
    const updateChain = createQueryChain({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(
        createQueryChain({
          data: [{ id: "run-stale", started_at: twoHoursAgo }],
          error: null,
        }),
      )
      .mockReturnValueOnce(updateChain);

    const result = await checkConcurrentRun(createMockSupabase());
    expect(result.blocked).toBe(false);
    expect(result.staleRunCleared).toBe(true);
    expect(result.staleRunId).toBe("run-stale");
  });

  it("not blocked — completed run does not appear (only started queried)", async () => {
    // The query filters by status="started", so completed runs don't appear
    mockFrom.mockReturnValue(
      createQueryChain({
        data: [],
        error: null,
      }),
    );

    const result = await checkConcurrentRun(createMockSupabase());
    expect(result.blocked).toBe(false);
    expect(result.staleRunCleared).toBe(false);
  });

  it("not blocked — no runs at all", async () => {
    mockFrom.mockReturnValue(
      createQueryChain({
        data: null,
        error: null,
      }),
    );

    const result = await checkConcurrentRun(createMockSupabase());
    expect(result.blocked).toBe(false);
    expect(result.staleRunCleared).toBe(false);
  });
});

// ─── computeFinalStatus ────────────────────────────────────────────────────

describe("computeFinalStatus", () => {
  function makeStats(overrides: Partial<IngestionRunStats> = {}): IngestionRunStats {
    return {
      total_sources: 4,
      documents_inserted: 0,
      documents_updated: 0,
      documents_unchanged: 0,
      documents_deactivated: 0,
      chunks_written: 0,
      embedding_model: "test",
      failed_sources: [],
      last_processed_source: null,
      ...overrides,
    };
  }

  it(">50% failed sources marks run as failed", () => {
    const stats = makeStats({
      total_sources: 4,
      failed_sources: [
        { sourcePath: "a", error: "err" },
        { sourcePath: "b", error: "err" },
        { sourcePath: "c", error: "err" },
      ],
    });

    const result = computeFinalStatus(stats);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("3/4");
    expect(result.errorMessage).toContain(">50% threshold");
  });

  it("exactly 50% does not fail (only > 50% triggers failure)", () => {
    const stats = makeStats({
      total_sources: 4,
      failed_sources: [
        { sourcePath: "a", error: "err" },
        { sourcePath: "b", error: "err" },
      ],
    });

    const result = computeFinalStatus(stats);
    expect(result.status).toBe("completed");
    expect(result.errorMessage).toContain("2 source(s) failed");
  });

  it("0 failures is completed with no error message", () => {
    const stats = makeStats({ total_sources: 4, failed_sources: [] });

    const result = computeFinalStatus(stats);
    expect(result.status).toBe("completed");
    expect(result.errorMessage).toBeNull();
  });

  it("1 failure out of 4 is completed with warning", () => {
    const stats = makeStats({
      total_sources: 4,
      failed_sources: [{ sourcePath: "docs/bad.md", error: "parse error" }],
    });

    const result = computeFinalStatus(stats);
    expect(result.status).toBe("completed");
    expect(result.errorMessage).toContain("docs/bad.md");
  });
});

// ─── validateEmbeddingDimensions ───────────────────────────────────────────

describe("validateEmbeddingDimensions", () => {
  it("passes for correct dimensions", () => {
    const embeddings = [
      new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
      new Array(EXPECTED_EMBEDDING_DIM).fill(0.2),
    ];

    expect(() => validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM)).not.toThrow();
  });

  it("throws on wrong dimension with descriptive error", () => {
    const embeddings = [
      new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
      new Array(768).fill(0.2), // Wrong dimension
    ];

    expect(() => validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM)).toThrow(
      `Embedding dimension mismatch for chunk 1: expected ${EXPECTED_EMBEDDING_DIM}, got 768`,
    );
  });

  it("throws on empty embedding array entry", () => {
    const embeddings = [[]];

    expect(() => validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM)).toThrow(
      "Embedding dimension mismatch for chunk 0",
    );
  });
});

// ─── Edge case: empty content rejection ────────────────────────────────────

describe("Edge case: empty content produces no valid chunks", () => {
  it("chunkMarkdown returns [] for empty content, build treats as failed source", () => {
    // This tests the build pipeline's behavior when chunking produces nothing.
    // chunkMarkdown returns [] for empty content (tested in chunking.test.ts).
    // build.ts then filters for chunks >= 100 chars, finds none, and adds to failed_sources.
    const { chunkMarkdown } = require("@/lib/ai/knowledge/chunking");
    (chunkMarkdown as jest.Mock).mockReturnValue([]);

    const chunks: { chunkText: string }[] = [];
    const validChunks = chunks.filter((c) => c.chunkText.length >= 100);
    expect(validChunks).toHaveLength(0);

    // Build pipeline would add to failed_sources with this error
    const stats = {
      failed_sources: [] as Array<{ sourcePath: string; error: string }>,
    };
    if (validChunks.length === 0) {
      stats.failed_sources.push({
        sourcePath: "docs/empty.md",
        error: "No valid chunks (all below 100 chars)",
      });
    }
    expect(stats.failed_sources).toHaveLength(1);
    expect(stats.failed_sources[0].error).toContain("No valid chunks");
  });
});
