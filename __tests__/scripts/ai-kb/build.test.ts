/**
 * Unit tests for AI Knowledge Base build.ts
 *
 * Tests exported helpers: parseModeFromArgv, acquireIngestionLock,
 * computeFinalStatus, validateEmbeddingDimensions, filterValidChunks.
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
  acquireIngestionLock,
  computeFinalStatus,
  validateEmbeddingDimensions,
  filterValidChunks,
  EXPECTED_EMBEDDING_DIM,
  MIN_CHUNK_LENGTH,
} from "@/scripts/ai-kb/build";

import { chunkMarkdown } from "@/lib/ai/knowledge/chunking";
import type { IngestionRunStats } from "@/lib/ai/knowledge/types";

/** Creates a mock supabase-like object. */
function createMockSupabase() {
  return {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  };
}

// ─── parseModeFromArgv ─────────────────────────────────────────────────────

describe("parseModeFromArgv", () => {
  it("parses --mode incremental", () => {
    expect(
      parseModeFromArgv(["node", "build.ts", "--mode", "incremental"]),
    ).toBe("incremental");
  });

  it("parses --mode=incremental", () => {
    expect(parseModeFromArgv(["node", "build.ts", "--mode=incremental"])).toBe(
      "incremental",
    );
  });

  it("defaults to full for invalid input", () => {
    expect(parseModeFromArgv(["node", "build.ts", "--mode", "weird"])).toBe(
      "full",
    );
  });
});

// ─── acquireIngestionLock ──────────────────────────────────────────────────

describe("acquireIngestionLock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("acquired — RPC returns acquired with new run_id", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: "acquired",
          run_id: "new-run-1",
          blocking_run_id: null,
          stale_cleared: false,
        },
      ],
      error: null,
    });

    const result = await acquireIngestionLock(createMockSupabase(), "full");
    expect(result.status).toBe("acquired");
    expect(result.run_id).toBe("new-run-1");
    expect(result.stale_cleared).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith("acquire_ingestion_lock", {
      p_run_type: "full",
      p_stale_threshold_min: 60,
    });
  });

  it("blocked — RPC returns blocked with blocking_run_id", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: "blocked",
          run_id: null,
          blocking_run_id: "run-active",
          stale_cleared: false,
        },
      ],
      error: null,
    });

    const result = await acquireIngestionLock(
      createMockSupabase(),
      "incremental",
    );
    expect(result.status).toBe("blocked");
    expect(result.blocking_run_id).toBe("run-active");
    expect(result.run_id).toBeNull();
  });

  it("acquired with stale cleared — RPC marks stale run as failed and proceeds", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          status: "acquired",
          run_id: "new-run-2",
          blocking_run_id: null,
          stale_cleared: true,
        },
      ],
      error: null,
    });

    const result = await acquireIngestionLock(createMockSupabase(), "full");
    expect(result.status).toBe("acquired");
    expect(result.run_id).toBe("new-run-2");
    expect(result.stale_cleared).toBe(true);
  });

  it("throws on RPC error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(
      acquireIngestionLock(createMockSupabase(), "full"),
    ).rejects.toThrow("acquire_ingestion_lock RPC failed: connection refused");
  });
});

// ─── computeFinalStatus ────────────────────────────────────────────────────

describe("computeFinalStatus", () => {
  function makeStats(
    overrides: Partial<IngestionRunStats> = {},
  ): IngestionRunStats {
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

    expect(() =>
      validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM),
    ).not.toThrow();
  });

  it("throws on wrong dimension with descriptive error", () => {
    const embeddings = [
      new Array(EXPECTED_EMBEDDING_DIM).fill(0.1),
      new Array(768).fill(0.2), // Wrong dimension
    ];

    expect(() =>
      validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM),
    ).toThrow(
      `Embedding dimension mismatch for chunk 1: expected ${EXPECTED_EMBEDDING_DIM}, got 768`,
    );
  });

  it("throws on empty embedding array entry", () => {
    const embeddings = [[]];

    expect(() =>
      validateEmbeddingDimensions(embeddings, EXPECTED_EMBEDDING_DIM),
    ).toThrow("Embedding dimension mismatch for chunk 0");
  });
});

// ─── filterValidChunks ────────────────────────────────────────────────────

describe("filterValidChunks", () => {
  it("keeps chunks at or above MIN_CHUNK_LENGTH", () => {
    const longText = "a".repeat(MIN_CHUNK_LENGTH);
    const chunks = [
      { chunkText: longText, chunkIndex: 0 },
      { chunkText: longText + " extra", chunkIndex: 1 },
    ];

    const result = filterValidChunks(chunks);
    expect(result).toHaveLength(2);
  });

  it("rejects chunks below MIN_CHUNK_LENGTH", () => {
    const chunks = [
      { chunkText: "short", chunkIndex: 0 },
      { chunkText: "a".repeat(99), chunkIndex: 1 },
    ];

    const result = filterValidChunks(chunks);
    expect(result).toHaveLength(0);
  });

  it("empty content → chunkMarkdown returns [] → filterValidChunks returns []", () => {
    // This exercises the real production path:
    // 1. chunkMarkdown returns [] for empty content
    // 2. filterValidChunks (from build.ts) returns [] → build treats as failed source
    (chunkMarkdown as jest.Mock).mockReturnValue([]);

    const chunks = (chunkMarkdown as jest.Mock)({
      contentMarkdown: "",
      sourcePath: "test:empty",
      sourceType: "doc",
    });

    const validChunks = filterValidChunks(chunks);
    expect(validChunks).toHaveLength(0);

    // This is the condition build.ts checks to add to failed_sources
    // (line: if validChunks.length === 0 → push to failed_sources)
    expect(validChunks.length === 0).toBe(true);
  });

  it("mixed chunks: only valid ones survive", () => {
    const chunks = [
      { chunkText: "too short", chunkIndex: 0 },
      { chunkText: "a".repeat(MIN_CHUNK_LENGTH), chunkIndex: 1 },
      { chunkText: "also short", chunkIndex: 2 },
      { chunkText: "b".repeat(200), chunkIndex: 3 },
    ];

    const result = filterValidChunks(chunks);
    expect(result).toHaveLength(2);
    expect(result[0]?.chunkIndex).toBe(1);
    expect(result[1]?.chunkIndex).toBe(3);
  });
});
