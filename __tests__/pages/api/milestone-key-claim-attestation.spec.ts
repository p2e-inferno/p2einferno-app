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
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(async (uid: string) => `https://scan/${uid}`),
}));

jest.mock("@/lib/services/user-key-service", () => ({
  grantKeyToUser: jest.fn(async () => ({
    success: true,
    transactionHash: "0xgranttx",
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
}): Promise<{ statusCode: number; json: any }> {
  const { req, res } = createMocks({
    method: (params.method ?? "POST") as any,
    headers: { "Content-Type": "application/json" },
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

  it("grants key and includes attestationUid when attestation succeeds", async () => {
    global.__MILESTONE_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        milestoneId: "m1",
        attestationSignature: {
          recipient: "0x00000000000000000000000000000000000000bb",
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      transactionHash: "0xgranttx",
      attestationUid: "0xmilestoneattuid",
      attestationScanUrl: "https://scan/0xmilestoneattuid",
    });
    expect(global.__MILESTONE_CLAIM_PROGRESS_UPDATE__).toEqual({
      key_claim_attestation_uid: "0xmilestoneattuid",
    });
  });

  it("returns 400 when EAS enabled but signature missing (UX requires signing)", async () => {
    global.__MILESTONE_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({ body: { milestoneId: "m1" } });
    expect(statusCode).toBe(400);
    expect(json).toMatchObject({ error: "Attestation signature is required" });
  });
});
