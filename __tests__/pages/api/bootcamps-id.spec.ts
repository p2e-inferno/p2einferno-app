import { createMocks } from "node-mocks-http";

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => ({ id: "did:privy:test" })),
}));

jest.mock("@/lib/supabase/client", () => {
  const bootcamp = {
    id: "boot-1",
    name: "B1",
    description: "",
    duration_weeks: 8,
    max_reward_dgt: 100,
    created_at: "",
    updated_at: "",
  };
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
            select: () => ({
              eq: () => ({
                single: async () => ({ data: bootcamp, error: null }),
              }),
            }),
          } as any;
        case "cohorts":
          return {
            select: () => ({
              eq: () => ({ order: () => ({ data: cohorts, error: null }) }),
            }),
          } as any;
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () => ({
                data: [{ id: "en-1", cohort_id: "co-1" }],
                error: null,
              }),
            }),
          } as any;
        default:
          throw new Error(`Unhandled table ${table}`);
      }
    },
  };
  return { supabase };
});

import handler from "@/pages/api/bootcamps/[id]";

function makeReqRes(id: string) {
  const { req, res } = createMocks({ method: "GET", query: { id } });
  (req as any).headers = { authorization: "Bearer test" };
  return { req: req as any, res: res as any };
}

describe("GET /api/bootcamps/[id] flags", () => {
  test("includes enrolled_in_bootcamp and decorated cohorts", async () => {
    const { req, res } = makeReqRes("boot-1");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData().data;
    expect(data.enrolled_in_bootcamp).toBe(true);
    expect(data.enrolled_cohort_id).toBe("co-1");
    expect(data.cohorts[0].is_enrolled).toBe(true);
  });
});
