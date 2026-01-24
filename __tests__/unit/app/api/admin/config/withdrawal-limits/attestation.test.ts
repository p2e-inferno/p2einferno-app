export {};

jest.mock("next/server", () => ({
  NextResponse: class {
    static json(body: any, init: any = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
        headers: new Map<string, string>(),
        cookies: { set: jest.fn() },
      };
    }
  },
}));

jest.mock("@/lib/auth/route-handlers/admin-guard", () => ({
  ensureAdminOrRespond: jest.fn(),
}));

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUserFromNextRequest: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(),
}));

const { PUT } = require("@/app/api/admin/config/withdrawal-limits/route");
const {
  ensureAdminOrRespond,
} = require("@/lib/auth/route-handlers/admin-guard");
const { getPrivyUserFromNextRequest } = require("@/lib/auth/privy");
const { createAdminClient } = require("@/lib/supabase/server");
const { isEASEnabled } = require("@/lib/attestation/core/config");
const { handleGaslessAttestation } = require("@/lib/attestation/api/helpers");
const { buildEasScanLink } = require("@/lib/attestation/core/network-config");

function makeRequest(body: unknown, headers?: Record<string, string>) {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => headers?.[key.toLowerCase()] ?? null,
    },
  } as any;
}

describe("admin withdrawal-limits PUT attestation (Phase 5)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ensureAdminOrRespond.mockResolvedValue(null);
    getPrivyUserFromNextRequest.mockResolvedValue({ id: "privy-admin-1" });
    isEASEnabled.mockReturnValue(true);
    handleGaslessAttestation.mockResolvedValue({
      success: true,
      uid: "0xatt",
      txHash: "0xtx",
    });
    buildEasScanLink.mockResolvedValue("https://scan/att/0xatt");

    const insert = jest.fn().mockResolvedValue({ error: null });
    const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq });
    const mockSelectIn = jest.fn().mockResolvedValue({
      data: [
        { key: "dg_withdrawal_min_amount", value: "3" },
        { key: "dg_withdrawal_max_daily_amount", value: "9" },
      ],
      error: null,
    });
    const mockSelect = jest.fn().mockReturnValue({ in: mockSelectIn });
    const mockFrom = jest.fn((table: string) => {
      if (table === "system_config")
        return { update: mockUpdate, select: mockSelect };
      if (table === "config_audit_log") return { insert };
      throw new Error(`Unhandled table: ${table}`);
    });
    createAdminClient.mockReturnValue({ from: mockFrom });
  });

  test("includes attestation_uid in audit log when attestation succeeds", async () => {
    const req = makeRequest(
      {
        minAmount: 10,
        maxAmount: 20,
        attestationSignature: {
          signature: "0xsig",
          deadline: "123",
          attester: "0xAdmin",
          recipient: "0xAdmin",
          schemaUid: "0xschema",
          data: "0x00",
          expirationTime: "0",
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
      { "x-active-wallet": "0xAdmin" },
    );

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      attestationUid: "0xatt",
      attestationScanUrl: "https://scan/att/0xatt",
    });
    expect(handleGaslessAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "dg_config_change",
        recipient: "0xAdmin",
        gracefulDegrade: true,
      }),
    );
  });

  test("skips attestation when EAS enabled but X-Active-Wallet missing", async () => {
    const req = makeRequest(
      { minAmount: 10, maxAmount: 20, attestationSignature: null },
      {},
    );

    const res = await PUT(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      attestationUid: null,
      attestationScanUrl: null,
    });
  });

  test("writes old_value and new_value in batch audit insert", async () => {
    const req = makeRequest(
      { minAmount: 10, maxAmount: 20, attestationSignature: null },
      { "x-active-wallet": "0xAdmin" },
    );

    await PUT(req);

    const { createAdminClient } = require("@/lib/supabase/server");
    const client = createAdminClient();
    const audit = client.from("config_audit_log");

    expect(audit.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        config_key: "dg_withdrawal_limits_batch",
        old_value: JSON.stringify({ minAmount: 3, maxAmount: 9 }),
        new_value: JSON.stringify({ minAmount: 10, maxAmount: 20 }),
      }),
    ]);
  });
});
