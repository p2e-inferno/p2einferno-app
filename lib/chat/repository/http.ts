import type { ChatRespondUsageTier } from "@/lib/chat/server/respond-types";

export class ChatRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
    public readonly retryAfterSeconds?: number,
    public readonly tier?: ChatRespondUsageTier,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function ensureJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await parseJsonResponse<{
      error?: string;
      reason?: string;
      tier?: ChatRespondUsageTier;
    }>(response).catch(() => ({
      error: undefined,
      reason: undefined,
      tier: undefined,
    }));
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : undefined;
    throw new ChatRequestError(
      payload.error || `Chat request failed with status ${response.status}`,
      response.status,
      payload.reason,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      payload.tier,
    );
  }

  return parseJsonResponse<T>(response);
}
