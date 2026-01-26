import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __QUEST_COMMIT_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMMIT_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMMIT_PROGRESS_UPDATE__: any | null | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMMIT_ATTEST_SCENARIO__: "ok" | "fail" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMMIT_EXISTING_UID__: string | null | undefined;
}

global.__QUEST_COMMIT_AUTH_SCENARIO__ = "ok";
global.__QUEST_COMMIT_EAS_ENABLED__ = true;
global.__QUEST_COMMIT_PROGRESS_UPDATE__ = null;
global.__QUEST_COMMIT_ATTEST_SCENARIO__ = "ok";
global.__QUEST_COMMIT_EXISTING_UID__ = null;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__QUEST_COMMIT_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__QUEST_COMMIT_EAS_ENABLED__)),
}));

jest.mock("@/lib/quests/prerequisite-checker", () => ({
  getUserPrimaryWallet: jest.fn(
    async () => "0x00000000000000000000000000000000000000bb",
  ),
}));

jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async () => {
    if (global.__QUEST_COMMIT_ATTEST_SCENARIO__ === "fail") {
      return { success: false, error: "chain down" };
    }
    return { success: true, uid: "0xquestattuid", txHash: "0xatttx" };
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
          case "user_quest_progress":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        reward_claimed: true,
                        is_completed: true,
                        key_claim_attestation_uid:
                          global.__QUEST_COMMIT_EXISTING_UID__,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  eq: async () => {
                    global.__QUEST_COMMIT_PROGRESS_UPDATE__ = payload;
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

import handler from "@/pages/api/quests/commit-completion-attestation";

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

describe("POST /api/quests/commit-completion-attestation (Phase 7)", () => {
  beforeEach(() => {
    global.__QUEST_COMMIT_AUTH_SCENARIO__ = "ok";
    global.__QUEST_COMMIT_EAS_ENABLED__ = true;
    global.__QUEST_COMMIT_PROGRESS_UPDATE__ = null;
    global.__QUEST_COMMIT_ATTEST_SCENARIO__ = "ok";
    global.__QUEST_COMMIT_EXISTING_UID__ = null;
  });

  it("returns 400 when signature missing (EAS enabled)", async () => {
    const { statusCode, json } = await runApi({ body: { questId: "q1" } });
    expect(statusCode).toBe(400);
    expect(json).toMatchObject({ error: "Attestation signature is required" });
  });

  it("returns existing UID without resubmitting (no signature required)", async () => {
    global.__QUEST_COMMIT_EXISTING_UID__ = "0xexistinguid";
    const { statusCode, json } = await runApi({ body: { questId: "q1" } });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      attestationUid: "0xexistinguid",
      attestationScanUrl: "https://scan/0xexistinguid",
    });
    expect(global.__QUEST_COMMIT_PROGRESS_UPDATE__).toBeNull();
  });

  it("persists UID and returns scan url when attestation succeeds", async () => {
    const { statusCode, json } = await runApi({
      body: {
        questId: "q1",
        attestationSignature: {
          recipient: "0x00000000000000000000000000000000000000bb",
        },
      },
    });
    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      attestationUid: "0xquestattuid",
      attestationScanUrl: "https://scan/0xquestattuid",
    });
    expect(global.__QUEST_COMMIT_PROGRESS_UPDATE__).toEqual({
      key_claim_attestation_uid: "0xquestattuid",
    });
  });
});
