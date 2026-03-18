import { CHAT_STORAGE_KEYS } from "@/lib/chat/constants";
import type { ChatAuthContext } from "@/lib/chat/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("chat:rate-limit-storage");

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getRateLimitKey(auth: ChatAuthContext) {
  if (!auth.isAuthenticated || !auth.privyUserId) {
    if (auth.isAuthenticated && !auth.privyUserId) {
      log.warn(
        "Authenticated chat rate limit storage missing privyUserId; falling back to anonymous key",
        {
          authenticatedKey: CHAT_STORAGE_KEYS.authenticatedRateLimit,
          anonymousKey: CHAT_STORAGE_KEYS.anonymousRateLimit,
          privyUserId: auth.privyUserId,
        },
      );
    }

    return CHAT_STORAGE_KEYS.anonymousRateLimit;
  }

  return `${CHAT_STORAGE_KEYS.authenticatedRateLimit}:${auth.privyUserId}`;
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
