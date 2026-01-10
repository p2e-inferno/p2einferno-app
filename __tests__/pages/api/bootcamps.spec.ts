import { createMocks } from "node-mocks-http";

declare global {
  var __BOOTCAMPS_SCENARIO__: "enrolled" | "not_enrolled" | undefined;
}
global.__BOOTCAMPS_SCENARIO__ = "enrolled";

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => ({ id: "did:privy:test" })),
}));

jest.mock("@/lib/supabase/server", () => {
  const bootcamps = [
    {
      id: "boot-1",
      name: "B1",
      description: "",
      duration_weeks: 8,
      max_reward_dgt: 100,
      created_at: "",
      updated_at: "",
    },
  ];
  const cohorts = [
    {
      id: "co-1",
      bootcamp_program_id: "boot-1",
      name: "C1",
      start_date: "2025-01-01",
      end_date: "2025-02-01",
      max_participants: 100,
      current_participants: 10,
      registration_deadline: "2025-01-15",
      status: "open",
      usdt_amount: 10,
      naira_amount: 5000,
    },
    {
      id: "co-2",
      bootcamp_program_id: "boot-1",
      name: "C2",
      start_date: "2025-03-01",
      end_date: "2025-04-01",
      max_participants: 100,
      current_participants: 10,
      registration_deadline: "2025-02-15",
      status: "open",
      usdt_amount: 10,
      naira_amount: 5000,
    },
  ];
  const supabase = {
    from: (table: string) => {
      switch (table) {
        case "user_profiles":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "u1" }, error: null }),
              }),
            }),
          } as any;
        case "bootcamp_programs":
          return {
            select: () => ({ order: () => ({ data: bootcamps, error: null }) }),
          } as any;
        case "cohorts":
          return {
            select: () => ({
              order: () => ({ data: cohorts, error: null }),
              eq: () => ({ order: () => ({ data: cohorts, error: null }) }),
            }),
          } as any;
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () => ({
                data:
                  global.__BOOTCAMPS_SCENARIO__ === "enrolled"
                    ? [{ id: "en-1", cohort_id: "co-1" }]
                    : [],
                error: null,
              }),
            }),
          } as any;
        default:
          throw new Error(`Unhandled table ${table}`);
      }
    },
  };
  return { createAdminClient: () => supabase };
});

import handler from "@/pages/api/bootcamps";

function makeReqRes() {
  const { req, res } = createMocks({ method: "GET" });
  // Fake bearer for getPrivyUser path
  (req as any).headers = { authorization: "Bearer test" };
  return { req: req as any, res: res as any };
}

describe("GET /api/bootcamps enriched flags", () => {
  test("marks enrolled bootcamp and cohort when user is enrolled", async () => {
    global.__BOOTCAMPS_SCENARIO__ = "enrolled";
    const { req, res } = makeReqRes();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData().data[0];
    expect(data.enrolled_in_bootcamp).toBe(true);
    expect(data.enrolled_cohort_id).toBe("co-1");
    const c1 = data.cohorts.find((c: any) => c.id === "co-1");
    const c2 = data.cohorts.find((c: any) => c.id === "co-2");
    expect(c1.is_enrolled).toBe(true);
    expect(c2.is_enrolled).toBe(false);
  });
});
