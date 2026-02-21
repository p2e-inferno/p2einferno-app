describe("lib/webhooks/meta-whatsapp/forward", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.META_APP_SECRET = "test-app-secret";
    process.env.WHATSAPP_FORWARD_DESTINATION_URL =
      "https://default.example/webhook";
    process.env.WHATSAPP_FORWARD_DESTINATION_NAME = "default-destination";
    process.env.WHATSAPP_GATEWAY_SHARED_SECRET = "gateway-secret";
    process.env.WHATSAPP_FORWARD_TIMEOUT_MS = "3000";
    delete process.env.WHATSAPP_FORWARD_ROUTE_MAP;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function loadModule() {
    const warn = jest.fn();
    jest.doMock("@/lib/utils/logger", () => ({
      getLogger: () => ({
        warn,
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    }));
    const mod = require("@/lib/webhooks/meta-whatsapp/forward");
    return { mod, warn };
  }

  test("extractWebhookFields collects unique fields from all entries/changes", () => {
    const { mod } = loadModule();
    const payload = {
      entry: [
        { changes: [{ field: "messages" }, { field: "statuses" }] },
        { changes: [{ field: "messages" }, { field: "account_update" }] },
      ],
    };

    const fields = mod.extractWebhookFields(payload).sort();
    expect(fields).toEqual(["account_update", "messages", "statuses"]);
  });

  test("getTargetsForFields falls back to default when no fields match route map", () => {
    const { mod } = loadModule();
    process.env.WHATSAPP_FORWARD_ROUTE_MAP = JSON.stringify({
      messages: [
        {
          name: "agent",
          url: "https://agent.example/webhook",
          secret: "agent-secret",
        },
      ],
    });

    const targets = mod.getTargetsForFields(["statuses"]);
    expect(targets).toEqual([
      {
        name: "default-destination",
        url: "https://default.example/webhook",
        secret: "gateway-secret",
      },
    ]);
  });

  test("getTargetsForFields returns only matched targets for mixed-field payload", () => {
    const { mod } = loadModule();
    process.env.WHATSAPP_FORWARD_ROUTE_MAP = JSON.stringify({
      messages: [
        {
          name: "agent",
          url: "https://agent.example/webhook",
          secret: "agent-secret",
        },
      ],
    });

    const targets = mod.getTargetsForFields(["messages", "statuses"]);
    expect(targets).toEqual([
      {
        name: "agent",
        url: "https://agent.example/webhook",
        secret: "agent-secret",
      },
    ]);
  });

  test("getTargetsForFields supports route-map-only deployments (no default destination)", () => {
    delete process.env.WHATSAPP_FORWARD_DESTINATION_URL;
    delete process.env.WHATSAPP_FORWARD_DESTINATION_NAME;
    delete process.env.WHATSAPP_GATEWAY_SHARED_SECRET;
    process.env.WHATSAPP_FORWARD_ROUTE_MAP = JSON.stringify({
      messages: [{ name: "agent", url: "https://agent.example/webhook" }],
    });
    const { mod } = loadModule();

    const targets = mod.getTargetsForFields(["messages"]);
    expect(targets).toEqual([
      {
        name: "agent",
        url: "https://agent.example/webhook",
        secret: undefined,
      },
    ]);
  });

  test("malformed route map logs warning and falls back to default destination", () => {
    process.env.WHATSAPP_FORWARD_ROUTE_MAP = "{invalid-json";
    const { mod, warn } = loadModule();

    const targets = mod.getTargetsForFields(["messages"]);
    expect(targets).toEqual([
      {
        name: "default-destination",
        url: "https://default.example/webhook",
        secret: "gateway-secret",
      },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("verifyMetaSignature validates correct and rejects incorrect signatures", () => {
    const { mod } = loadModule();
    const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
    const crypto = require("node:crypto");
    const good =
      "sha256=" +
      crypto
        .createHmac("sha256", "test-app-secret")
        .update(rawBody, "utf8")
        .digest("hex");

    expect(mod.verifyMetaSignature(rawBody, good)).toBe(true);
    expect(mod.verifyMetaSignature(rawBody, "sha256=bad")).toBe(false);
  });

  test("forwardToTarget sends expected headers and body", async () => {
    const { mod } = loadModule();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await mod.forwardToTarget(
      {
        name: "agent",
        url: "https://agent.example/webhook",
        secret: "agent-secret",
      },
      '{"hello":"world"}',
      "sha256=abc",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://agent.example/webhook");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"hello":"world"}');
    expect(init.headers["x-source"]).toBe("p2e-inferno-gateway");
    expect(init.headers["x-destination-name"]).toBe("agent");
    expect(init.headers["x-gateway-secret"]).toBe("agent-secret");
    expect(init.headers["x-meta-signature-256"]).toBe("sha256=abc");
  });

  test("forwardToTarget throws when downstream is non-2xx", async () => {
    const { mod } = loadModule();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      mod.forwardToTarget(
        { name: "agent", url: "https://agent.example/webhook" },
        '{"hello":"world"}',
        null,
      ),
    ).rejects.toThrow("forward_failed:agent:503");
  });

  test("forwardToTarget propagates fetch rejection errors", async () => {
    const { mod } = loadModule();
    const fetchMock = global.fetch as jest.Mock;
    const err = new Error("network timeout");
    fetchMock.mockRejectedValue(err);

    await expect(
      mod.forwardToTarget(
        {
          name: "agent",
          url: "https://agent.example/webhook",
          secret: "agent-secret",
        },
        '{"hello":"world"}',
        "sha256=abc",
      ),
    ).rejects.toBe(err);
  });
});
