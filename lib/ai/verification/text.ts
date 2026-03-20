import { chatCompletion } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai";
import { getLogger } from "@/lib/utils/logger";
import {
  parseVisionDecisionResponse,
  type VisionDecisionResult,
} from "./vision";

const log = getLogger("ai:verification:text");
const KNOWN_CONTEXT_TOKENS = new Set([
  "wallet",
  "linked_wallets",
  "email",
  "x_username",
  "discord_username",
  "github_username",
  "farcaster_username",
  "farcaster_fid",
  "telegram_username",
]);

/**
 * Replaces {token} placeholders in a prompt template with resolved values.
 * Unrecognised tokens are left unchanged.
 * Tokens not present in the map (unlinked accounts) resolve to "[not linked]".
 */
export function substituteContextTokens(
  template: string,
  tokens: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const resolved = tokens[key];
    if (typeof resolved === "string") {
      return resolved;
    }
    return KNOWN_CONTEXT_TOKENS.has(key) ? "[not linked]" : match;
  });
}

/**
 * Returns true if the template contains any token beyond {wallet} that requires
 * a Privy getUserById call to resolve.
 */
export function promptRequiresPrivyFetch(template: string): boolean {
  const socialTokens = [
    "linked_wallets",
    "email",
    "x_username",
    "discord_username",
    "github_username",
    "farcaster_username",
    "farcaster_fid",
    "telegram_username",
  ];
  return socialTokens.some((t) => template.includes(`{${t}}`));
}

export function buildTextDecisionSystemPrompt(taskDescription: string): string {
  return [
    "You are a verification assistant for P2E Inferno, a Web3 education platform.",
    "Your job is to evaluate a user-submitted text response and determine if it satisfies the following requirement:",
    taskDescription,
    "",
    "Respond with a JSON object (no markdown, no code fences) with these fields:",
    '- "decision": "approve" | "retry" | "defer"',
    '- "decision" rules:',
    '  - "approve" only if the submitted text clearly satisfies the requirement',
    '  - "retry" if the user can fix it by resubmitting (wrong format, missing info, close but not quite right) — include a clear explanation in "reason"',
    '  - "defer" if it is genuinely ambiguous or requires human judgment (do not guess)',
    '- "confidence": number - 0 to 1, how confident you are in your decision',
    '- "reason": string - brief explanation of your decision, shown to the user on retry',
  ].join("\n");
}

export async function verifyTextWithAI(options: {
  submittedText: string;
  taskDescription: string;
  model: string;
  fallbacks?: string[];
  maxTokens?: number;
  temperature?: number;
  confidenceThreshold: number;
}): Promise<VisionDecisionResult> {
  const systemPrompt = buildTextDecisionSystemPrompt(options.taskDescription);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `User submitted: "${options.submittedText}"`,
    },
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
    log.error("Text verification threw", { err, model: options.model });
    return {
      success: false,
      error: "AI request failed",
      code: "AI_REQUEST_FAILED",
    };
  }

  if (!result.success) {
    return { success: false, error: result.error, code: result.code };
  }

  if (!("content" in result)) {
    return {
      success: false,
      error: "AI returned an unexpected tool-call response",
      code: "AI_UNEXPECTED_TOOL_CALL",
      model: result.model,
    };
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
  const effectiveDecision =
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
