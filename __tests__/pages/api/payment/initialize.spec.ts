import { createMocks } from "node-mocks-http";

declare global {
  var __PAYMENT_SCENARIO__:
    | "already_paid"
    | "already_enrolled"
    | "valid"
    | undefined;
}
global.__PAYMENT_SCENARIO__ = "valid";

// Mock authentication utilities
jest.mock("@/lib/utils/privyUtils", () => ({
  createPrivyClient: jest.fn(),
  fetchAndVerifyAuthorization: jest.fn().mockResolvedValue({ userId: "did:privy:test" }),
}));

jest.mock("@/lib/auth/ownership", () => ({
  assertApplicationOwnership: jest.fn().mockResolvedValue({ ok: true }),
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
                  data:
                    global.__PAYMENT_SCENARIO__ === "already_paid"
                      ? {
                        id: "app1",
                        user_email: "user@example.com",
                        user_profile_id: "u1",
                        payment_status: "completed",
                        cohort_id: "co1",
                      }
                      : {
                        id: "app1",
                        user_email: "user@example.com",
                        user_profile_id: "u1",
                        payment_status: "pending",
                        cohort_id: "co1",
                      },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          } as any;
        case "cohorts":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    naira_amount: 5000,
                    usdt_amount: 10,
                    bootcamp_program_id: "boot-1",
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
                    global.__PAYMENT_SCENARIO__ === "already_enrolled"
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
          return {
            insert: async () => ({ data: null, error: null }),
          } as any;
        default:
          return {
            update: () => ({ eq: async () => ({ data: null, error: null }) }),
          } as any;
      }
    },
  }));
  return { createAdminClient };
});

// Mock fetch for Paystack initialization
beforeEach(() => {
  (global.fetch as any) = jest.fn(async (url: string) => {
    if (url.includes("paystack.co/transaction/initialize")) {
      return {
        json: async () => ({
          status: true,
          data: {
            reference: "ref123",
            access_code: "acc",
            authorization_url: "https://paystack/redirect",
          },
        }),
      } as any;
    }
    return { json: async () => ({}) } as any;
  });
});

import handler from "@/pages/api/payment/initialize";

function makeReqRes(body: any = {}) {
  const { req, res } = createMocks({ method: "POST", body });
  return { req: req as any, res: res as any };
}

describe("POST /api/payment/initialize guards", () => {
  const baseBody = {
    applicationId: "app1",
    amount: 5000,
    currency: "NGN",
    email: "user@example.com",
  };

  test("rejects when application already paid (400)", async () => {
    global.__PAYMENT_SCENARIO__ = "already_paid";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/already completed/i);
  });

  test("rejects when user already enrolled in bootcamp (409)", async () => {
    global.__PAYMENT_SCENARIO__ = "already_enrolled";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toMatch(/already enrolled/i);
  });

  test("initializes payment when valid", async () => {
    global.__PAYMENT_SCENARIO__ = "valid";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.data.authorization_url).toBeTruthy();
  });
});
