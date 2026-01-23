import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __QUEST_CLAIM_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_CLAIM_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_CLAIM_ATTEST_SCENARIO__: "ok" | "fail" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_CLAIM_COMPLETION_UPDATE__: any | null | undefined;
}

global.__QUEST_CLAIM_AUTH_SCENARIO__ = "ok";
global.__QUEST_CLAIM_EAS_ENABLED__ = false;
global.__QUEST_CLAIM_ATTEST_SCENARIO__ = "ok";
global.__QUEST_CLAIM_COMPLETION_UPDATE__ = null;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__QUEST_CLAIM_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: () => Boolean(global.__QUEST_CLAIM_EAS_ENABLED__),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async ({ signature }: any) => {
    if (!global.__QUEST_CLAIM_EAS_ENABLED__) return { success: true };
    if (!signature)
      return { success: false, error: "Attestation signature is required" };
    if (global.__QUEST_CLAIM_ATTEST_SCENARIO__ === "fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xattestationuid", txHash: "0xtx" };
  }),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(async () => "https://scan/att/0xattestationuid"),
}));

// Minimal Supabase mock for /pages/api/quests/claim-task-reward.ts
jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "user_task_completions":
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "completion-1",
                      user_id: "privy-user-1",
                      quest_id: "quest-1",
                      task_id: "task-1",
                      reward_claimed: false,
                      submission_status: "completed",
                      verification_data: { rewardMultiplier: 1.5 },
                      quest_tasks: { reward_amount: 100, task_type: "deploy_lock" },
                      user_profiles: {
                        id: "profile-1",
                        wallet_address:
                          "0x00000000000000000000000000000000000000aa",
                      },
                    },
                    error: null,
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  global.__QUEST_CLAIM_COMPLETION_UPDATE__ = payload;
                  return { data: null, error: null };
                },
              }),
            } as any;
          case "user_profiles":
            return {
              select: (columns: string) => {
                if (columns?.includes("experience_points")) {
                  return {
                    eq: () => ({
                      single: async () => ({
                        data: { experience_points: 0 },
                        error: null,
                      }),
                    }),
                  };
                }

                return {
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "profile-1",
                        wallet_address:
                          "0x00000000000000000000000000000000000000aa",
                      },
                      error: null,
                    }),
                  }),
                };
              },
              update: () => ({
                eq: async () => ({ data: null, error: null }),
              }),
            } as any;
          case "user_activities":
            return {
              insert: async () => ({ data: null, error: null }),
            } as any;
          default:
            throw new Error(`Unhandled table: ${table}`);
        }
      },
    };
  });

  return { createAdminClient };
});

import handler from "@/pages/api/quests/claim-task-reward";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";

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

describe("POST /api/quests/claim-task-reward (Phase 4)", () => {
  beforeEach(() => {
    global.__QUEST_CLAIM_AUTH_SCENARIO__ = "ok";
    global.__QUEST_CLAIM_EAS_ENABLED__ = false;
    global.__QUEST_CLAIM_ATTEST_SCENARIO__ = "ok";
    global.__QUEST_CLAIM_COMPLETION_UPDATE__ = null;
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode, json } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
    expect(json).toEqual({ error: "Method not allowed" });
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__QUEST_CLAIM_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode, json } = await runApi({
      body: { completionId: "completion-1" },
    });
    expect(statusCode).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when completionId is missing", async () => {
    const { statusCode, json } = await runApi({ body: {} });
    expect(statusCode).toBe(400);
    expect(json).toEqual({ error: "Completion ID is required" });
  });

  it("fails when EAS enabled but signature missing (fail-closed)", async () => {
    global.__QUEST_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: { completionId: "completion-1" },
    });
    expect(statusCode).toBe(400);
    expect(json).toEqual({ error: "Attestation signature is required" });
    expect(handleGaslessAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "quest_task_reward_claim",
        gracefulDegrade: false,
      }),
    );
  });

  it("stores reward_claim_attestation_uid when attestation succeeds", async () => {
    global.__QUEST_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        completionId: "completion-1",
        attestationSignature: {
          signature: "0xsig",
          deadline: "123",
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x00",
          expirationTime: "0",
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      rewardAmount: 150, // base 100 * 1.5 multiplier rounded down
      attestationUid: "0xattestationuid",
      attestationScanUrl: "https://scan/att/0xattestationuid",
    });
    expect(global.__QUEST_CLAIM_COMPLETION_UPDATE__).toMatchObject({
      reward_claimed: true,
      reward_claim_attestation_uid: "0xattestationuid",
    });
  });
});
