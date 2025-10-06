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

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/auth/route-handlers/admin-guard", () => ({
  ensureAdminOrRespond: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

const { GET, POST, PUT, DELETE } = require("@/app/api/admin/cohorts/route");
const { revalidateTag } = require("next/cache");
const {
  ensureAdminOrRespond,
} = require("@/lib/auth/route-handlers/admin-guard");
const { createAdminClient } = require("@/lib/supabase/server");

function makeJsonRequest(
  body: unknown,
  url = "https://example.com/api/admin/cohorts",
) {
  return {
    json: async () => body,
    headers: new Map(),
    url,
  } as any;
}

function makeRequest(url = "https://example.com/api/admin/cohorts") {
  return { url } as any;
}

describe("admin cohorts route handlers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ensureAdminOrRespond.mockResolvedValue(null);
  });

  test("GET returns cohort list", async () => {
    const mockOrder = jest
      .fn()
      .mockResolvedValue({ data: [{ id: "co-1" }], error: null });
    const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [{ id: "co-1" }] });
    expect(mockFrom).toHaveBeenCalledWith("cohorts");
  });

  test("POST validates required fields", async () => {
    const res = await POST(makeJsonRequest({ name: "missing id" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/);
  });

  test("POST inserts cohort and invalidates cache", async () => {
    const record = { id: "co-2", name: "Test Cohort" };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: record, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const payload = {
      id: "co-2",
      name: "Test Cohort",
      bootcamp_program_id: "boot-1",
    };

    const res = await POST(makeJsonRequest(payload));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: record });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "co-2" }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:list");
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:co-2");
  });

  test("PUT requires id", async () => {
    const res = await PUT(makeJsonRequest({ name: "No id" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing cohort ID/);
  });

  test("PUT updates cohort and invalidates cache", async () => {
    const updated = { id: "co-3", name: "Updated" };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: updated, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await PUT(makeJsonRequest({ id: "co-3", name: "Updated" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: updated });
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:list");
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:co-3");
  });

  test("DELETE removes cohort and invalidates cache", async () => {
    const mockEq = jest.fn().mockResolvedValue({ error: null });
    const mockDelete = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ delete: mockDelete });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await DELETE(
      makeRequest("https://example.com/api/admin/cohorts?id=co-9"),
    );

    expect(res.status).toBe(200);
    await res.json();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("id", "co-9");
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:list");
    expect(revalidateTag).toHaveBeenCalledWith("admin:cohort:co-9");
  });

  test("returns guard response when ensureAdminOrRespond blocks", async () => {
    const guardResponse = { status: 401 };
    ensureAdminOrRespond.mockResolvedValueOnce(guardResponse);

    const res = await GET({} as any);
    expect(res).toBe(guardResponse);
  });
});
test("GET returns single cohort by id", async () => {
  const builder: any = {
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { id: "co-1" }, error: null }),
  };
  builder.eq = jest.fn().mockReturnValue(builder);
  const mockSelect = jest.fn().mockReturnValue(builder);
  const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
  createAdminClient.mockReturnValue({ from: mockFrom });

  const res = await GET(
    makeRequest("https://example.com/api/admin/cohorts?id=co-1"),
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.id).toBe("co-1");
  expect(builder.eq).toHaveBeenCalledWith("id", "co-1");
});

test("GET returns single cohort by lock address", async () => {
  const builder: any = {
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: { id: "co-1" }, error: null }),
  };
  builder.eq = jest.fn().mockReturnValue(builder);
  const mockSelect = jest.fn().mockReturnValue(builder);
  const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
  createAdminClient.mockReturnValue({ from: mockFrom });

  const res = await GET(
    makeRequest("https://example.com/api/admin/cohorts?lock_address=0x123"),
  );

  expect(res.status).toBe(200);
  await res.json();
  expect(builder.eq).toHaveBeenCalledWith("lock_address", "0x123");
});
