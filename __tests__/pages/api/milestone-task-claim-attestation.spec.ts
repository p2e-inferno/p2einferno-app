import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __TASK_CLAIM_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __TASK_CLAIM_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __TASK_CLAIM_ATTEST_SCENARIO__: "ok" | "fail" | undefined;
  // eslint-disable-next-line no-var
  var __TASK_CLAIM_UTP_UPDATE__: any | null | undefined;
}

global.__TASK_CLAIM_AUTH_SCENARIO__ = "ok";
global.__TASK_CLAIM_EAS_ENABLED__ = false;
global.__TASK_CLAIM_ATTEST_SCENARIO__ = "ok";
global.__TASK_CLAIM_UTP_UPDATE__ = null;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__TASK_CLAIM_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async ({ signature }: any) => {
    if (!global.__TASK_CLAIM_EAS_ENABLED__) return { success: true };
    if (!signature)
      return { success: false, error: "Attestation signature is required" };
    if (global.__TASK_CLAIM_ATTEST_SCENARIO__ === "fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xattestationuid", txHash: "0xtx" };
  }),
}));

// Minimal Supabase mock for /pages/api/user/task/[taskId]/claim.ts
jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "milestone_tasks":
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "task-1",
                      reward_amount: 100,
                      milestone: {
                        id: "milestone-1",
                        cohort_id: "cohort-1",
                        start_date: null,
                        end_date: null,
                        lock_address:
                          "0x00000000000000000000000000000000000000aa",
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "user_profiles":
            return {
              select: (columns: string) => {
                // request-specific shapes
                if (columns.includes("experience_points")) {
                  return {
                    eq: () => ({
                      single: async () => ({
                        data: { experience_points: 0 },
                        error: null,
                      }),
                    }),
                  } as any;
                }

                return {
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "profile-1",
                        privy_user_id: "privy-user-1",
                        wallet_address:
                          "0x00000000000000000000000000000000000000bb",
                      },
                      error: null,
                    }),
                  }),
                } as any;
              },
              update: (payload: any) => ({
                eq: async () => ({ data: null, error: null, payload }),
              }),
            } as any;
          case "bootcamp_enrollments":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () => ({
                      maybeSingle: async () => ({
                        data: { id: "enrollment-1" },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            } as any;
          case "user_task_progress":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "utp-1",
                        status: "completed",
                        submission_id: "sub-1",
                        reward_claimed: false,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: async () => {
                  global.__TASK_CLAIM_UTP_UPDATE__ = payload;
                  return { data: null, error: null };
                },
              }),
            } as any;
          case "task_submissions":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "sub-1",
                      submitted_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
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

import handler from "@/pages/api/user/task/[taskId]/claim";
import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";

async function runApi(params: {
  method?: string;
  query?: any;
  body?: any;
}): Promise<{ statusCode: number; json: any }> {
  const { req, res } = createMocks({
    method: (params.method ?? "POST") as any,
    query: params.query ?? { taskId: "task-1" },
    headers: { "Content-Type": "application/json" },
    body: params.body ?? {},
  });

  await handler(req as any, res as any);

  const statusCode = res._getStatusCode();
  const body = res._getData();
  const json = typeof body === "string" ? JSON.parse(body) : body;

  return { statusCode, json };
}

describe("POST /api/user/task/[taskId]/claim (Phase 3)", () => {
  beforeEach(() => {
    global.__TASK_CLAIM_AUTH_SCENARIO__ = "ok";
    global.__TASK_CLAIM_EAS_ENABLED__ = false;
    global.__TASK_CLAIM_ATTEST_SCENARIO__ = "ok";
    global.__TASK_CLAIM_UTP_UPDATE__ = null;
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode, json } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
    expect(json).toEqual({ error: "Method not allowed" });
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__TASK_CLAIM_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode, json } = await runApi({});
    expect(statusCode).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid taskId", async () => {
    const { statusCode, json } = await runApi({ query: { taskId: 123 } });
    expect(statusCode).toBe(400);
    expect(json).toEqual({ error: "Invalid task ID" });
  });

  it("fails when EAS enabled but signature missing (default fail-closed)", async () => {
    global.__TASK_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({ body: {} });
    expect(statusCode).toBe(400);
    expect(json).toEqual({ error: "Attestation signature is required" });
    expect(handleGaslessAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaKey: "milestone_task_reward_claim",
        gracefulDegrade: false,
      }),
    );
  });

  it("stores reward_claim_attestation_uid when attestation succeeds", async () => {
    global.__TASK_CLAIM_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        attestationSignature: {
          signature: "0xsig",
          deadline: "123",
          attester: "0x00000000000000000000000000000000000000bb",
          recipient: "0x00000000000000000000000000000000000000bb",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000cc",
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
      reward_amount: 100,
      attestationUid: "0xattestationuid",
    });
    expect(global.__TASK_CLAIM_UTP_UPDATE__).toMatchObject({
      reward_claimed: true,
      reward_claim_attestation_uid: "0xattestationuid",
    });
  });
});
