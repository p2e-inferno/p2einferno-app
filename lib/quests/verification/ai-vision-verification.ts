/**
 * AI Vision Verification Strategy (Quest submit_proof)
 *
 * Verifies quest tasks using AI vision analysis (screenshot proof).
 *
 * AI never auto-rejects: it either auto-approves, requests retry (user resubmits),
 * or defers to admin review.
 */

import type { TaskType } from "@/lib/supabase/types";
import type {
  VerificationStrategy,
  VerificationOptions,
} from "./types";
import { getLogger } from "@/lib/utils/logger";
import { verifyScreenshotWithAI } from "@/lib/ai/verification/vision";
import {
  asRecord,
  hashUserId,
  mapAIDecisionToVerificationResult,
  resolveAIConfidenceThreshold,
  resolveAIModel,
} from "./utils";

const log = getLogger("quests:ai-vision-verification");

const DEFAULT_VISION_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_VISION_FALLBACKS = ["openai/gpt-4o-mini"];
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

function extractScreenshotUrl(
  verificationData: Record<string, unknown>,
): string | null {
  const candidates: Array<unknown> = [
    verificationData.imageUrl,
    verificationData.screenshotUrl,
    verificationData.fileUrl,
    verificationData.inputData,
    verificationData.submissionUrl,
    verificationData.url,
    verificationData.file_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

export class AIVisionVerificationStrategy implements VerificationStrategy {
  async verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    _userAddress: string,
    options?: VerificationOptions,
  ) {
    const taskConfig = asRecord(options?.taskConfig);

    const rawPrompt = taskConfig?.ai_verification_prompt;
    const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";

    if (!prompt) {
      return {
        success: false,
        error: "AI verification not configured for this task",
        code: "AI_NOT_CONFIGURED",
      };
    }

    const imageUrl = extractScreenshotUrl(verificationData);
    if (!imageUrl) {
      return {
        success: false,
        error: "Screenshot proof is required for AI verification",
        code: "AI_IMAGE_REQUIRED",
      };
    }

    const confidenceThreshold = resolveAIConfidenceThreshold(
      taskConfig,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    const model = resolveAIModel(taskConfig, DEFAULT_VISION_MODEL);

    const hashedUserId = hashUserId(userId);
    log.debug("Starting AI vision verification", {
      taskType,
      hashedUserId,
      model,
    });

    const visionResult = await verifyScreenshotWithAI({
      imageUrl,
      taskDescription: prompt,
      model,
      fallbacks: DEFAULT_VISION_FALLBACKS,
      maxTokens: 300,
      temperature: 0.1,
      confidenceThreshold,
    });

    if (!visionResult.success) {
      if (visionResult.code === "AI_PARSE_ERROR") {
        return {
          success: false,
          error: visionResult.error,
          code: "AI_PARSE_ERROR",
          metadata: {
            aiRawContent: visionResult.rawContent,
            aiModel: visionResult.model || model,
          },
        };
      }

      log.error("AI vision verification failed", {
        error: visionResult.error,
        code: visionResult.code,
        hashedUserId,
        taskType,
      });
      return {
        success: false,
        error: "AI verification service unavailable",
        code: "AI_SERVICE_ERROR",
        metadata: { aiError: visionResult.error },
      };
    }

    return mapAIDecisionToVerificationResult({
      decision: visionResult.decision,
      confidence: visionResult.confidence,
      reason: visionResult.reason,
      model: visionResult.model,
    });
  }
}
