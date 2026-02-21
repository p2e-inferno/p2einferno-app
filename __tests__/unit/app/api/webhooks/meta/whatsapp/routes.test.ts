// Mock next/server before requiring route handlers
jest.mock("next/server", () => {
  class NextResponseMock {
    status: number;
    private body: any;

    constructor(body?: any, init: any = {}) {
      this.body = body;
      this.status = init.status || 200;
    }

    static json(body: any, init: any = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
      };
    }

    async text() {
      return typeof this.body === "string"
        ? this.body
        : String(this.body ?? "");
    }
  }

  return { NextResponse: NextResponseMock };
});

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const checkMock = jest.fn();
jest.mock("@/lib/utils/rate-limiter", () => ({
  rateLimiter: { check: (...args: any[]) => checkMock(...args) },
}));

const verifyMetaSignatureMock = jest.fn();
const extractWebhookFieldsMock = jest.fn();
const getTargetsForFieldsMock = jest.fn();
const forwardToTargetMock = jest.fn();
jest.mock("@/lib/webhooks/meta-whatsapp/forward", () => ({
  verifyMetaSignature: (...args: any[]) => verifyMetaSignatureMock(...args),
  extractWebhookFields: (...args: any[]) => extractWebhookFieldsMock(...args),
  getTargetsForFields: (...args: any[]) => getTargetsForFieldsMock(...args),
  forwardToTarget: (...args: any[]) => forwardToTargetMock(...args),
}));

const { GET, POST } = require("@/app/api/webhooks/meta/whatsapp/route");
const {
  GET: HEALTH_GET,
} = require("@/app/api/webhooks/meta/whatsapp/health/route");

describe("app/api/webhooks/meta/whatsapp route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, META_WEBHOOK_VERIFY_TOKEN: "verify-token" };

    checkMock.mockResolvedValue({
      success: true,
      remaining: 10,
      resetAt: Date.now() + 60_000,
    });
    verifyMetaSignatureMock.mockReturnValue(true);
    extractWebhookFieldsMock.mockReturnValue(["messages"]);
    getTargetsForFieldsMock.mockReturnValue([
      { name: "dest-a", url: "https://a.example" },
    ]);
    forwardToTargetMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function makeGetReq(query: string) {
    return {
      nextUrl: new URL(
        `https://example.com/api/webhooks/meta/whatsapp${query}`,
      ),
    } as any;
  }

  function makePostReq({
    rawBody = '{"object":"whatsapp_business_account"}',
    signature = "sha256=good",
    ip = "1.2.3.4",
  }: {
    rawBody?: string;
    signature?: string | null;
    ip?: string;
  } = {}) {
    return {
      text: async () => rawBody,
      headers: {
        get: (key: string) => {
          const k = key.toLowerCase();
          if (k === "x-hub-signature-256") return signature;
          if (k === "x-forwarded-for") return ip;
          return null;
        },
      },
    } as any;
  }

  test("GET verification returns challenge on token match", async () => {
    const res = await GET(
      makeGetReq(
        "?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=verify-token",
      ),
    );
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("12345");
  });

  test("GET verification fails on token mismatch", async () => {
    const res = await GET(
      makeGetReq(
        "?hub.mode=subscribe&hub.challenge=12345&hub.verify_token=wrong-token",
      ),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "verification_failed" });
  });

  test("POST returns 401 for invalid signature", async () => {
    verifyMetaSignatureMock.mockReturnValue(false);
    checkMock.mockResolvedValueOnce({
      success: true,
      remaining: 5,
      resetAt: Date.now() + 1000,
    });

    const res = await POST(makePostReq());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "invalid_signature" });
  });

  test("POST returns 429 when bad-signature limiter is exceeded", async () => {
    verifyMetaSignatureMock.mockReturnValue(false);
    checkMock.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const res = await POST(makePostReq());
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
  });

  test("POST returns 429 when valid limiter is exceeded", async () => {
    checkMock.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const res = await POST(makePostReq());
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
  });

  test("POST returns 400 for invalid JSON", async () => {
    const res = await POST(makePostReq({ rawBody: "{bad-json" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  test("POST returns 422 for unsupported object", async () => {
    const res = await POST(makePostReq({ rawBody: '{"object":"instagram"}' }));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "unsupported_object" });
  });

  test("POST returns 500 when no destination is configured", async () => {
    getTargetsForFieldsMock.mockReturnValue([]);

    const res = await POST(makePostReq());
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "destination_not_configured",
    });
  });

  test("POST returns 200 when all targets forward successfully", async () => {
    getTargetsForFieldsMock.mockReturnValue([
      { name: "dest-a", url: "https://a.example" },
      { name: "dest-b", url: "https://b.example" },
    ]);

    const res = await POST(makePostReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(forwardToTargetMock).toHaveBeenCalledTimes(2);
  });

  test("POST returns 502 when any target forward fails after all attempts", async () => {
    getTargetsForFieldsMock.mockReturnValue([
      { name: "dest-a", url: "https://a.example" },
      { name: "dest-b", url: "https://b.example" },
    ]);
    forwardToTargetMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("downstream failed"));

    const res = await POST(makePostReq());
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: "downstream_unavailable",
    });
    expect(forwardToTargetMock).toHaveBeenCalledTimes(2);
  });
});

describe("app/api/webhooks/meta/whatsapp/health route", () => {
  const originalEnv = process.env;

  afterAll(() => {
    process.env = originalEnv;
  });

  function makeHealthReq(auth?: string) {
    return {
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "authorization" ? auth || null : null,
      },
    } as any;
  }

  test("GET health returns 200 without token config", async () => {
    process.env = { ...originalEnv };
    delete process.env.WEBHOOK_HEALTH_TOKEN;

    const res = await HEALTH_GET(makeHealthReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      service: "meta-whatsapp-webhook-gateway",
    });
  });

  test("GET health returns 401 with token config and missing auth", async () => {
    process.env = { ...originalEnv, WEBHOOK_HEALTH_TOKEN: "secret-token" };

    const res = await HEALTH_GET(makeHealthReq());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("GET health returns 200 with token config and valid auth", async () => {
    process.env = { ...originalEnv, WEBHOOK_HEALTH_TOKEN: "secret-token" };

    const res = await HEALTH_GET(makeHealthReq("Bearer secret-token"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      service: "meta-whatsapp-webhook-gateway",
    });
  });
});
