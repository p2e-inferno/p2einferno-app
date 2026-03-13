const getPrivyUserFromNextRequest = jest.fn();
const hasActiveChatMembership = jest.fn();
const generateChatResponse = jest.fn();

jest.mock("next/server", () => {
  class MockHeaders {
    private values = new Map<string, string>();

    constructor(init?: Record<string, string>) {
      if (init) {
        for (const [key, value] of Object.entries(init)) {
          this.values.set(key.toLowerCase(), value);
        }
      }
    }

    get(key: string) {
      return this.values.get(key.toLowerCase()) ?? null;
    }

    set(key: string, value: string) {
      this.values.set(key.toLowerCase(), value);
    }
  }

  class MockResponse {
    status: number;
    headers: MockHeaders;
    body: unknown;
    cookies: { set: jest.Mock };

    constructor(
      body: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      this.status = init.status ?? 200;
      this.headers = new MockHeaders(init.headers);
      this.body = body;
      this.cookies = { set: jest.fn() };
    }

    static json(
      body: unknown,
      init: { status?: number; headers?: Record<string, string> } = {},
    ) {
      return new MockResponse(body, init);
    }

    async json() {
      return this.body;
    }
  }

  return {
    NextResponse: MockResponse,
  };
});

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUserFromNextRequest: (...args: unknown[]) =>
    getPrivyUserFromNextRequest(...args),
}));

jest.mock("@/lib/chat/server/respond-membership", () => ({
  hasActiveChatMembership: (...args: unknown[]) =>
    hasActiveChatMembership(...args),
}));

jest.mock("@/lib/chat/server/respond-service", () => ({
  generateChatResponse: (...args: unknown[]) => generateChatResponse(...args),
  validateChatRespondBody: jest.requireActual(
    "@/lib/chat/server/respond-service",
  ).validateChatRespondBody,
}));

import {
  clearChatRespondRateLimitState,
  getChatAnonymousSessionCookieName,
} from "@/lib/chat/server/respond-rate-limit";

const respondRoute = require("@/app/api/chat/respond/route");

function createRequest(overrides: {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  const headers = overrides.headers ?? {};
  const cookies = overrides.cookies ?? {};

  return {
    json: async () =>
      overrides.body ?? {
        conversationId: "chat_1",
        message: "What is P2E Inferno?",
        messages: [{ role: "user", content: "What is P2E Inferno?" }],
        route: {
          pathname: "/",
          routeKey: "home",
          segment: null,
          behaviorKey: "general",
        },
      },
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? null;
      },
    },
    cookies: {
      get(name: string) {
        const value = cookies[name];
        return value ? { value } : undefined;
      },
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({
          name,
          value,
        }));
      },
    },
  };
}

