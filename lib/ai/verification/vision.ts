import { chatCompletion } from "@/lib/ai";
import type { ChatMessage, TextContent, ImageUrlContent } from "@/lib/ai";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ai:verification:vision");

export type VisionDecision = "approve" | "retry" | "defer";

export type VisionDecisionResult =
  | {
      success: true;
      decision: VisionDecision;
      confidence: number;
      reason: string;
      model: string;
    }
  | {
      success: false;
      error: string;
      code: string;
      model?: string;
      rawContent?: string;
    };

export function buildVisionDecisionSystemPrompt(
  taskDescription: string,
): string {
  return [
    "You are a verification assistant for P2E Inferno, a Web3 education platform.",
    "Your job is to analyze a user-submitted screenshot and determine if it shows proof of the user",
    `${taskDescription}.`,
    "",
    "Respond with a JSON object (no markdown, no code fences) with these fields:",
    '- "decision": "approve" | "retry" | "defer"',
    '- "decision" rules:',
    '  - "approve" only if the screenshot clearly shows completion',
    '  - "retry" if the user likely can fix by resubmitting a clearer/correct screenshot (cropped, blurry, wrong screen, missing key element)',
    '  - "defer" if it is ambiguous or requires human judgment (do not guess)',
    '- "confidence": number - 0 to 1, how confident you are',
    '- "reason": string - brief explanation of your decision',
  ].join("\n");
}

function parseVisionDecisionResponse(content: string): {
  decision: VisionDecision;
  confidence: number;
  reason: string;
} | null {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const candidates =
    firstBrace >= 0 && lastBrace > firstBrace
      ? [cleaned, cleaned.slice(firstBrace, lastBrace + 1)]
      : [cleaned];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.decision === "string") {
        const decision = parsed.decision as string;
        if (
          (decision === "approve" ||
            decision === "retry" ||
            decision === "defer") &&
          typeof parsed.confidence === "number" &&
          typeof parsed.reason === "string"
        ) {
          const confidence = Math.min(1, Math.max(0, parsed.confidence));
          return {
            decision,
            confidence,
            reason: parsed.reason,
          };
        }
      }

      // Backward-compat: { verified, confidence, reason }
      if (
        typeof parsed?.verified === "boolean" &&
        typeof parsed.confidence === "number" &&
        typeof parsed.reason === "string"
      ) {
        const confidence = Math.min(1, Math.max(0, parsed.confidence));
        return {
          decision: parsed.verified ? "approve" : "defer",
          confidence,
          reason: parsed.reason,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function verifyScreenshotWithAI(options: {
  imageUrl: string;
  taskDescription: string;
  model: string;
  fallbacks?: string[];
  maxTokens?: number;
  temperature?: number;
  confidenceThreshold: number;
}): Promise<VisionDecisionResult> {
  const systemPrompt = buildVisionDecisionSystemPrompt(options.taskDescription);
  const userContent: Array<TextContent | ImageUrlContent> = [
    {
      type: "text",
      text: "Please verify this screenshot shows proof of task completion:",
    },
    {
      type: "image_url",
      image_url: { url: options.imageUrl },
    },
  ];

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  let result;
  try {
    result = await chatCompletion({
      model: options.model,
      messages,
      maxTokens: options.maxTokens ?? 300,
      temperature: options.temperature ?? 0.1,
      fallbacks: options.fallbacks,
    });
  } catch (err: unknown) {
    log.error("Vision verification threw", { err, model: options.model });
    return {
      success: false,
      error: "AI request failed",
      code: "AI_REQUEST_FAILED",
    };
  }

  if (!result.success) {
    return { success: false, error: result.error, code: result.code };
  }

  const parsed = parseVisionDecisionResponse(result.content);
  if (!parsed) {
    return {
      success: false,
      error: "AI returned an invalid response format",
      code: "AI_PARSE_ERROR",
      model: result.model,
      rawContent: result.content,
    };
  }

  const confidence = Math.min(1, Math.max(0, parsed.confidence));
  const clampedThreshold = Math.min(
    1,
    Math.max(0, options.confidenceThreshold),
  );
  const effectiveDecision: VisionDecision =
    parsed.decision === "approve" && confidence < clampedThreshold
      ? "retry"
      : parsed.decision;

  return {
    success: true,
    decision: effectiveDecision,
    confidence,
    reason: parsed.reason,
    model: result.model,
  };
}
