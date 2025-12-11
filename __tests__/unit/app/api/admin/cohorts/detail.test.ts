export { };

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

const { GET } = require("@/app/api/admin/cohorts/[cohortId]/route");
const {
  ensureAdminOrRespond,
} = require("@/lib/auth/route-handlers/admin-guard");
const { createAdminClient } = require("@/lib/supabase/server");

describe("admin cohorts detail route handler", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ensureAdminOrRespond.mockResolvedValue(null);
  });

  test("GET returns cohort detail", async () => {
    const cohort = {
      id: "co-1",
      name: "Cohort 1",
      bootcamp_programs: [{ id: "boot-1", name: "Bootcamp" }],
    };

    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: cohort, error: null });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await GET({} as any, {
      params: Promise.resolve({ cohortId: "co-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe("co-1");
    expect(body.data.bootcamp_program).toEqual({
      id: "boot-1",
      name: "Bootcamp",
    });
  });

  test("GET returns 404 when cohort missing", async () => {
    const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await GET({} as any, {
      params: Promise.resolve({ cohortId: "missing" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Cohort not found");
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