describe("POST /api/chat/respond", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearChatRespondRateLimitState();
    delete process.env.CHAT_RESPOND_QUOTA_ANON_MAX;
    delete process.env.CHAT_RESPOND_QUOTA_AUTH_MAX;
    delete process.env.CHAT_RESPOND_QUOTA_MEMBER_MAX;
    delete process.env.CHAT_RESPOND_BURST_ANON_MAX;
    delete process.env.CHAT_RESPOND_BURST_AUTH_MAX;
    delete process.env.CHAT_RESPOND_BURST_MEMBER_MAX;
    getPrivyUserFromNextRequest.mockResolvedValue(null);
    hasActiveChatMembership.mockResolvedValue(false);
    generateChatResponse.mockResolvedValue({
      message: {
        id: "assistant_1",
        role: "assistant",
        content: "Grounded answer",
        ts: 1,
        status: "complete",
        error: null,
      },
      sources: [],
      retrievalMeta: {
        profile: "home_sales",
        audience: ["sales"],
        domainTags: ["business"],
        resultCount: 1,
      },
    });
  });

  it("supports anonymous callers and issues an anonymous session cookie", async () => {
    const res = await respondRoute.POST(createRequest({}) as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({
        message: expect.objectContaining({ content: "Grounded answer" }),
      }),
    );
    expect(res.cookies.set).toHaveBeenCalledWith(
      getChatAnonymousSessionCookieName(),
      expect.any(String),
      expect.any(Object),
    );
  });

  it("accepts overlong history messages and leaves truncation to prompt assembly", async () => {
    const res = await respondRoute.POST(
      createRequest({
        body: {
          conversationId: "chat_history",
          message: "hello",
          messages: [{ role: "user", content: "a".repeat(1501) }],
          route: {
            pathname: "/",
            routeKey: "home",
          },
        },
      }) as any,
    );

    expect(res.status).toBe(200);
    expect(generateChatResponse).toHaveBeenCalled();
  });

  it("rejects too many history messages", async () => {
    const res = await respondRoute.POST(
      createRequest({
        body: {
          conversationId: "chat_history_count",
          message: "hello",
          messages: Array.from({ length: 13 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: `message-${index}`,
          })),
          route: {
            pathname: "/",
            routeKey: "home",
          },
        },
      }) as any,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error:
        "messages must be an array of up to 12 non-empty chat role/content pairs under 1500 characters each",
    });
    expect(generateChatResponse).not.toHaveBeenCalled();
  });

  it("rejects overlong conversation ids", async () => {
    const res = await respondRoute.POST(
      createRequest({
        body: {
          conversationId: "c".repeat(121),
          message: "hello",
          messages: [{ role: "user", content: "hello" }],
          route: {
            pathname: "/",
            routeKey: "home",
          },
        },
      }) as any,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "conversationId must be a non-empty string under 120 characters",
    });
    expect(generateChatResponse).not.toHaveBeenCalled();
  });

  it("uses a stable anonymous identity when the first request arrives without a cookie", async () => {
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "1";
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "5";

    const first = await respondRoute.POST(
      createRequest({
        headers: { "x-real-ip": "203.0.113.10" },
      }) as any,
    );
    const [, issuedCookieValue] = (first.cookies.set as jest.Mock).mock
      .calls[0];
    expect(first.status).toBe(200);

    const second = await respondRoute.POST(
      createRequest({
        headers: { "x-real-ip": "203.0.113.10" },
        cookies: { [getChatAnonymousSessionCookieName()]: issuedCookieValue },
      }) as any,
    );

    expect(second.status).toBe(429);
    expect(generateChatResponse).toHaveBeenCalledTimes(1);
  });

  it("applies stricter anonymous quotas than authenticated quotas", async () => {
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "1";
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "2";
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "5";
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "5";

    const anonReq = createRequest({
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-1" },
    });

    const anonFirst = await respondRoute.POST(anonReq as any);
    const anonSecond = await respondRoute.POST(anonReq as any);

    expect(anonFirst.status).toBe(200);
    expect(anonSecond.status).toBe(429);

    getPrivyUserFromNextRequest.mockResolvedValue({ id: "did:1" });
    const authReq = createRequest({
      headers: { authorization: "Bearer token" },
    });

    const authFirst = await respondRoute.POST(authReq as any);
    const authSecond = await respondRoute.POST(authReq as any);

    expect(authFirst.status).toBe(200);
    expect(authSecond.status).toBe(200);
  });

  it("gives members the highest quota tier", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "2";
    process.env.CHAT_RESPOND_QUOTA_MEMBER_MAX = "3";
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "5";
    process.env.CHAT_RESPOND_BURST_MEMBER_MAX = "5";

    getPrivyUserFromNextRequest.mockResolvedValue({ id: "did:member" });
    hasActiveChatMembership.mockResolvedValue(true);
    const req = createRequest({
      headers: { authorization: "Bearer token" },
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-member" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);
    const third = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
  });

  it("allows members to reach the member burst tier", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "10";
    process.env.CHAT_RESPOND_QUOTA_MEMBER_MAX = "10";
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "1";
    process.env.CHAT_RESPOND_BURST_MEMBER_MAX = "2";

    getPrivyUserFromNextRequest.mockResolvedValue({ id: "did:member" });
    hasActiveChatMembership.mockResolvedValue(true);

    const req = createRequest({
      headers: { authorization: "Bearer token" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("falls back to non-member behavior when membership lookup fails", async () => {
    process.env.CHAT_RESPOND_QUOTA_AUTH_MAX = "1";
    process.env.CHAT_RESPOND_BURST_AUTH_MAX = "5";

    getPrivyUserFromNextRequest.mockResolvedValue({ id: "did:1" });
    hasActiveChatMembership.mockRejectedValue(new Error("membership down"));

    const req = createRequest({
      headers: { authorization: "Bearer token" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(generateChatResponse).toHaveBeenCalledTimes(1);
  });

  it("short-circuits before expensive work when burst limiting denies the request", async () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "1";
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "10";

    const req = createRequest({
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-burst" },
      headers: { "x-real-ip": "203.0.113.11" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(generateChatResponse).toHaveBeenCalledTimes(1);
  });

  it("short-circuits before expensive work when quota limiting denies the request", async () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "5";
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "1";

    const req = createRequest({
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-quota" },
      headers: { "x-real-ip": "203.0.113.12" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(generateChatResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects a conversationId over the length cap", async () => {
    const res = await respondRoute.POST(
      createRequest({
        body: {
          conversationId: "a".repeat(121),
          message: "hello",
          messages: [{ role: "user", content: "hello" }],
          route: {
            pathname: "/",
            routeKey: "home",
          },
        },
      }) as any,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "conversationId must be a non-empty string under 120 characters",
    });
    expect(generateChatResponse).not.toHaveBeenCalled();
  });

  it("includes reason: burst in the 429 body when burst-limited", async () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "1";
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "10";

    const req = createRequest({
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-burst-reason" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ reason: "burst" });
  });

  it("includes reason: quota in the 429 body when quota-limited", async () => {
    process.env.CHAT_RESPOND_BURST_ANON_MAX = "5";
    process.env.CHAT_RESPOND_QUOTA_ANON_MAX = "1";

    const req = createRequest({
      cookies: { [getChatAnonymousSessionCookieName()]: "anon-quota-reason" },
    });

    const first = await respondRoute.POST(req as any);
    const second = await respondRoute.POST(req as any);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({ reason: "quota" });
  });
});
