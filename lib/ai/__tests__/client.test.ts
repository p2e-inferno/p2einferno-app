// @ts-nocheck
/**
 * Unit Tests for OpenRouter AI Client
 */

jest.mock("@/lib/utils/logger", () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import { chatCompletion } from "../client";

// Save original fetch
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "sk-or-test-key";
  process.env.OPENROUTER_DEFAULT_MODEL = "test/default-model";
  process.env.NEXT_PUBLIC_APP_URL = "https://test.p2einferno.com";
  global.fetch = jest.fn();
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_DEFAULT_MODEL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

// Helper to create a mock OpenRouter response
function mockOpenRouterResponse(overrides: any = {}) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      model: "test/model-v1",
      choices: [
        {
          message: { content: "Hello from AI" },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
      ...overrides,
    }),
    text: jest.fn().mockResolvedValue(""),
  };
}

describe("chatCompletion", () => {
  test("should return success with valid response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("Hello from AI");
      expect(result.model).toBe("test/model-v1");
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
    }
  });

  test("should use specified model over default", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      model: "anthropic/claude-sonnet-4",
      messages: [{ role: "user", content: "Hello" }],
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe("anthropic/claude-sonnet-4");
  });

  test("should use default model when none specified", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.model).toBe("test/default-model");
  });

  test("should send fallback route config when fallbacks provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      model: "primary/model",
      messages: [{ role: "user", content: "Hello" }],
      fallbacks: ["fallback/model-a", "fallback/model-b"],
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.route).toBe("fallback");
    expect(body.models).toEqual([
      "primary/model",
      "fallback/model-a",
      "fallback/model-b",
    ]);
  });

  test("should not include route/models when no fallbacks", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.route).toBeUndefined();
    expect(body.models).toBeUndefined();
  });

  test("should pass maxTokens and temperature when provided", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 500,
      temperature: 0.3,
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.max_tokens).toBe(500);
    expect(body.temperature).toBe(0.3);
  });

  test("should include attribution headers", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse());

    await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["Authorization"]).toBe("Bearer sk-or-test-key");
    expect(headers["HTTP-Referer"]).toBe("https://test.p2einferno.com");
    expect(headers["X-Title"]).toBe("P2E Inferno");
  });

  test("should return AI_API_ERROR on non-200 status", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue("Rate limited"),
    });

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("AI_API_ERROR");
      expect(result.error).toContain("429");
    }
  });

  test("should return AI_EMPTY_RESPONSE when content is empty", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        model: "test/model",
        choices: [{ message: { content: "" } }],
      }),
    });

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("AI_EMPTY_RESPONSE");
    }
  });

  test("should return AI_EMPTY_RESPONSE when choices array is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ model: "test/model" }),
    });

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("AI_EMPTY_RESPONSE");
    }
  });

  test("should return AI_REQUEST_FAILED on network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(
      new Error("Network connection failed"),
    );

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("AI_REQUEST_FAILED");
      expect(result.error).toBe("Network connection failed");
    }
  });

  test("should return AI_CANCELLED on AbortError", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    (global.fetch as jest.Mock).mockRejectedValue(abortError);

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("AI_CANCELLED");
    }
  });

  test("should throw on missing API key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      chatCompletion({
        messages: [{ role: "user", content: "Hello" }],
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY is not configured");
  });

  test("should handle response without usage data", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        model: "test/model",
        choices: [{ message: { content: "Response without usage" } }],
      }),
    });

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("Response without usage");
      expect(result.usage).toBeUndefined();
    }
  });

  test("should trim whitespace from response content", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        model: "test/model",
        choices: [{ message: { content: "  trimmed response  \n" } }],
      }),
    });

    const result = await chatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toBe("trimmed response");
    }
  });
});
