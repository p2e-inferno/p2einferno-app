import { createHash } from "crypto";
import type { VerificationResult } from "./types";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function hashUserId(userId: string): string {
  try {
    return createHash("sha256").update(userId).digest("hex").slice(0, 12);
  } catch {
    return "redacted";
  }
}

export function resolveAIConfidenceThreshold(
  taskConfig: Record<string, unknown> | null,
  fallback: number,
): number {
  const raw = taskConfig?.ai_confidence_threshold;
  const parsed =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

export function resolveAIModel(
  taskConfig: Record<string, unknown> | null,
  fallback: string,
): string {
  const raw = taskConfig?.ai_model;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return fallback;
}

export function mapAIDecisionToVerificationResult(params: {
  decision: "approve" | "retry" | "defer";
  confidence: number;
  reason: string;
  model?: string;
}): VerificationResult {
  const metadata = {
    aiDecision: params.decision,
    aiVerified: params.decision === "approve",
    aiConfidence: params.confidence,
    aiReason: params.reason,
    aiModel: params.model,
    verifiedAt: new Date().toISOString(),
  };

  if (params.decision === "approve") {
    return { success: true, metadata };
  }

  if (params.decision === "retry") {
    return {
      success: false,
      error: params.reason,
      code: "AI_RETRY",
      metadata,
    };
  }

  return {
    success: false,
    error: params.reason,
    code: "AI_DEFER",
    metadata,
  };
}
