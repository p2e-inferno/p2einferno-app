jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

var warnLog: jest.Mock;

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => {
    warnLog = warnLog || jest.fn();

    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: warnLog,
      error: jest.fn(),
    };
  },
}));

import { createAdminClient } from "@/lib/supabase/server";
import { searchKnowledgeBase } from "@/lib/ai/knowledge/retrieval";

const createAdminClientMock = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

function makeRow(overrides: Partial<{
  chunk_id: string;
  document_id: string;
  title: string;
  chunk_text: string;
  rank: number;
}> = {}) {
  return {
    chunk_id: overrides.chunk_id ?? "c1",
    document_id: overrides.document_id ?? "d1",
    title: overrides.title ?? "Title",
    chunk_text: overrides.chunk_text ?? "Content",
    metadata: {},
    rank: overrides.rank ?? 0.8,
    keyword_rank: 0.6,
    semantic_rank: 0.8,
  };
}

describe("searchKnowledgeBase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns all rpc results when no freshnessDays is configured", async () => {
    const rows = [makeRow()];
    createAdminClientMock.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: rows, error: null }),
    } as any);

    const results = await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: [0.1],
    });

    expect(results).toHaveLength(1);
    expect(warnLog).not.toHaveBeenCalled();
  });

  it("returns only fresh results when freshnessDays is configured", async () => {
    const rows = [
      makeRow({ chunk_id: "c1", document_id: "d1" }),
      makeRow({ chunk_id: "c2", document_id: "d2" }),
    ];
    createAdminClientMock.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: rows, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [
              { id: "d1", last_reviewed_at: new Date().toISOString() },
              {
                id: "d2",
                last_reviewed_at: new Date(
                  Date.now() - 60 * 24 * 60 * 60 * 1000,
                ).toISOString(),
              },
            ],
            error: null,
          }),
        }),
      }),
    } as any);

    const results = await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: [0.1],
      freshnessDays: 30,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.document_id).toBe("d1");
    expect(warnLog).not.toHaveBeenCalled();
  });

  it("logs freshness_collapse with initialResultCount when all candidates are filtered by freshness", async () => {
    const staleDate = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const rows = [
      makeRow({ chunk_id: "c1", document_id: "d1" }),
      makeRow({ chunk_id: "c2", document_id: "d2" }),
    ];
    createAdminClientMock.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: rows, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [
              { id: "d1", last_reviewed_at: staleDate },
              { id: "d2", last_reviewed_at: staleDate },
            ],
            error: null,
          }),
        }),
      }),
    } as any);

    const results = await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: [0.1],
      audience: ["support"],
      domainTags: ["quest"],
      freshnessDays: 7,
    });

    expect(results).toHaveLength(0);
    expect(warnLog).toHaveBeenCalledWith(
      "freshness filtering removed all KB results",
      expect.objectContaining({
        retrievalOutcome: "freshness_collapse",
        initialResultCount: 2,
        freshnessDays: 7,
        audience: ["support"],
        domainTags: ["quest"],
      }),
    );
  });

  it("does not log when freshness filtering reduces but does not eliminate results", async () => {
    const rows = [
      makeRow({ chunk_id: "c1", document_id: "d1" }),
      makeRow({ chunk_id: "c2", document_id: "d2" }),
    ];
    createAdminClientMock.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: rows, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({
            data: [
              { id: "d1", last_reviewed_at: new Date().toISOString() },
              {
                id: "d2",
                last_reviewed_at: new Date(
                  Date.now() - 60 * 24 * 60 * 60 * 1000,
                ).toISOString(),
              },
            ],
            error: null,
          }),
        }),
      }),
    } as any);

    await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: [0.1],
      freshnessDays: 30,
    });

    expect(warnLog).not.toHaveBeenCalledWith(
      "freshness filtering removed all KB results",
      expect.anything(),
    );
  });

  it("skips freshness lookup and returns empty array when rpc returns no results", async () => {
    const fromSpy = jest.fn();
    createAdminClientMock.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      from: fromSpy,
    } as any);

    const results = await searchKnowledgeBase({
      queryText: "test query",
      queryEmbedding: [0.1],
      freshnessDays: 30,
    });

    expect(results).toHaveLength(0);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });
});
