export {};

jest.mock("next/server", () => ({
  NextResponse: class {
    static json(body: any, init: any = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
        headers: new Map<string, string>(),
        cookies: { set: jest.fn() },
      };
    }
  },
}));

jest.mock("@/lib/auth/route-handlers/admin-guard", () => ({
  ensureAdminOrRespond: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/types/application-status", () => ({
  computeUserApplicationStatus: jest.fn(),
}));

const {
  GET,
} = require("@/app/api/admin/cohorts/[cohortId]/applications/route");
const {
  ensureAdminOrRespond,
} = require("@/lib/auth/route-handlers/admin-guard");
const { createAdminClient } = require("@/lib/supabase/server");
const {
  computeUserApplicationStatus,
} = require("@/lib/types/application-status");

describe("admin cohorts applications route handler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ensureAdminOrRespond.mockResolvedValue(null);
    (computeUserApplicationStatus as jest.Mock).mockReturnValue("enrolled");
  });

  test("GET aggregates cohort applications", async () => {
    const rawApplications = [
      {
        id: "app-1",
        user_name: "Alice",
        user_email: "alice@example.com",
        experience_level: "beginner",
        motivation: "learn",
        payment_status: "completed",
        application_status: "approved",
        total_amount: 100,
        currency: "USD",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-02T00:00:00.000Z",
        user_profiles: [{ id: "profile-1" }],
        user_application_status: [
          { status: "enrolled", amount_paid: 50, currency: "USD" },
        ],
        payment_transactions: [
          { amount: 100, currency: "USD", status: "success" },
        ],
      },
    ];

    const applicationsSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest
          .fn()
          .mockResolvedValue({ data: rawApplications, error: null }),
      }),
    });

    const enrollmentsSelect = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({
          data: [{ user_profile_id: "profile-1", enrollment_status: "active" }],
        }),
      }),
    });

    const from = jest.fn((table: string) => {
      if (table === "applications") {
        return { select: applicationsSelect };
      }
      if (table === "bootcamp_enrollments") {
        return { select: enrollmentsSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    createAdminClient.mockReturnValue({ from });

    const res = await GET({} as any, {
      params: Promise.resolve({ cohortId: "co-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.applications).toHaveLength(1);
    expect(body.data.applications[0].needs_reconciliation).toBe(false);
    expect(body.data.stats.total_applications).toBe(1);
  });

  test("returns guard response when blocked", async () => {
    const guardResponse = { status: 401 };
    ensureAdminOrRespond.mockResolvedValueOnce(guardResponse);

    const res = await GET({} as any, {
      params: Promise.resolve({ cohortId: "co-1" }),
    });
    expect(res).toBe(guardResponse);
  });
});
