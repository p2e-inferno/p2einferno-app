import { createMocks } from "node-mocks-http";

import handler from "@/pages/api/daily-quests/complete-quest";

declare global {
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_AUTH__: "ok" | "unauthorized" | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_LOCK_ADDRESS__: string | null | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_BONUS__: number | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_PROGRESS_UPDATE__: any | null | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_BONUS_GATE_UPDATE__: any | null | undefined;
  // eslint-disable-next-line no-var
  var __DAILY_COMPLETE_AWARD_XP_CALLED__: boolean | undefined;
}

global.__DAILY_COMPLETE_AUTH__ = "ok";
global.__DAILY_COMPLETE_LOCK_ADDRESS__ =
  "0x00000000000000000000000000000000000000aa";
global.__DAILY_COMPLETE_BONUS__ = 10;
global.__DAILY_COMPLETE_PROGRESS_UPDATE__ = null;
global.__DAILY_COMPLETE_BONUS_GATE_UPDATE__ = null;
global.__DAILY_COMPLETE_AWARD_XP_CALLED__ = false;

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => {
    if (global.__DAILY_COMPLETE_AUTH__ === "unauthorized") return null;
    return { id: "privy-user-1" };
  }),
  extractAndValidateWalletFromHeader: jest.fn(async () => {
    return "0x00000000000000000000000000000000000000bb";
  }),
  WalletValidationError: class WalletValidationError extends Error {},
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
                `0x${BigInt(123).toString(16).padStart(64, "0")}`,
              ],
              data: "0x",
            },
          ],
        })),
      }) as any,
  ),
}));

jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => {
    return {
      from: (table: string) => {
        switch (table) {
          case "daily_quest_runs":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "run-1",
                      daily_quest_template_id: "tmpl-1",
                      status: "active",
                      starts_at: new Date(Date.now() - 60_000).toISOString(),
                      ends_at: new Date(Date.now() + 60_000).toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "daily_quest_templates":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "tmpl-1",
                      lock_address: global.__DAILY_COMPLETE_LOCK_ADDRESS__,
                      completion_bonus_reward_amount:
                        global.__DAILY_COMPLETE_BONUS__ || 0,
                    },
                    error: null,
                  }),
                }),
              }),
            } as any;
          case "user_daily_quest_progress":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: "progress-1",
                        user_id: "privy-user-1",
                        daily_quest_run_id: "run-1",
                        reward_claimed: false,
                        completion_bonus_claimed: false,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
              update: (payload: any) => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      // reward_claimed update path (4th eq)
                      eq: async () => {
                        global.__DAILY_COMPLETE_PROGRESS_UPDATE__ = payload;
                        return { data: null, error: null };
                      },
                      // completion bonus gate path (select after 3 eq)
                      select: () => ({
                        maybeSingle: async () => {
                          global.__DAILY_COMPLETE_BONUS_GATE_UPDATE__ = payload;
                          return { data: { id: "progress-1" }, error: null };
                        },
                      }),
                    }),
                  }),
                }),
              }),
            } as any;
          case "daily_quest_run_tasks":
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ id: "t1" }, { id: "t2" }],
                  error: null,
                }),
              }),
            } as any;
          case "user_daily_task_completions":
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: async () => ({
                      data: [{ id: "c1" }, { id: "c2" }],
                      error: null,
                    }),
                  }),
                }),
              }),
            } as any;
          case "user_profiles":
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "profile-uuid-1" },
                    error: null,
                  }),
                }),
              }),
            } as any;
          default:
            throw new Error(`Unexpected table: ${table}`);
        }
      },
      rpc: async (fn: string) => {
        if (fn === "award_xp_to_user") {
          global.__DAILY_COMPLETE_AWARD_XP_CALLED__ = true;
          return { data: null, error: null };
        }
        throw new Error(`Unexpected rpc: ${fn}`);
      },
    } as any;
  });

  return { createAdminClient };
});

describe("POST /api/daily-quests/complete-quest", () => {
  it("grants key and awards completion bonus", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { dailyQuestRunId: "run-1" },
      headers: {
        "x-active-wallet": "0x00000000000000000000000000000000000000bb",
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const json = JSON.parse(res._getData());
    expect(json.success).toBe(true);
    expect(json.transactionHash).toBe("0xgranttx");
    expect(global.__DAILY_COMPLETE_PROGRESS_UPDATE__).toMatchObject({
      reward_claimed: true,
      key_claim_tx_hash: "0xgranttx",
    });
    expect(global.__DAILY_COMPLETE_AWARD_XP_CALLED__).toBe(true);
  });
});
