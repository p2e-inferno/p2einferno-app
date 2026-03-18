import { CHAT_STORAGE_KEYS } from "@/lib/chat/constants";
import type { ChatAuthContext } from "@/lib/chat/types";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getRateLimitKey(auth: ChatAuthContext) {
  if (!auth.isAuthenticated) {
    return CHAT_STORAGE_KEYS.anonymousRateLimit;
  }

  return `${CHAT_STORAGE_KEYS.authenticatedRateLimit}:${auth.privyUserId ?? "unknown"}`;
}

export function readChatRateLimitUntil(auth: ChatAuthContext) {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(getRateLimitKey(auth));
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) && raw !== "Infinity") {
    storage.removeItem(getRateLimitKey(auth));
    return null;
  }

  if (parsed !== Infinity && parsed <= Date.now()) {
    storage.removeItem(getRateLimitKey(auth));
    return null;
  }

  return parsed;
}

export function writeChatRateLimitUntil(
  auth: ChatAuthContext,
  rateLimitedUntil: number | null,
) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const key = getRateLimitKey(auth);
  if (rateLimitedUntil === null) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, String(rateLimitedUntil));
}
