const randomUUIDMock = jest.fn();
var warnLog: jest.Mock;

jest.mock("crypto", () => ({
  randomUUID: () => randomUUIDMock(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => {
    warnLog = warnLog || jest.fn();

    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: warnLog,
      error: jest.fn(),
    };
  },
}));

import {
  clearChatRespondRateLimitState,
  enforceChatRespondBurstLimit,
  getChatRespondRateLimitBucketSizes,
  resolveChatRespondUsageIdentity,
} from "@/lib/chat/server/respond-rate-limit";

describe("resolveChatRespondUsageIdentity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChatRespondRateLimitState();
    randomUUIDMock.mockReturnValue("anon-generated");
  });

  it("uses a generated anonymous session when no cookie or IP exists", () => {
    const identity = resolveChatRespondUsageIdentity(
      {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any,
      null,
    );

    expect(identity.identityKey).toBe("anon-session:anon-generated");
    expect(identity.shouldSetAnonymousCookie).toBe(true);
    expect(warnLog).not.toHaveBeenCalled();
  });

  it("logs degraded fallback when anonymous identity cannot use cookie or IP", () => {
    randomUUIDMock.mockImplementation(() => {
      throw new Error("uuid unavailable");
    });

    const identity = resolveChatRespondUsageIdentity(
      {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any,
      null,
    );
    const nextIdentity = resolveChatRespondUsageIdentity(
      {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any,
      null,
    );

    expect(identity.identityKey).toMatch(/^anon-fallback:/);
    expect(nextIdentity.identityKey).toBe(identity.identityKey);
    expect(warnLog).toHaveBeenCalledWith(
      "Using degraded anonymous chat rate-limit identity without session or IP; fallback is process-local only",
      expect.objectContaining({
        identityKey: expect.stringMatching(/^anon-fallback:/),
      }),
    );
    expect(
      warnLog.mock.calls.filter(
        ([message]) =>
          message ===
          "Using degraded anonymous chat rate-limit identity without session or IP; fallback is process-local only",
      ),
    ).toHaveLength(1);
  });

  it("rate limits repeated degraded anonymous requests against the same bucket", () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "1";
    randomUUIDMock.mockImplementation(() => {
      throw new Error("uuid unavailable");
    });

    const identity = resolveChatRespondUsageIdentity(
      {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any,
      null,
    );
    const nextIdentity = resolveChatRespondUsageIdentity(
      {
        headers: { get: () => null },
        cookies: { get: () => undefined },
      } as any,
      null,
    );

    const first = enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });
    const second = enforceChatRespondBurstLimit({
      identity: nextIdentity,
      hasMembership: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("burst");
  });

  it("bounds rate-limit bucket growth", () => {
    for (let index = 0; index < 560; index += 1) {
      enforceChatRespondBurstLimit({
        identity: {
          ip: null,
          privyUserId: null,
          identityKey: `anon-session:${index}`,
          anonymousSessionId: `${index}`,
          shouldSetAnonymousCookie: false,
        },
        hasMembership: false,
      });
    }

    expect(getChatRespondRateLimitBucketSizes().burst).toBeLessThanOrEqual(500);
  });
});
