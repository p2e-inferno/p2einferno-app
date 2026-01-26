import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __XP_RENEW_COMMIT_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __XP_RENEW_COMMIT_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __XP_RENEW_COMMIT_ATTEST_SCENARIO__: "ok" | "fail" | undefined;
  // eslint-disable-next-line no-var
  var __XP_RENEW_COMMIT_EXISTING_UID__: string | null | undefined;
  // eslint-disable-next-line no-var
  var __XP_RENEW_COMMIT_UPDATED__: any | null | undefined;
}

global.__XP_RENEW_COMMIT_AUTH_SCENARIO__ = "ok";
global.__XP_RENEW_COMMIT_EAS_ENABLED__ = true;
global.__XP_RENEW_COMMIT_ATTEST_SCENARIO__ = "ok";
global.__XP_RENEW_COMMIT_EXISTING_UID__ = null;
global.__XP_RENEW_COMMIT_UPDATED__ = null;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__XP_RENEW_COMMIT_AUTH_SCENARIO__ === "unauthorized")
      return null;
    return {
      id: "privy-user-1",
      wallet: { address: "0x00000000000000000000000000000000000000bb" },
    };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__XP_RENEW_COMMIT_EAS_ENABLED__)),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async () => {
    if (global.__XP_RENEW_COMMIT_ATTEST_SCENARIO__ === "fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xrenewuid", txHash: "0xatttx" };
  }),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(async (uid: string) => `https://scan/${uid}`),
}));

jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "subscription_renewal_attempts":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "a1",
                        user_id: "privy-user-1",
                        status: "success",
                        attestation_uid:
                          global.__XP_RENEW_COMMIT_EXISTING_UID__,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  eq: async () => {
                    global.__XP_RENEW_COMMIT_UPDATED__ = payload;
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

import handler from "@/pages/api/subscriptions/commit-renewal-attestation";

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

describe("POST /api/subscriptions/commit-renewal-attestation (Phase 8)", () => {
  beforeEach(() => {
    global.__XP_RENEW_COMMIT_AUTH_SCENARIO__ = "ok";
    global.__XP_RENEW_COMMIT_EAS_ENABLED__ = true;
    global.__XP_RENEW_COMMIT_ATTEST_SCENARIO__ = "ok";
    global.__XP_RENEW_COMMIT_EXISTING_UID__ = null;
    global.__XP_RENEW_COMMIT_UPDATED__ = null;
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__XP_RENEW_COMMIT_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode } = await runApi({
      body: { renewalAttemptId: "a1" },
    });
    expect(statusCode).toBe(401);
  });

  it("returns existing UID without resubmitting (no signature required)", async () => {
    global.__XP_RENEW_COMMIT_EXISTING_UID__ = "0xexisting";
    const { statusCode, json } = await runApi({
      body: { renewalAttemptId: "a1" },
    });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      attestationUid: "0xexisting",
      attestationScanUrl: "https://scan/0xexisting",
    });
    expect(global.__XP_RENEW_COMMIT_UPDATED__).toBeNull();
  });

  it("returns 400 when signature missing (EAS enabled and no existing UID)", async () => {
    const { statusCode, json } = await runApi({
      body: { renewalAttemptId: "a1" },
    });
    expect(statusCode).toBe(400);
    expect(json).toMatchObject({ error: "Attestation signature is required" });
  });

  it("persists UID and returns scan url when attestation succeeds", async () => {
    const { statusCode, json } = await runApi({
      body: {
        renewalAttemptId: "a1",
        attestationSignature: {
          recipient: "0x00000000000000000000000000000000000000bb",
        },
      },
    });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      attestationUid: "0xrenewuid",
      attestationScanUrl: "https://scan/0xrenewuid",
    });
    expect(global.__XP_RENEW_COMMIT_UPDATED__).toEqual({
      attestation_uid: "0xrenewuid",
    });
  });
});
