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

const authenticatedAuth: ChatAuthContext = {
  isReady: true,
  isAuthenticated: true,
  privyUserId: "did:privy:test-user",
  walletAddress: "0x123",
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

  it("uses a separate storage key for authenticated users", () => {
    const anonymousRateLimitedUntil = Date.now() + 60_000;
    const authenticatedRateLimitedUntil = Date.now() + 120_000;

    writeChatRateLimitUntil(anonymousAuth, anonymousRateLimitedUntil);
    writeChatRateLimitUntil(
      authenticatedAuth,
      authenticatedRateLimitedUntil,
    );

    expect(readChatRateLimitUntil(anonymousAuth)).toBe(
      anonymousRateLimitedUntil,
    );
    expect(readChatRateLimitUntil(authenticatedAuth)).toBe(
      authenticatedRateLimitedUntil,
    );
  });
});
