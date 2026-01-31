export {};

jest.mock("next/server", () => ({
  NextResponse: class {
    static json(body: any, init: any = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
        headers: new Map<string, string>(),
      };
    }
  },
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
  getDefaultNetworkName: jest.fn(() => "base-sepolia"),
}));

jest.mock("@/lib/attestation/api/commit-guards", () => ({
  decodeAttestationDataFromDb: jest.fn(async () => [
    {
      name: "withdrawalTxHash",
      value:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    },
  ]),
  getDecodedFieldValue: (decoded: any[], field: string) =>
    decoded.find((item) => item.name === field)?.value,
  normalizeBytes32: (value: any) =>
    typeof value === "string" ? value.toLowerCase() : null,
}));

const { POST } = require("@/app/api/token/withdraw/commit-attestation/route");
const { getPrivyUserFromNextRequest } = require("@/lib/auth/privy");
const { createAdminClient } = require("@/lib/supabase/server");
const { isEASEnabled } = require("@/lib/attestation/core/config");
const { handleGaslessAttestation } = require("@/lib/attestation/api/helpers");
const { buildEasScanLink } = require("@/lib/attestation/core/network-config");

function makeRequest(body: unknown) {
  return {
    json: async () => body,
    headers: { get: () => null },
  } as any;
}

declare global {
  // eslint-disable-next-line no-var
  var __WITHDRAW_COMMIT_EXISTING_UID__: string | null | undefined;
}

global.__WITHDRAW_COMMIT_EXISTING_UID__ = null;

describe("POST /api/token/withdraw/commit-attestation (Phase 9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPrivyUserFromNextRequest.mockResolvedValue({ id: "privy-user-1" });
    isEASEnabled.mockReturnValue(true);
    handleGaslessAttestation.mockResolvedValue({
      success: true,
      uid: "0xatt",
      txHash: "0xtx",
    });
    buildEasScanLink.mockResolvedValue("https://scan/att/0xatt");

    global.__WITHDRAW_COMMIT_EXISTING_UID__ = null;

    const mockUpdateEq2 = jest.fn().mockResolvedValue({ error: null });
    const mockUpdateEq1 = jest.fn().mockReturnValue({ eq: mockUpdateEq2 });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq1 });

    const mockMaybeSingle = jest.fn(async () => ({
      data: {
        id: "w1",
        user_id: "privy-user-1",
        wallet_address: "0x00000000000000000000000000000000000000bb",
        status: "completed",
        transaction_hash:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
        attestation_uid: global.__WITHDRAW_COMMIT_EXISTING_UID__,
      },
      error: null,
    }));
    const mockSelectEq2 = jest
      .fn()
      .mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelectEq1 = jest.fn().mockReturnValue({ eq: mockSelectEq2 });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockSelectEq1 });

    const mockFrom = jest.fn((table: string) => {
      if (table === "dg_token_withdrawals") {
        return { select: mockSelect, update: mockUpdate };
      }
      throw new Error(`Unhandled table: ${table}`);
    });

    createAdminClient.mockReturnValue({ from: mockFrom });
  });

  test("returns 401 when unauthenticated", async () => {
    getPrivyUserFromNextRequest.mockResolvedValue(null);
    const res = await POST(makeRequest({ withdrawalId: "w1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: "Unauthorized" });
  });

  test("returns existing UID without resubmitting", async () => {
    global.__WITHDRAW_COMMIT_EXISTING_UID__ = "0xexisting";
    const res = await POST(makeRequest({ withdrawalId: "w1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      attestationUid: "0xexisting",
      attestationScanUrl: "https://scan/att/0xatt",
    });
  });

  test("requires signature when no existing UID", async () => {
    const res = await POST(makeRequest({ withdrawalId: "w1" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      error: "Attestation signature is required",
    });
  });

  test("persists UID when attestation succeeds", async () => {
    const res = await POST(
      makeRequest({
        withdrawalId: "w1",
        attestationSignature: {
          recipient: "0x00000000000000000000000000000000000000bb",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      attestationUid: "0xatt",
      attestationScanUrl: "https://scan/att/0xatt",
    });
  });
});
