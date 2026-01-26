import { createMocks } from "node-mocks-http";

declare global {
  // eslint-disable-next-line no-var
  var __QUEST_COMPLETE_AUTH_SCENARIO__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMPLETE_EAS_ENABLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMPLETE_PROGRESS_UPDATE__: any | null | undefined;
  // eslint-disable-next-line no-var
  var __QUEST_COMPLETE_RECEIPT_TOKEN_ID__: string | undefined;
}

global.__QUEST_COMPLETE_AUTH_SCENARIO__ = "ok";
global.__QUEST_COMPLETE_EAS_ENABLED__ = false;
global.__QUEST_COMPLETE_PROGRESS_UPDATE__ = null;
global.__QUEST_COMPLETE_RECEIPT_TOKEN_ID__ = "123";

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__QUEST_COMPLETE_AUTH_SCENARIO__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(() => Boolean(global.__QUEST_COMPLETE_EAS_ENABLED__)),
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
  createPublicClientUnified: jest.fn(
    () =>
      ({
        waitForTransactionReceipt: jest.fn(async () => ({
          logs: [
            {
              topics: [
                // Transfer(address,address,uint256)
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                "0x0000000000000000000000000000000000000000000000000000000000000000",
                "0x00000000000000000000000000000000000000000000000000000000000000bb",
                `0x${BigInt(global.__QUEST_COMPLETE_RECEIPT_TOKEN_ID__ || "123")
                  .toString(16)
                  .padStart(64, "0")}`,
              ],
              data: "0x",
            },
          ],
        })),
      }) as any,
  ),
}));

jest.mock("@/lib/quests/prerequisite-checker", () => ({
  getUserPrimaryWallet: jest.fn(
    async () => "0x00000000000000000000000000000000000000bb",
  ),
  checkQuestPrerequisites: jest.fn(async () => ({ canProceed: true })),
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
                      reward_type: "xdg",
                      lock_address:
                        "0x00000000000000000000000000000000000000aa",
                      prerequisite_quest_id: null,
                      prerequisite_quest_lock_address: null,
                      requires_prerequisite_key: false,
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
                    single: async () => ({
                      data: {
                        user_id: "privy-user-1",
                        quest_id: "q1",
                        tasks_completed: 2,
                        reward_claimed: false,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  eq: async () => {
                    global.__QUEST_COMPLETE_PROGRESS_UPDATE__ = payload;
                    return { data: null, error: null };
                  },
                }),
              }),
            } as any;
          case "quest_tasks":
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ id: "t1" }, { id: "t2" }],
                  error: null,
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

import handler from "@/pages/api/quests/complete-quest";

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

describe("POST /api/quests/complete-quest (Phase 7)", () => {
  beforeEach(() => {
    global.__QUEST_COMPLETE_AUTH_SCENARIO__ = "ok";
    global.__QUEST_COMPLETE_EAS_ENABLED__ = false;
    global.__QUEST_COMPLETE_PROGRESS_UPDATE__ = null;
    global.__QUEST_COMPLETE_RECEIPT_TOKEN_ID__ = "123";
  });

  it("returns 405 for non-POST", async () => {
    const { statusCode } = await runApi({ method: "GET" });
    expect(statusCode).toBe(405);
  });

  it("returns 401 when Privy user is missing", async () => {
    global.__QUEST_COMPLETE_AUTH_SCENARIO__ = "unauthorized";
    const { statusCode } = await runApi({ body: { questId: "q1" } });
    expect(statusCode).toBe(401);
  });

  it("returns tokenId + tx hash for client-side signing when EAS enabled", async () => {
    global.__QUEST_COMPLETE_EAS_ENABLED__ = true;
    const { statusCode, json } = await runApi({
      body: {
        questId: "q1",
      },
    });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({
      success: true,
      transactionHash: "0xgranttx",
      keyTokenId: "123",
      attestationRequired: true,
    });
    expect(global.__QUEST_COMPLETE_PROGRESS_UPDATE__).toMatchObject({
      reward_claimed: true,
      is_completed: true,
      key_claim_tx_hash: "0xgranttx",
      key_claim_token_id: "123",
    });
  });

  it("does not require signature when EAS is disabled", async () => {
    global.__QUEST_COMPLETE_EAS_ENABLED__ = false;
    const { statusCode, json } = await runApi({ body: { questId: "q1" } });

    expect(statusCode).toBe(200);
    expect(json).toMatchObject({ success: true });
    expect(json.attestationRequired).toBe(false);
    expect(global.__QUEST_COMPLETE_PROGRESS_UPDATE__).not.toHaveProperty(
      "key_claim_attestation_uid",
    );
  });
});
