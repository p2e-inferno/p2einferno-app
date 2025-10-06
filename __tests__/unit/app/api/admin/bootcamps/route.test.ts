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

const { GET, POST, PUT } = require("@/app/api/admin/bootcamps/route");
const { revalidateTag } = require("next/cache");
const {
  ensureAdminOrRespond,
} = require("@/lib/auth/route-handlers/admin-guard");
const { createAdminClient } = require("@/lib/supabase/server");

function makeJsonRequest(body: unknown) {
  return {
    json: async () => body,
    headers: new Map(),
  } as any;
}

describe("admin bootcamps route handlers", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ensureAdminOrRespond.mockResolvedValue(null);
  });

  test("GET returns bootcamps list", async () => {
    const mockOrder = jest
      .fn()
      .mockResolvedValue({ data: [{ id: "boot-1" }], error: null });
    const mockSelect = jest.fn().mockReturnValue({ order: mockOrder });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const res = await GET({} as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [{ id: "boot-1" }] });
    expect(mockFrom).toHaveBeenCalledWith("bootcamp_programs");
  });

  test("POST validates payload", async () => {
    const req = makeJsonRequest({ name: "Test" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/);
  });

  test("POST inserts bootcamp and invalidates cache", async () => {
    const inserted = { id: "boot-2", name: "Bootcamp" };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: inserted, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
    const mockFrom = jest.fn().mockReturnValue({ insert: mockInsert });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const payload = {
      id: "boot-2",
      name: "Bootcamp",
      description: "Desc",
      duration_weeks: 6,
      max_reward_dgt: 100,
    };
    const req = makeJsonRequest(payload);

    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: inserted });
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: "boot-2", name: "Bootcamp" }),
    ]);
    expect(revalidateTag).toHaveBeenCalledWith("admin:bootcamp:list");
    expect(revalidateTag).toHaveBeenCalledWith("admin:bootcamp:boot-2");
  });

  test("PUT requires id", async () => {
    const req = makeJsonRequest({ name: "No Id" });
    const res = await PUT(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Bootcamp ID is required/);
  });

  test("PUT updates bootcamp", async () => {
    const updated = { id: "boot-3", name: "Updated" };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: updated, error: null });
    const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
    const mockEq = jest.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate });
    createAdminClient.mockReturnValue({ from: mockFrom });

    const payload = { id: "boot-3", name: "Updated" };
    const req = makeJsonRequest(payload);

    const res = await PUT(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: updated });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Updated" }),
    );
    expect(revalidateTag).toHaveBeenCalledWith("admin:bootcamp:list");
    expect(revalidateTag).toHaveBeenCalledWith("admin:bootcamp:boot-3");
  });

  test("returns guard response when ensureAdminOrRespond blocks", async () => {
    const guardResponse = { status: 401 };
    ensureAdminOrRespond.mockResolvedValueOnce(guardResponse);

    const res = await GET({} as any);
    expect(res).toBe(guardResponse);
  });
});
