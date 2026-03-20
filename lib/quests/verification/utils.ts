import { createHash } from "crypto";

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
