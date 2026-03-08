/**
 * Unit tests for AI Knowledge Base embeddings module
 */

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { getEmbeddingModel, getEmbeddingBatch, embedTexts } from "@/lib/ai/knowledge/embeddings";

describe("getEmbeddingModel", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns env var value when set", () => {
    process.env.OPENROUTER_EMBEDDING_MODEL = "custom/model";
    expect(getEmbeddingModel()).toBe("custom/model");
  });

  it("returns default when env var is not set", () => {
    delete process.env.OPENROUTER_EMBEDDING_MODEL;
    expect(getEmbeddingModel()).toBe("openai/text-embedding-3-small");
  });
});

describe("getEmbeddingBatch", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENROUTER_API_KEY = "test-key";
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws when OPENROUTER_API_KEY is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(getEmbeddingBatch(["test"])).rejects.toThrow(
      "OPENROUTER_API_KEY is not configured",
    );
  });

  it("returns embeddings from successful API call", async () => {
    const mockEmbeddings = [[0.1, 0.2, 0.3]];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ embedding: mockEmbeddings[0] }],
        }),
    }) as jest.Mock;

    const result = await getEmbeddingBatch(["test text"]);
    expect(result).toEqual(mockEmbeddings);
  });

  it("throws on non-ok response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
    }) as jest.Mock;

    await expect(getEmbeddingBatch(["test"])).rejects.toThrow(
      "Embeddings API error: 429",
    );
  });

  it("throws descriptive error on timeout", async () => {
    global.fetch = jest.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as jest.Mock;

    await expect(getEmbeddingBatch(["test"])).rejects.toThrow(
      "Embeddings request timed out",
    );
  });
});

describe("embedTexts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENROUTER_API_KEY = "test-key";
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("batches texts and returns all embeddings", async () => {
    const mockEmbedding = new Array(1536).fill(0.1);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ embedding: mockEmbedding }],
        }),
    }) as jest.Mock;

    const result = await embedTexts(["text1"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(mockEmbedding);
  });

  it("retries once on transient failure", async () => {
    const mockEmbedding = [0.1, 0.2];
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("server error"),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ embedding: mockEmbedding }],
          }),
      });
    }) as jest.Mock;

    const result = await embedTexts(["test"]);
    expect(result).toEqual([mockEmbedding]);
    expect(callCount).toBe(2);
  });

  it("validates returned array length matches input", async () => {
    const mockEmbedding = [0.1, 0.2];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { embedding: mockEmbedding },
            { embedding: mockEmbedding },
          ],
        }),
    }) as jest.Mock;

    const result = await embedTexts(["text1", "text2"]);
    expect(result).toHaveLength(2);
  });
});
