import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __CHECKIN_API_SCENARIO__:
    | "ok"
    | "conflict"
    | "rpc_error"
    | "not_ok"
    | "missing_new_xp"
    | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_PROFILE_SCENARIO__:
    | "ok"
    | "not_found"
    | "forbidden"
    | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_EAS_SCENARIO__:
    | "disabled"
    | "enabled_schema_ok"
    | "enabled_schema_missing"
    | "enabled_attest_ok"
    | "enabled_attest_fail"
    | "enabled_attest_throw"
    | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_CAN_CHECKIN__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_RPC_ARGS__: { fnName: string; args: any } | null | undefined;
  // eslint-disable-next-line no-var
  var __CHECKIN_EAS_GRACEFUL_DEGRADE__: boolean | undefined;
}

global.__CHECKIN_API_SCENARIO__ = "ok";
global.__CHECKIN_PROFILE_SCENARIO__ = "ok";
global.__CHECKIN_AUTH_SCENARIO__ = "ok";
global.__CHECKIN_EAS_SCENARIO__ = "disabled";
global.__CHECKIN_CAN_CHECKIN__ = true;
global.__CHECKIN_RPC_ARGS__ = null;
global.__CHECKIN_EAS_GRACEFUL_DEGRADE__ = false;

jest.mock("@/lib/checkin", () => ({
  getDefaultCheckinService: () => ({
    canCheckinToday: async () => Boolean(global.__CHECKIN_CAN_CHECKIN__),
    getCheckinPreview: async () => ({
      currentStreak: 3,
      nextStreak: 4,
      currentMultiplier: 1,
      nextMultiplier: 1,
      previewXP: 150,
      breakdown: {
        baseXP: 100,
        streakBonus: 50,
        multiplier: 1,
        totalXP: 150,
      },
    }),
    getCurrentTier: () => null,
  }),
}));

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__CHECKIN_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

// Provide a minimal createAdminClient mock with just what's used by pages/api/checkin.
jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        if (table !== "user_profiles")
          throw new Error(`Unhandled table: ${table}`);

        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                if (global.__CHECKIN_PROFILE_SCENARIO__ === "not_found") {
                  return { data: null, error: null };
                }
                if (global.__CHECKIN_PROFILE_SCENARIO__ === "forbidden") {
                  return {
                    data: {
                      id: "profile-1",
                      privy_user_id: "different-privy-user",
                      experience_points: 0,
                      wallet_address:
                        "0x00000000000000000000000000000000000000aa",
                    },
                    error: null,
                  };
                }
                return {
                  data: {
                    id: "profile-1",
                    privy_user_id: "privy-user-1",
                    experience_points: 0,
                    wallet_address:
                      "0x00000000000000000000000000000000000000aa",
                  },
                  error: null,
                };
              },
            }),
          }),
        } as any;
      },
      rpc: jest.fn((fnName: string, args: any) => {
        global.__CHECKIN_RPC_ARGS__ = { fnName, args };
        return {
          single: async () => {
            switch (global.__CHECKIN_API_SCENARIO__) {
              case "conflict":
                return {
                  data: { ok: false, conflict: true, new_xp: null },
                  error: null,
                };
              case "not_ok":
                return {
                  data: { ok: false, conflict: false, new_xp: null },
                  error: null,
                };
              case "missing_new_xp":
                return {
                  data: { ok: true, conflict: false, new_xp: null },
                  error: null,
                };
              case "rpc_error":
                return { data: null, error: { message: "rpc failed" } };
              case "ok":
              default:
                return {
                  data: { ok: true, conflict: false, new_xp: 150 },
                  error: null,
                };
            }
          },
        };
      }),
    };
  });

  return { createAdminClient };
});

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: () =>
    global.__CHECKIN_EAS_SCENARIO__ !== "disabled" &&
    global.__CHECKIN_EAS_SCENARIO__ !== undefined,
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  getDefaultNetworkName: () => "base-sepolia",
}));

jest.mock("@/lib/attestation/schemas/network-resolver", () => ({
  resolveSchemaUID: jest.fn(async () => {
    if (global.__CHECKIN_EAS_SCENARIO__ === "enabled_schema_missing")
      return null;
    return "0x00000000000000000000000000000000000000000000000000000000000000bb";
  }),
}));

jest.mock("@/lib/attestation/core/delegated", () => ({
  createDelegatedAttestation: jest.fn(async () => {
    if (global.__CHECKIN_EAS_SCENARIO__ === "enabled_attest_throw") {
      throw new Error("attestation exception");
    }
    if (global.__CHECKIN_EAS_SCENARIO__ === "enabled_attest_fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xattestationuid", txHash: "0xtx" };
  }),
}));

