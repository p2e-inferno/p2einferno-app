/**
 * Unit tests for AI Knowledge Base retrieval module
 */

const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockIn = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";

describe("searchKnowledgeBase", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockIn.mockResolvedValue({ data: [], error: null });
    mockSelect.mockReturnValue({ in: mockIn });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it("maps arguments correctly to RPC call", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: new Array(1536).fill(0),
      audience: ["support"],
      domainTags: ["bootcamp"],
      limit: 5,
    });

    expect(mockRpc).toHaveBeenCalledWith("search_ai_kb_chunks", {
      query_text: "test query",
      query_embedding: new Array(1536).fill(0),
      audience_filter: ["support"],
      domain_filter: ["bootcamp"],
      limit_count: 5,
    });
  });

  it("passes null for optional filters when not provided", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchKnowledgeBase({
      queryText: "test",
      queryEmbedding: new Array(1536).fill(0),
    });

    expect(mockRpc).toHaveBeenCalledWith("search_ai_kb_chunks", {
      query_text: "test",
      query_embedding: new Array(1536).fill(0),
      audience_filter: null,
      domain_filter: null,
      limit_count: 8,
    });
  });

  it("throws on RPC error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "db connection failed" },
    });

    await expect(
      searchKnowledgeBase({
        queryText: "test",
        queryEmbedding: new Array(1536).fill(0),
      }),
    ).rejects.toEqual({ message: "db connection failed" });
  });

  it("returns empty array when data is null", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await searchKnowledgeBase({
      queryText: "test",
      queryEmbedding: new Array(1536).fill(0),
    });

    expect(result).toEqual([]);
  });

  it("returns data from successful RPC call", async () => {
    const mockResults = [
      {
        chunk_id: "abc",
        document_id: "def",
        title: "Test Doc",
        chunk_text: "test content",
        metadata: {},
        rank: 0.75,
        keyword_rank: 0.5,
        semantic_rank: 0.9,
      },
    ];
    mockRpc.mockResolvedValue({ data: mockResults, error: null });

    const result = await searchKnowledgeBase({
      queryText: "test",
      queryEmbedding: new Array(1536).fill(0),
    });

    expect(result).toEqual(mockResults);
  });

  it("applies freshness filtering when freshnessDays is provided", async () => {
    const now = new Date("2026-03-08T12:00:00.000Z");
    jest.spyOn(Date, "now").mockReturnValue(now.getTime());

    mockRpc.mockResolvedValue({
      data: [
        {
          chunk_id: "fresh-chunk",
          document_id: "fresh-doc",
          title: "Fresh",
          chunk_text: "fresh content",
          metadata: {},
          rank: 0.9,
          keyword_rank: 0.4,
          semantic_rank: 0.95,
        },
        {
          chunk_id: "stale-chunk",
          document_id: "stale-doc",
          title: "Stale",
          chunk_text: "stale content",
          metadata: {},
          rank: 0.8,
          keyword_rank: 0.3,
          semantic_rank: 0.9,
        },
      ],
      error: null,
    });
    mockIn.mockResolvedValue({
      data: [
        { id: "fresh-doc", last_reviewed_at: "2026-03-07T12:00:00.000Z" },
        { id: "stale-doc", last_reviewed_at: "2026-02-20T12:00:00.000Z" },
      ],
      error: null,
    });

    const result = await searchKnowledgeBase({
      queryText: "test",
      queryEmbedding: new Array(1536).fill(0),
      freshnessDays: 7,
    });

    expect(mockFrom).toHaveBeenCalledWith("ai_kb_documents");
    expect(mockSelect).toHaveBeenCalledWith("id, last_reviewed_at");
    expect(mockIn).toHaveBeenCalledWith("id", ["fresh-doc", "stale-doc"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.document_id).toBe("fresh-doc");
  });
});
