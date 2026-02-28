// @ts-nocheck
/**
 * Unit Tests for AI Verification Strategy
 *
 * Tests screenshot proof verification using OpenRouter vision models.
 */

jest.mock("@/lib/utils/logger", () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock("@/lib/ai", () => ({
  chatCompletion: jest.fn(),
}));

import { AIVerificationStrategy } from "../ai-vision-verification";
import { chatCompletion } from "@/lib/ai";

const MOCK_USER_ID = "user-123";
const MOCK_USER_ADDRESS = "0x1111111111111111111111111111111111111111";

function makeOptions(overrides: any = {}) {
  return {
    taskConfig: {
      ai_verification_prompt:
        "has completed the lesson and the completion badge is visible",
      ...overrides,
    },
    taskId: "task-1",
  };
}

describe("AIVerificationStrategy", () => {
  let strategy: AIVerificationStrategy;

  beforeEach(() => {
    strategy = new AIVerificationStrategy();
    (chatCompletion as jest.Mock).mockReset();
  });

  test("returns AI_IMAGE_REQUIRED when AI is configured but no image URL is provided", async () => {
    const result = await strategy.verify(
      "submit_proof",
      { inputData: "" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_IMAGE_REQUIRED");
  });

  test("returns AI_NOT_CONFIGURED when ai_verification_prompt is missing", async () => {
    const result = await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      { taskConfig: {}, taskId: "task-1" },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_NOT_CONFIGURED");
  });

  test("approves when verified=true and confidence >= threshold", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        decision: "approve",
        confidence: 0.9,
        reason: "Badge is visible in the screenshot.",
      }),
      model: "google/gemini-2.0-flash-001",
    });

    const result = await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.metadata.aiVerified).toBe(true);
      expect(result.metadata.aiConfidence).toBe(0.9);
      expect(result.metadata.aiModel).toBe("google/gemini-2.0-flash-001");
      expect(result.metadata.aiDecision).toBe("approve");
      expect(typeof result.metadata.verifiedAt).toBe("string");
    }
  });

  test("uses task-configured ai_confidence_threshold for auto-approval gating", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        decision: "approve",
        confidence: 0.9,
        reason: "Looks correct, but not sure enough.",
      }),
      model: "google/gemini-2.0-flash-001",
    });

    const result = await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions({ ai_confidence_threshold: 0.95 }),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_RETRY");
  });

  test("uses task-configured ai_model when calling chatCompletion", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        decision: "approve",
        confidence: 0.9,
        reason: "Badge is visible.",
      }),
      model: "some/actual-model",
    });

    await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions({ ai_model: "openai/gpt-4o-mini" }),
    );

    const call = (chatCompletion as jest.Mock).mock.calls[0]?.[0];
    expect(call.model).toBe("openai/gpt-4o-mini");
  });

  test("defers when confidence is below threshold (never auto-rejects)", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        decision: "defer",
        confidence: 0.4,
        reason: "The screenshot is too blurry to confirm.",
      }),
      model: "openai/gpt-4o-mini",
    });

    const result = await strategy.verify(
      "submit_proof",
      { screenshotUrl: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_DEFER");
    expect(result.metadata.aiVerified).toBe(false);
    expect(result.metadata.aiConfidence).toBe(0.4);
    expect(result.metadata.aiModel).toBe("openai/gpt-4o-mini");
  });

  test("requests retry when decision is retry", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content: JSON.stringify({
        decision: "retry",
        confidence: 0.6,
        reason: "Please include the completion badge in the screenshot.",
      }),
      model: "google/gemini-2.0-flash-001",
    });

    const result = await strategy.verify(
      "submit_proof",
      { screenshotUrl: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_RETRY");
    expect(result.error).toContain("completion badge");
    expect(result.metadata.aiDecision).toBe("retry");
  });

  test("parses JSON wrapped in code fences", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: true,
      content:
        "```json\n" +
        JSON.stringify({
          decision: "approve",
          confidence: 0.75,
          reason: "Looks correct.",
        }) +
        "\n```",
      model: "google/gemini-2.0-flash-001",
    });

    const result = await strategy.verify(
      "submit_proof",
      { fileUrl: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(true);
  });

  test("returns AI_SERVICE_ERROR when chatCompletion returns an error result", async () => {
    (chatCompletion as jest.Mock).mockResolvedValue({
      success: false,
      error: "Rate limited",
      code: "AI_API_ERROR",
    });

    const result = await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_SERVICE_ERROR");
  });

  test("returns AI_SERVICE_ERROR when chatCompletion throws", async () => {
    (chatCompletion as jest.Mock).mockRejectedValue(
      new Error("OPENROUTER_API_KEY is not configured"),
    );

    const result = await strategy.verify(
      "submit_proof",
      { inputData: "https://example.com/screenshot.png" },
      MOCK_USER_ID,
      MOCK_USER_ADDRESS,
      makeOptions(),
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AI_SERVICE_ERROR");
  });
});