import handler from "@/pages/api/checkin";
import { createDelegatedAttestation } from "@/lib/attestation/core/delegated";
import { isEASEnabled } from "@/lib/attestation/core/config";

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

describe("POST /api/checkin (Phase 1 harness)", () => {
  beforeEach(() => {
    global.__CHECKIN_API_SCENARIO__ = "ok";
    global.__CHECKIN_PROFILE_SCENARIO__ = "ok";
    global.__CHECKIN_AUTH_SCENARIO__ = "ok";
    global.__CHECKIN_EAS_SCENARIO__ = "disabled";
    global.__CHECKIN_CAN_CHECKIN__ = true;
    global.__CHECKIN_RPC_ARGS__ = null;
    global.__CHECKIN_EAS_GRACEFUL_DEGRADE__ = false;
    delete process.env.CHECKIN_EAS_GRACEFUL_DEGRADE;
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode, json } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
    expect(json).toEqual({ error: "Method not allowed" });
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__CHECKIN_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1", xpAmount: 10 },
    });
    expect(statusCode).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when userProfileId is missing (Phase 2 behavior)", async () => {
    const { statusCode, json } = await runApi({ body: {} });
    expect(statusCode).toBe(400);
    expect(json).toEqual({ error: "userProfileId is required" });
  });

  it("returns 404 when profile not found", async () => {
    global.__CHECKIN_PROFILE_SCENARIO__ = "not_found";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "missing", xpAmount: 10 },
    });
    expect(statusCode).toBe(404);
    expect(json).toEqual({ error: "Profile not found" });
  });

  it("returns 403 when profile does not belong to user", async () => {
    global.__CHECKIN_PROFILE_SCENARIO__ = "forbidden";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1", xpAmount: 10 },
    });
    expect(statusCode).toBe(403);
    expect(json).toEqual({ error: "Forbidden" });
  });

  it("returns 409 when service says already checked in (pre-check)", async () => {
    global.__CHECKIN_CAN_CHECKIN__ = false;
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1" },
    });
    expect(statusCode).toBe(409);
    expect(json).toEqual({
      success: false,
      error: "Already checked in today",
      xpEarned: 0,
      newStreak: 3,
      attestationUid: null,
    });
  });

  it("returns 500 when RPC errors", async () => {
    global.__CHECKIN_API_SCENARIO__ = "rpc_error";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1" },
    });
    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "Failed to perform check-in" });
  });

  it("returns 500 when RPC ok=false without conflict", async () => {
    global.__CHECKIN_API_SCENARIO__ = "not_ok";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1" },
    });
    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "Check-in failed" });
  });

  it("returns 500 when RPC ok=true but new_xp is null", async () => {
    global.__CHECKIN_API_SCENARIO__ = "missing_new_xp";
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1" },
    });
    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "Check-in result invalid" });
  });

  it("fails check-in when delegated attestation fails in fail-closed mode", async () => {
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_fail";
    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        xpAmount: 10,
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "chain down" });
  });
});

