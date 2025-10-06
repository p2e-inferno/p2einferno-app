import { createMocks } from "node-mocks-http";

declare global {
  var __BC_PAYMENT_SCENARIO__:
    | "already_paid"
    | "already_enrolled"
    | "valid"
    | undefined;
}
global.__BC_PAYMENT_SCENARIO__ = "valid";

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
                  data:
                    global.__BC_PAYMENT_SCENARIO__ === "already_paid"
                      ? {
                          id: "app1",
                          user_email: "user@example.com",
                          user_profile_id: "u1",
                          payment_status: "completed",
                          cohort_id: "co1",
                          cohorts: [
                            {
                              id: "co1",
                              lock_address: "0xLock",
                              name: "C",
                              usdt_amount: 10,
                              bootcamp_program_id: "boot-1",
                            },
                          ],
                        }
                      : {
                          id: "app1",
                          user_email: "user@example.com",
                          user_profile_id: "u1",
                          payment_status: "pending",
                          cohort_id: "co1",
                          cohorts: [
                            {
                              id: "co1",
                              lock_address: "0xLock",
                              name: "C",
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
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data:
                    global.__BC_PAYMENT_SCENARIO__ === "already_enrolled"
                      ? [
                          {
                            id: "en1",
                            cohort: { id: "cX", bootcamp_program_id: "boot-1" },
                          },
                        ]
                      : [],
                  error: null,
                }),
            }),
          } as any;
        case "payment_transactions":
          return { insert: async () => ({ data: null, error: null }) } as any;
        default:
          return {
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          } as any;
      }
    },
  }));
  return { createAdminClient };
});

import handler from "@/pages/api/payment/blockchain/initialize";

function makeReqRes(body: any = {}) {
  const { req, res } = createMocks({ method: "POST", body });
  return { req: req as any, res: res as any };
}

describe("POST /api/payment/blockchain/initialize guards", () => {
  const baseBody = {
    applicationId: "app1",
    cohortId: "co1",
    amount: 10,
    currency: "USD",
    email: "user@example.com",
    walletAddress: "0x1111111111111111111111111111111111111111",
    chainId: 8453,
  };

  test("rejects when application already paid (400)", async () => {
    global.__BC_PAYMENT_SCENARIO__ = "already_paid";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/already completed/i);
  });

  test("rejects when user already enrolled in bootcamp (409)", async () => {
    global.__BC_PAYMENT_SCENARIO__ = "already_enrolled";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toMatch(/already enrolled/i);
  });

  test("initializes blockchain payment when valid", async () => {
    global.__BC_PAYMENT_SCENARIO__ = "valid";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.data.reference).toBeTruthy();
    expect(data.data.lockAddress).toBe("0xLock");
  });
});
