import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __MILESTONE_CLAIM_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __MILESTONE_CLAIM_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __MILESTONE_CLAIM_ATTEST_SCENARIO__: "ok" | "fail" | undefined;
  // eslint-disable-next-line no-var
  var __MILESTONE_CLAIM_PROGRESS_UPDATE__: any | null | undefined;
}

global.__MILESTONE_CLAIM_AUTH_SCENARIO__ = "ok";
global.__MILESTONE_CLAIM_EAS_ENABLED__ = false;
global.__MILESTONE_CLAIM_ATTEST_SCENARIO__ = "ok";
global.__MILESTONE_CLAIM_PROGRESS_UPDATE__ = null;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__MILESTONE_CLAIM_AUTH_SCENARIO__ === "unauthorized")
      return null;
    return { id: "privy-user-1" };
  }),
  extractAndValidateWalletFromHeader: jest.fn(
    async ({ activeWalletHeader }: any) => {
      if (!activeWalletHeader) {
        throw new Error("X-Active-Wallet header is required");
      }
      return activeWalletHeader;
    },
  ),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__MILESTONE_CLAIM_EAS_ENABLED__)),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async ({ signature }: any) => {
    if (!global.__MILESTONE_CLAIM_EAS_ENABLED__) return { success: true };
    if (!signature) return { success: true };
    if (global.__MILESTONE_CLAIM_ATTEST_SCENARIO__ === "fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xmilestoneattuid", txHash: "0xatttx" };
  }),
  extractAndValidateWalletFromSignature: jest.fn(async () => {
    return "0x00000000000000000000000000000000000000bb";
  }),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(async (uid: string) => `https://scan/${uid}`),
  getDefaultNetworkName: jest.fn(() => "base-sepolia"),
}));

jest.mock("@/lib/attestation/api/commit-guards", () => ({
  decodeAttestationDataFromDb: jest.fn(async () => [
    { name: "grantTxHash", value: "0xgranttx" },
    { name: "keyTokenId", value: "123" },
  ]),
  getDecodedFieldValue: (decoded: any[], field: string) =>
    decoded.find((item) => item.name === field)?.value,
  normalizeBytes32: (value: any) =>
    typeof value === "string" ? value.toLowerCase() : null,
  normalizeUint: (value: any) => (value == null ? null : BigInt(value)),
}));

jest.mock("@/lib/services/user-key-service", () => ({
  grantKeyToUser: jest.fn(async () => ({
    success: true,
    transactionHash: "0xgranttx",
  })),
  checkUserKeyOwnership: jest.fn(async () => ({
    keyInfo: { tokenId: 123n },
  })),
}));

jest.mock("@/lib/blockchain/config/clients/wallet-client", () => ({
  createWalletClientUnified: jest.fn(() => ({}) as any),
}));

jest.mock("@/lib/blockchain/config/clients/public-client", () => ({
  createPublicClientUnified: jest.fn(() => ({}) as any),
}));

jest.mock("@/lib/helpers/checkAndUpdateMilestoneKeyClaimStatus", () => ({
  checkAndUpdateMilestoneKeyClaimStatus: jest.fn(async () => false),
}));

jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "user_profiles":
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "profile-1",
                      wallet_address:
                        "0x00000000000000000000000000000000000000bb",
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "user_milestone_progress":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: async () => ({
                      data: {
                        status: "completed",
                        key_claim_tx_hash: "0xgranttx",
                        key_claim_token_id: 123,
                        milestone: {
                          lock_address:
                            "0x00000000000000000000000000000000000000aa",
                        },
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  eq: async () => {
                    global.__MILESTONE_CLAIM_PROGRESS_UPDATE__ = payload;
                    return { data: null, error: null };
                  },
                }),
              }),
            } as any;
          default:
            throw new Error(`Unhandled table: ${table}`);
        }
      },
    };
  });

  return { createAdminClient };
});

import handler from "@/pages/api/milestones/claim";

async function runApi(params: {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}): Promise<{ statusCode: number; json: any }> {
  const { req, res } = createMocks({
    method: (params.method ?? "POST") as any,
    headers: {
      "Content-Type": "application/json",
      "x-active-wallet": "0x00000000000000000000000000000000000000bb",
      ...(params.headers ?? {}),
    },
    body: params.body ?? {},
  });

  await handler(req as any, res as any);

  const statusCode = res._getStatusCode();
  const body = res._getData();
  const json = typeof body === "string" ? JSON.parse(body) : body;

  return { statusCode, json };
}

describe("POST /api/milestones/claim (Phase 6)", () => {
  beforeEach(() => {
    global.__MILESTONE_CLAIM_AUTH_SCENARIO__ = "ok";
    global.__MILESTONE_CLAIM_EAS_ENABLED__ = false;
    global.__MILESTONE_CLAIM_ATTEST_SCENARIO__ = "ok";
    global.__MILESTONE_CLAIM_PROGRESS_UPDATE__ = null;
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__MILESTONE_CLAIM_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode } = await runApi({ body: { milestoneId: "m1" } });
    expect(statusCode).toBe(401);
  });

  it("grants key and returns attestation payload when EAS enabled", async () => {
    global.__MILESTONE_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        milestoneId: "m1",
      },
    });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      transactionHash: "0xgranttx",
      attestationRequired: true,
    });
    expect(global.__MILESTONE_CLAIM_PROGRESS_UPDATE__).toEqual({
      key_claim_tx_hash: "0xgranttx",
      key_claim_token_id: "123",
    });
  });

  it("persists UID on commit when attestation succeeds", async () => {
    global.__MILESTONE_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        milestoneId: "m1",
        attestationSignature: {
          attester: "0x00000000000000000000000000000000000000bb",
          recipient: "0x00000000000000000000000000000000000000bb",
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      attestationUid: "0xmilestoneattuid",
      attestationScanUrl: "https://scan/0xmilestoneattuid",
    });
    expect(global.__MILESTONE_CLAIM_PROGRESS_UPDATE__).toEqual({
      key_claim_attestation_uid: "0xmilestoneattuid",
    });
  });
});
