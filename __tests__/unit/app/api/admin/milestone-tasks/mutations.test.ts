// NOTE: The import below isn't needed directly; the module is mocked further down

jest.mock("next/server", () => ({
  NextResponse: class {
    static json(body: any, init: any = {}) {
      return {
        status: init.status || 200,
        json: async () => body,
        headers: new Map(),
        cookies: { set() {} },
      };
    }
  },
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

describe("milestone-tasks route invalidation", () => {
  test("exports mutation handlers", async () => {
    const mod = await import("@/app/api/admin/milestone-tasks/route");
    expect(typeof mod.POST).toBe("function");
    expect(typeof mod.PUT).toBe("function");
    expect(typeof mod.DELETE).toBe("function");
  });
});
