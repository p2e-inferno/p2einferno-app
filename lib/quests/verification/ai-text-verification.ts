/**
 * AI Text Verification Strategy (Quest submit_text)
 *
 * Verifies quest tasks using AI text analysis against an admin-configured prompt.
 * User context (wallet addresses, linked social accounts) is injected into the
 * prompt as resolved tokens before the strategy is called — the strategy itself
 * receives the already-substituted prompt via verificationData.resolvedPrompt.
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
import { verifyTextWithAI } from "@/lib/ai/verification/text";
import {
  asRecord,
  hashUserId,
  mapAIDecisionToVerificationResult,
  resolveAIConfidenceThreshold,
  resolveAIModel,
} from "./utils";

const log = getLogger("quests:ai-text-verification");

const DEFAULT_TEXT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_TEXT_FALLBACKS = ["openai/gpt-4o-mini"];
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export class AITextVerificationStrategy implements VerificationStrategy {
  async verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    _userAddress: string,
    options?: VerificationOptions,
  ) {
    const taskConfig = asRecord(options?.taskConfig);

    // The resolved prompt (with tokens already substituted) is passed in from
    // complete-task.ts. Fall through to manual review if not configured.
    const resolvedPrompt =
      typeof verificationData.resolvedPrompt === "string"
        ? verificationData.resolvedPrompt.trim()
        : "";

    if (!resolvedPrompt) {
      return {
        success: false,
        error: "AI verification not configured for this task",
        code: "AI_NOT_CONFIGURED",
      };
    }

    const inputText =
      typeof verificationData.inputData === "string"
        ? verificationData.inputData.trim()
        : "";

    if (!inputText) {
      return {
        success: false,
        error: "Text submission is required",
        code: "AI_TEXT_REQUIRED",
      };
    }

    const confidenceThreshold = resolveAIConfidenceThreshold(
      taskConfig,
      DEFAULT_CONFIDENCE_THRESHOLD,
    );
    const model = resolveAIModel(taskConfig, DEFAULT_TEXT_MODEL);
    const hashedUserId = hashUserId(userId);

    log.debug("Starting AI text verification", {
      taskType,
      hashedUserId,
      model,
    });

    const textResult = await verifyTextWithAI({
      submittedText: inputText,
      taskDescription: resolvedPrompt,
      model,
      fallbacks: DEFAULT_TEXT_FALLBACKS,
      maxTokens: 300,
      temperature: 0.1,
      confidenceThreshold,
    });

    if (!textResult.success) {
      if (textResult.code === "AI_PARSE_ERROR") {
        return {
          success: false,
          error: textResult.error,
          code: "AI_PARSE_ERROR",
          metadata: {
            aiRawContent: textResult.rawContent,
            aiModel: textResult.model || model,
          },
        };
      }

      log.error("AI text verification failed", {
        error: textResult.error,
        code: textResult.code,
        hashedUserId,
        taskType,
      });
      return {
        success: false,
        error: "AI verification service unavailable",
        code: "AI_SERVICE_ERROR",
        metadata: { aiError: textResult.error },
      };
    }

    return mapAIDecisionToVerificationResult({
      decision: textResult.decision,
      confidence: textResult.confidence,
      reason: textResult.reason,
      model: textResult.model,
    });
  }
}