describe("POST /api/checkin (Phase 1 parity contract expectations)", () => {
  beforeEach(() => {
    global.__CHECKIN_API_SCENARIO__ = "ok";
    global.__CHECKIN_PROFILE_SCENARIO__ = "ok";
    global.__CHECKIN_AUTH_SCENARIO__ = "ok";
    global.__CHECKIN_EAS_SCENARIO__ = "disabled";
    global.__CHECKIN_CAN_CHECKIN__ = true;
    global.__CHECKIN_RPC_ARGS__ = null;
    global.__CHECKIN_EAS_GRACEFUL_DEGRADE__ = false;
    delete process.env.CHECKIN_EAS_GRACEFUL_DEGRADE;
  });

  it("returns CheckinResult fields (xpEarned/newStreak/breakdown) per docs/checkin-api-parity-contract.md", async () => {
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1", xpAmount: 9999 },
    });

    expect(statusCode).toBe(200);
    expect(json).toEqual({
      success: true,
      xpEarned: 150,
      newStreak: 4,
      breakdown: {
        baseXP: 100,
        streakBonus: 50,
        multiplier: 1,
        totalXP: 150,
      },
      attestationUid: null,
    });
  });

  it("ignores client xpAmount and computes XP server-side per docs/checkin-api-parity-contract.md", async () => {
    const { statusCode, json } = await runApi({
      body: { userProfileId: "profile-1", xpAmount: 1 },
    });
    expect(statusCode).toBe(200);
    expect(json.xpEarned).toBe(150);
  });

  it("builds full activityData server-side (streak/xpBreakdown/multiplier/tierInfo) before calling perform_daily_checkin", async () => {
    const { statusCode } = await runApi({
      body: { userProfileId: "profile-1", activityData: { greeting: "GM" } },
    });

    expect(statusCode).toBe(200);
    expect(global.__CHECKIN_RPC_ARGS__?.fnName).toBe("perform_daily_checkin");
    expect(global.__CHECKIN_RPC_ARGS__?.args).toEqual(
      expect.objectContaining({
        p_xp_amount: 150,
        p_activity_data: expect.objectContaining({
          greeting: "GM",
          streak: 4,
          attestationUid: undefined,
          xpBreakdown: {
            baseXP: 100,
            streakBonus: 50,
            multiplier: 1,
            totalXP: 150,
          },
          multiplier: 1,
          tierInfo: null,
          activityType: "daily_checkin",
        }),
      }),
    );
    expect(
      typeof global.__CHECKIN_RPC_ARGS__?.args?.p_activity_data?.timestamp,
    ).toBe("string");
  });

  it("includes attestationUid in activityData when an attestation UID is available", async () => {
    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestation: {
          uid: "0xattestationuid",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          data: { platform: "test" },
          expirationTime: 0,
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json.attestationUid).toBe("0xattestationuid");
    expect(
      global.__CHECKIN_RPC_ARGS__?.args?.p_activity_data?.attestationUid,
    ).toBe("0xattestationuid");
  });

  it("pre-checks eligibility before attempting delegated attestation to avoid wasting gas", async () => {
    global.__CHECKIN_CAN_CHECKIN__ = false;
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_ok";

    const spy = createDelegatedAttestation as unknown as jest.Mock;
    spy.mockClear();

    const { statusCode } = await runApi({
      body: {
        userProfileId: "profile-1",
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(409);
    expect(spy).not.toHaveBeenCalled();
  });

  it("enforces attestationSignature recipient matches profile.wallet_address (400) per locked contract", async () => {
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_ok";

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000bb",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(400);
    expect(json).toEqual({
      error: "attestationSignature.recipient must match profile wallet address",
    });
  });

  it("fails check-in when schema UID cannot be resolved (fail-closed parity)", async () => {
    // Fail-closed mode: schema missing should fail the check-in (matches service behavior).
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_schema_missing";
    expect(isEASEnabled()).toBe(true);

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(500);
    expect(json).toEqual({
      error:
        "Daily check-in schema UID not configured; cannot mint EAS attestation",
    });
  });

  it("fails check-in when delegated attestation returns success:false (fail-closed parity)", async () => {
    // Fail-closed mode: delegated failure should fail the check-in (matches service behavior).
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_fail";
    expect(isEASEnabled()).toBe(true);

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "chain down" });
  });

  it("fails check-in when delegated attestation throws (fail-closed parity)", async () => {
    // Fail-closed mode: delegated exception should fail the check-in (matches service behavior).
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_throw";
    expect(isEASEnabled()).toBe(true);

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(500);
    expect(json).toEqual({ error: "attestation exception" });
  });

  it("restores graceful degradation when CHECKIN_EAS_GRACEFUL_DEGRADE=1", async () => {
    process.env.CHECKIN_EAS_GRACEFUL_DEGRADE = "1";
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_schema_missing";

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json.attestationUid).toBeNull();
    expect(global.__CHECKIN_RPC_ARGS__?.fnName).toBe("perform_daily_checkin");
  });

  it("mints delegated attestation, passes p_attestation to RPC, and returns attestationUid (end-to-end)", async () => {
    global.__CHECKIN_EAS_SCENARIO__ = "enabled_attest_ok";
    expect(isEASEnabled()).toBe(true);

    const { statusCode, json } = await runApi({
      body: {
        userProfileId: "profile-1",
        activityData: { greeting: "GM" },
        attestationSignature: {
          signature: "0xsig",
          deadline: 1,
          attester: "0x00000000000000000000000000000000000000aa",
          recipient: "0x00000000000000000000000000000000000000aa",
          schemaUid:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          data: "0x",
          expirationTime: 0,
          revocable: false,
          refUID:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          chainId: 84532,
          network: "base-sepolia",
        },
      },
    });

    expect(statusCode).toBe(200);
    expect(json.attestationUid).toBe("0xattestationuid");
    expect(global.__CHECKIN_RPC_ARGS__?.fnName).toBe("perform_daily_checkin");
    expect(global.__CHECKIN_RPC_ARGS__?.args?.p_attestation).toEqual(
      expect.objectContaining({
        uid: "0xattestationuid",
        schemaUid:
          "0x00000000000000000000000000000000000000000000000000000000000000bb",
      }),
    );
    expect(
      global.__CHECKIN_RPC_ARGS__?.args?.p_activity_data?.attestationUid,
    ).toBe("0xattestationuid");
  });
});
