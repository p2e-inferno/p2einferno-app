const randomUUIDMock = jest.fn();
const getUpstashRedisMock = jest.fn();
var warnLog: jest.Mock;
var errorLog: jest.Mock;

jest.mock("@/lib/upstash/redis", () => ({
  getUpstashRedis: () => getUpstashRedisMock(),
}));

jest.mock("crypto", () => ({
  randomUUID: () => randomUUIDMock(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => {
    warnLog = warnLog || jest.fn();
    errorLog = errorLog || jest.fn();

    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: warnLog,
      error: errorLog,
    };
  },
}));

import {
  clearChatRespondRateLimitState,
  enforceChatAttachmentUploadBurstLimit,
  enforceChatAttachmentUploadQuotaLimit,
  enforceChatRespondBurstLimit,
  enforceChatRespondQuotaLimit,
  getChatRespondRateLimitBucketSizes,
  resolveChatRespondUsageIdentity,
} from "@/lib/chat/server/respond-rate-limit";

describe("resolveChatRespondUsageIdentity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChatRespondRateLimitState();
    randomUUIDMock.mockReturnValue("anon-generated");
    getUpstashRedisMock.mockReturnValue(null);
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.CHAT_RESPOND_BURST_WINDOW_MS;
    delete process.env.CHAT_RESPOND_BURST_ANON_MAX;
    delete process.env.CHAT_RESPOND_BURST_AUTH_MAX;
    delete process.env.CHAT_RESPOND_BURST_MEMBER_MAX;
    delete process.env.CHAT_RESPOND_QUOTA_ANON_MAX;
    delete process.env.CHAT_RESPOND_QUOTA_AUTH_MAX;
    delete process.env.CHAT_RESPOND_QUOTA_MEMBER_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_BURST_ANON_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_BURST_AUTH_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_BURST_MEMBER_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_QUOTA_ANON_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_QUOTA_AUTH_MAX;
    delete process.env.CHAT_ATTACHMENT_UPLOAD_QUOTA_MEMBER_MAX;
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

  it("rate limits repeated degraded anonymous requests against the same bucket", async () => {
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

    const first = await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });
    const second = await enforceChatRespondBurstLimit({
      identity: nextIdentity,
      hasMembership: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe("burst");
  });

  it("bounds rate-limit bucket growth", async () => {
    for (let index = 0; index < 560; index += 1) {
      await enforceChatRespondBurstLimit({
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

  it("uses Redis-backed counters with environment-scoped keys when configured", async () => {
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "1";
    process.env.CHAT_RESPOND_BURST_WINDOW_MS = "60000";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "preview-123.example.vercel.app";

    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([1, 1, 60_000])
      .mockResolvedValueOnce([0, 2, 55_000]);
    getUpstashRedisMock.mockReturnValue({
      eval: evalMock,
    });

    const identity = {
      ip: null,
      privyUserId: "user-1",
      identityKey: "user:user-1",
      shouldSetAnonymousCookie: false,
    } as const;

    const first = await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });
    const second = await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(evalMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('redis.call("SET", key, 1, "PX", window_ms)'),
      [
        "chat-rate-limit:preview:preview-123.example.vercel.app:burst:user:user-1",
      ],
      ["1", "60000"],
    );
    expect(evalMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      [
        "chat-rate-limit:preview:preview-123.example.vercel.app:burst:user:user-1",
      ],
      ["1", "60000"],
    );
  });

  it("uses a production prefix without VERCEL_URL in Redis keys", async () => {
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "1";
    process.env.CHAT_RESPOND_BURST_WINDOW_MS = "60000";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "preview-123.example.vercel.app";

    const evalMock = jest.fn().mockResolvedValueOnce([1, 1, 60_000]);
    getUpstashRedisMock.mockReturnValue({
      eval: evalMock,
    });

    await enforceChatRespondBurstLimit({
      identity: {
        ip: null,
        privyUserId: "user-1",
        identityKey: "user:user-1",
        shouldSetAnonymousCookie: false,
      },
      hasMembership: false,
    });

    expect(evalMock).toHaveBeenCalledWith(expect.any(String), [
      "chat-rate-limit:production:burst:user:user-1",
    ], ["1", "60000"]);
  });

  it("falls back to in-memory buckets when Redis eval throws", async () => {
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "1";
    getUpstashRedisMock.mockReturnValue({
      eval: jest.fn().mockRejectedValue(new Error("UpstashError: timeout")),
    });

    const identity = {
      ip: null,
      privyUserId: "user-1",
      identityKey: "user:user-1",
      shouldSetAnonymousCookie: false,
    } as const;

    const first = await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });
    const second = await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(errorLog).toHaveBeenCalledWith(
      "Redis rate-limit eval failed; falling back to in-memory buckets",
      expect.objectContaining({
        key: "chat-rate-limit:test:burst:user:user-1",
        error: expect.any(Error),
      }),
    );
    expect(warnLog).not.toHaveBeenCalledWith(
      "Upstash Redis is not configured for chat rate limiting; falling back to in-memory buckets",
    );
  });

  it("uses Redis for quota enforcement", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "1";
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([1, 1, 86_400_000])
      .mockResolvedValueOnce([0, 2, 80_000_000]);
    getUpstashRedisMock.mockReturnValue({ eval: evalMock });

    const identity = {
      ip: null,
      privyUserId: "user-1",
      identityKey: "user:user-1",
      shouldSetAnonymousCookie: false,
    } as const;

    const first = await enforceChatRespondQuotaLimit({
      identity,
      hasMembership: false,
    });
    const second = await enforceChatRespondQuotaLimit({
      identity,
      hasMembership: false,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBe(80000);
  });

  it("uses Redis for attachment burst and quota enforcement", async () => {
    process.env.CHAT_ATTACHMENT_UPLOAD_BURST_AUTH_MAX = "1";
    process.env.CHAT_ATTACHMENT_UPLOAD_QUOTA_AUTH_MAX = "1";
    const evalMock = jest
      .fn()
      .mockResolvedValueOnce([1, 1, 60_000])
      .mockResolvedValueOnce([0, 2, 45_000])
      .mockResolvedValueOnce([1, 1, 86_400_000])
      .mockResolvedValueOnce([0, 2, 1]);
    getUpstashRedisMock.mockReturnValue({ eval: evalMock });

    const identity = {
      ip: null,
      privyUserId: "user-1",
      identityKey: "user:user-1",
      shouldSetAnonymousCookie: false,
    } as const;

    const burstFirst = await enforceChatAttachmentUploadBurstLimit({
      identity,
      hasMembership: false,
    });
    const burstSecond = await enforceChatAttachmentUploadBurstLimit({
      identity,
      hasMembership: false,
    });
    const quotaFirst = await enforceChatAttachmentUploadQuotaLimit({
      identity,
      hasMembership: false,
    });
    const quotaSecond = await enforceChatAttachmentUploadQuotaLimit({
      identity,
      hasMembership: false,
    });

    expect(burstFirst.allowed).toBe(true);
    expect(burstSecond.allowed).toBe(false);
    expect(burstSecond.retryAfterSeconds).toBe(45);
    expect(quotaFirst.allowed).toBe(true);
    expect(quotaSecond.allowed).toBe(false);
    expect(quotaSecond.retryAfterSeconds).toBe(1);
  });

  it("normalizes non-positive Redis TTLs to a one-second retry", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "1";
    getUpstashRedisMock.mockReturnValue({
      eval: jest
        .fn()
        .mockResolvedValueOnce([1, 1, 86_400_000])
        .mockResolvedValueOnce([0, 2, -1]),
    });

    const identity = {
      ip: null,
      privyUserId: "user-1",
      identityKey: "user:user-1",
      shouldSetAnonymousCookie: false,
    } as const;

    await enforceChatRespondQuotaLimit({
      identity,
      hasMembership: false,
    });
    const blocked = await enforceChatRespondQuotaLimit({
      identity,
      hasMembership: false,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("treats a null Redis eval result as blocked with the window retry", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "1";
    getUpstashRedisMock.mockReturnValue({
      eval: jest.fn().mockResolvedValue(null),
    });

    const blocked = await enforceChatRespondQuotaLimit({
      identity: {
        ip: null,
        privyUserId: "user-1",
        identityKey: "user:user-1",
        shouldSetAnonymousCookie: false,
      },
      hasMembership: false,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(86400);
  });

  it("deduplicates IP-only anonymous burst keys", async () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "1";
    randomUUIDMock.mockImplementation(() => {
      throw new Error("uuid unavailable");
    });
    const evalMock = jest.fn().mockResolvedValue([1, 1, 60_000]);
    getUpstashRedisMock.mockReturnValue({ eval: evalMock });

    const identity = resolveChatRespondUsageIdentity(
      {
        headers: {
          get: (name: string) =>
            name === "x-forwarded-for" ? "203.0.113.10" : null,
        },
        cookies: { get: () => undefined },
      } as any,
      null,
    );

    await enforceChatRespondBurstLimit({
      identity,
      hasMembership: false,
    });

    expect(evalMock).toHaveBeenCalledTimes(1);
  });
});
