import {
  readChatRateLimitUntil,
  writeChatRateLimitUntil,
} from "@/lib/chat/rate-limit-storage";
import type { ChatAuthContext } from "@/lib/chat/types";

const anonymousAuth: ChatAuthContext = {
  isReady: true,
  isAuthenticated: false,
  privyUserId: null,
  walletAddress: null,
};

describe("chat rate limit storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and restores an active cooldown", () => {
    const rateLimitedUntil = Date.now() + 60_000;

    writeChatRateLimitUntil(anonymousAuth, rateLimitedUntil);

    expect(readChatRateLimitUntil(anonymousAuth)).toBe(rateLimitedUntil);
  });

  it("drops expired cooldowns on read", () => {
    writeChatRateLimitUntil(anonymousAuth, Date.now() - 1_000);

    expect(readChatRateLimitUntil(anonymousAuth)).toBeNull();
  });
});
