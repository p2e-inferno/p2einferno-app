/**
 * Unit tests for /api/ai/kb/search endpoint
 */

import type { NextApiRequest, NextApiResponse } from "next";

const mockEmbedTexts = jest.fn();
const mockSearchKnowledgeBase = jest.fn();

jest.mock("@/lib/ai/knowledge/embeddings", () => ({
  embedTexts: (...args: unknown[]) => mockEmbedTexts(...args),
}));

jest.mock("@/lib/ai/knowledge/retrieval", () => ({
  searchKnowledgeBase: (...args: unknown[]) => mockSearchKnowledgeBase(...args),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import handler from "@/pages/api/ai/kb/search";

function createMockReqRes(overrides: {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}) {
  const req = {
    method: overrides.method ?? "POST",
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
  } as NextApiRequest;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse;

  return { req, res };
}

describe("POST /api/ai/kb/search", () => {
  const VALID_SECRET = "test-secret-value";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_KB_API_SECRET = VALID_SECRET;
  });

  afterAll(() => {
    delete process.env.AI_KB_API_SECRET;
  });

  it("returns 405 for GET", async () => {
    const { req, res } = createMockReqRes({ method: "GET" });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 405 for PUT", async () => {
    const { req, res } = createMockReqRes({ method: "PUT" });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 405 for DELETE", async () => {
    const { req, res } = createMockReqRes({ method: "DELETE" });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { req, res } = createMockReqRes({
      body: { query: "test" },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
  });

  it("returns 401 when secret is wrong", async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: "Bearer wrong-secret" },
      body: { query: "test" },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
  });

  it("returns 401 on near-miss secret (timing-safe check)", async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}x` },
      body: { query: "test" },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 400 for empty query", async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "" },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for query over 500 chars", async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "a".repeat(501) },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for missing body", async () => {
    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: undefined,
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 200 with correct shape on valid request", async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    mockEmbedTexts.mockResolvedValue([mockEmbedding]);
    mockSearchKnowledgeBase.mockResolvedValue([
      {
        chunk_id: "abc",
        document_id: "def",
        title: "Test",
        chunk_text: "test content",
        metadata: {},
        rank: 0.75,
        keyword_rank: 0.5,
        semantic_rank: 0.9,
      },
    ]);

    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "test query" },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg).toHaveProperty("results");
    expect(jsonArg).toHaveProperty("query", "test query");
    expect(jsonArg).toHaveProperty("count", 1);
    expect(jsonArg).toHaveProperty("tookMs");
  });

  it("caps limit at 20 regardless of caller input", async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    mockEmbedTexts.mockResolvedValue([mockEmbedding]);
    mockSearchKnowledgeBase.mockResolvedValue([]);

    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "test", limit: 100 },
    });
    await handler(req, res);

    expect(mockSearchKnowledgeBase).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it("returns 500 with generic error when embedTexts throws", async () => {
    mockEmbedTexts.mockRejectedValue(new Error("API timeout"));

    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "test" },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "internal_error" });
  });

  it("returns 500 with generic error when searchKnowledgeBase throws", async () => {
    mockEmbedTexts.mockResolvedValue([new Array(1536).fill(0)]);
    mockSearchKnowledgeBase.mockRejectedValue(new Error("DB down"));

    const { req, res } = createMockReqRes({
      headers: { authorization: `Bearer ${VALID_SECRET}` },
      body: { query: "test" },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "internal_error" });
  });
});
