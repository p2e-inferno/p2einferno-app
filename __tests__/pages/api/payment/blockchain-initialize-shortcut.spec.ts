import { createMocks } from "node-mocks-http";

// Mock Privy auth utils to bypass token requirement
jest.mock("@/lib/utils/privyUtils", () => ({
  fetchAndVerifyAuthorization: jest.fn(async () => ({ sub: "did:privy:test" })),
  createPrivyClient: jest.fn(() => ({}) as any),
}));

// Mock Supabase admin client
jest.mock("@/lib/supabase/server", () => {
  const createAdminClient = jest.fn(() => ({
    from: (table: string) => {
      switch (table) {
        case "applications":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: "app1",
                    user_email: "user@example.com",
                    user_profile_id: "u1",
                    payment_status: "pending",
                    cohort_id: "co1",
                    cohorts: [
                      {
                        id: "co1",
                        lock_address:
                          "0x0000000000000000000000000000000000000001",
                        name: "Cohort X",
                        usdt_amount: 10,
                        bootcamp_program_id: "boot-1",
                      },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        case "user_profiles":
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "u1",
                    email: "user@example.com",
                    privy_user_id: "did:privy:test",
                  },
                  error: null,
                }),
              }),
            }),
          } as any;
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          } as any;
        case "payment_transactions":
          return {
            insert: async () => ({ data: null, error: null }),
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          } as any;
        default:
          return {
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          } as any;
      }
    },
    rpc: async () => ({ error: null }),
  }));
  return { createAdminClient };
});

// Mock hasValidKey to return true (shortcut)
jest.mock("@/lib/services/user-key-service", () => ({
  hasValidKey: jest.fn(async () => true),
}));

import handler from "@/pages/api/payment/blockchain/initialize";

function makeReqRes(body: any = {}) {
  const { req, res } = createMocks({ method: "POST", body });
  return { req: req as any, res: res as any };
}

describe("POST /api/payment/blockchain/initialize shortcut when key exists", () => {
  const baseBody = {
    applicationId: "app1",
    cohortId: "co1",
    amount: 10,
    currency: "USD",
    email: "user@example.com",
    walletAddress: "0x1111111111111111111111111111111111111111",
    chainId: 84532,
  };

  test("returns shortcut already_has_key and 200", async () => {
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.data.shortcut).toBe("already_has_key");
    expect(data.data.reference).toBeTruthy();
  });
});
