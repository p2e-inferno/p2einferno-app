import { createMocks } from "node-mocks-http";

// Use a global scenario so the jest.mock factory can read it even when hoisted
declare global {
  // eslint-disable-next-line no-var
  var __APP_GUARD_SCENARIO__:
    | "enrolled"
    | "duplicate_app"
    | "clean"
    | undefined;
}
global.__APP_GUARD_SCENARIO__ = "clean";

jest.mock("@/lib/supabase/server", () => {
  const profileRow = { id: "profile1" };
  const cohortRow = { id: "cohort-abc", bootcamp_program_id: "boot-1" };
  const createAdminClient = jest.fn(() => ({
    from: (table: string) => {
      switch (table) {
        case "user_profiles":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: profileRow, error: null }),
              }),
            }),
          } as any;
        case "cohorts":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: cohortRow, error: null }),
              }),
            }),
          } as any;
        case "bootcamp_enrollments":
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data:
                    global.__APP_GUARD_SCENARIO__ === "enrolled"
                      ? [
                          {
                            id: "enroll-1",
                            cohort: {
                              id: "some-cohort",
                              bootcamp_program_id:
                                cohortRow.bootcamp_program_id,
                            },
                          },
                        ]
                      : [],
                  error: null,
                }),
            }),
          } as any;
        case "applications":
          return {
            select: () => ({
              eq: function () {
                return this;
              },
              in: function () {
                return this;
              },
              limit: function () {
                return this;
              },
              maybeSingle: async () => ({
                data:
                  global.__APP_GUARD_SCENARIO__ === "duplicate_app"
                    ? { id: "existing-app" }
                    : null,
                error: null,
              }),
            }),
            insert: (_rows: any) => ({
              select: () => ({
                single: async () => ({
                  data: { id: "new-app-id" },
                  error: null,
                }),
              }),
            }),
          } as any;
        case "user_application_status":
          return { insert: async () => ({ data: null, error: null }) } as any;
        default:
          throw new Error(`Unhandled table in mock: ${table}`);
      }
    },
  }));
  return { createAdminClient };
});

// Mock createAdminClient to return our supabaseMock
// Mock Privy getPrivyUser to return a user id
jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(async () => ({ id: "did:privy:test" })),
}));

// Import the handler after mocks
import handler from "@/pages/api/applications";

function makeReqRes(body: any = {}) {
  const { req, res } = createMocks({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return { req: req as any, res: res as any };
}

describe("POST /api/applications guards", () => {
  const baseBody = {
    cohort_id: "cohort-abc",
    user_email: "user@example.com",
    user_name: "Test User",
    phone_number: "+1234567890",
    experience_level: "beginner",
    motivation: "I want to learn",
    goals: ["learn"],
  };

  test("rejects when already enrolled in the bootcamp (409)", async () => {
    global.__APP_GUARD_SCENARIO__ = "enrolled";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(409);
    const data = res._getJSONData();
    expect(data.error).toMatch(/already enrolled/i);
  });

  test("rejects duplicate application for same cohort (409)", async () => {
    global.__APP_GUARD_SCENARIO__ = "duplicate_app";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(409);
    const data = res._getJSONData();
    expect(data.error).toMatch(/already have an application/i);
  });

  test("creates application when clean (201)", async () => {
    global.__APP_GUARD_SCENARIO__ = "clean";
    const { req, res } = makeReqRes(baseBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.data.applicationId).toBe("new-app-id");
  });
});
