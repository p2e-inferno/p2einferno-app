import { createMocks } from "node-mocks-http";

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => ({ id: "did:privy:test" })),
}));

jest.mock("@/lib/supabase/client", () => {
  const cohort = {
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
  };
  const bootcamp = {
    id: "boot-1",
    name: "B1",
    description: "",
    duration_weeks: 8,
    max_reward_dgt: 100,
    created_at: "",
    updated_at: "",
  };
  const milestones: any[] = [];
  const highlights: any[] = [];
  const requirements: any[] = [];
  const supabase = {
    from: (table: string) => {
      switch (table) {
        case "cohorts":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: cohort, error: null }),
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
        case "cohort_milestones":
          return {
            select: () => ({
              eq: () => ({ order: () => ({ data: milestones, error: null }) }),
            }),
          } as any;
        case "program_highlights":
          return {
            select: () => ({
              eq: () => ({ order: () => ({ data: highlights, error: null }) }),
            }),
          } as any;
        case "program_requirements":
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: requirements, error: null }),
              }),
            }),
          } as any;
        case "user_profiles":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "u1" }, error: null }),
              }),
            }),
          } as any;
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () => ({
                data: [
                  {
                    id: "en-1",
                    cohort: { id: "co-1", bootcamp_program_id: "boot-1" },
                  },
                ],
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

import handler from "@/pages/api/cohorts/[cohortId]";

function makeReqRes(cohortId: string) {
  const { req, res } = createMocks({ method: "GET", query: { cohortId } });
  (req as any).headers = { authorization: "Bearer test" };
  return { req: req as any, res: res as any };
}

describe("GET /api/cohorts/[cohortId] includes userEnrollment flags", () => {
  test("userEnrollment shows enrolledInBootcamp and enrolledCohortId", async () => {
    const { req, res } = makeReqRes("co-1");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData().data;
    expect(data.userEnrollment.isEnrolledInBootcamp).toBe(true);
    expect(data.userEnrollment.enrolledCohortId).toBe("co-1");
  });
});
