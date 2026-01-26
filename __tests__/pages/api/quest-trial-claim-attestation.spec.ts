import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __QUEST_TRIAL_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_TRIAL_EAS_ENABLED__: boolean | undefined;
}

global.__QUEST_TRIAL_AUTH_SCENARIO__ = "ok";
global.__QUEST_TRIAL_EAS_ENABLED__ = false;

jest.mock("@/lib/blockchain/legacy/server-config", () => ({
  isServerBlockchainConfigured: jest.fn(() => true),
}));

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__QUEST_TRIAL_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__QUEST_TRIAL_EAS_ENABLED__)),
}));

// Avoid importing EAS SDK during this test (we only assert the signature-required gate).
jest.mock("@/lib/attestation/api/helpers", () => ({
  handleGaslessAttestation: jest.fn(async () => ({ success: true })),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  buildEasScanLink: jest.fn(async () => "https://scan/att/0xatt"),
}));

jest.mock("@/lib/quests/prerequisite-checker", () => ({
  getUserPrimaryWallet: jest.fn(
    async () => "0x00000000000000000000000000000000000000bb",
  ),
}));

jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "quests":
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: "q1",
                      reward_type: "activation",
                      activation_type: "dg_trial",
                      activation_config: {
                        lockAddress:
                          "0x00000000000000000000000000000000000000aa",
                        trialDurationSeconds: 604800,
                      },
                      lock_address:
                        "0x00000000000000000000000000000000000000cc",
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "user_quest_progress":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { is_completed: true, reward_claimed: false },
                      error: null,
                    }),
                  }),
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

import handler from "@/pages/api/quests/get-trial";

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

describe("POST /api/quests/get-trial (Phase 7)", () => {
  beforeEach(() => {
    global.__QUEST_TRIAL_AUTH_SCENARIO__ = "ok";
    global.__QUEST_TRIAL_EAS_ENABLED__ = false;
  });

  it("returns 400 when EAS enabled but signature missing (UX requires signing)", async () => {
    global.__QUEST_TRIAL_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({ body: { questId: "q1" } });
    expect(statusCode).toBe(400);
    expect(json).toMatchObject({
      success: false,
      error: "Attestation signature is required",
    });
  });
});
