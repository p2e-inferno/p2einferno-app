import { NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/eas-schema-keys/route";
import { PATCH, DELETE } from "@/app/api/admin/eas-schema-keys/[key]/route";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";

jest.mock("@/lib/auth/route-handlers/admin-guard", () => ({
  ensureAdminOrRespond: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

const mockEnsureAdminOrRespond = ensureAdminOrRespond as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;

const thenableQuery = <T>(result: T) => {
  const query: any = {
    order: jest.fn(() => query),
    eq: jest.fn(() => query),
    limit: jest.fn(() => query),
    select: jest.fn(() => query),
    maybeSingle: jest.fn(async () => result),
    single: jest.fn(async () => result),
    then: (
      resolve: (value: T) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return query as T & { order: jest.Mock; eq: jest.Mock };
};

const makeSupabase = (overrides?: {
  selectResult?: unknown;
  insertResult?: unknown;
  updateResult?: unknown;
}) => {
  const selectResult =
    overrides?.selectResult ??
    ({
      data: [{ key: "daily_checkin", label: "Daily Check-in", active: true }],
      error: null,
    } as any);
  const insertResult = overrides?.insertResult ?? ({ error: null } as any);
  const updateResult =
    overrides?.updateResult ??
    ({ data: { key: "daily_checkin" }, error: null } as any);

  const from = jest.fn(() => ({
    select: jest.fn(() => thenableQuery(selectResult)),
    insert: jest.fn(async () => insertResult),
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          maybeSingle: jest.fn(async () => updateResult),
        })),
      })),
    })),
  }));
  return {
    from,
  };
};

describe("admin eas-schema-keys routes", () => {
  beforeAll(() => {
    if (typeof Response !== "undefined" && !(Response as any).json) {
      (Response as any).json = (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
          },
        });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAdminOrRespond.mockResolvedValue(null);
  });

  it("GET returns active keys", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request(
      "http://localhost/api/admin/eas-schema-keys",
    ) as any;
    const res = await GET(req);
    const json = await res.json();

    expect(res).toBeInstanceOf(NextResponse);
    expect(json.keys?.length).toBeGreaterThan(0);
  });

  it("POST creates a schema key", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request("http://localhost/api/admin/eas-schema-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "daily_checkin", label: "Daily Check-in" }),
    }) as any;

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("PATCH updates a schema key", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request(
      "http://localhost/api/admin/eas-schema-keys/daily_checkin",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Daily Check-in", active: true }),
      },
    ) as any;

    const res = await PATCH(req, { params: { key: "daily_checkin" } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it("DELETE disables a schema key", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request(
      "http://localhost/api/admin/eas-schema-keys/daily_checkin",
      {
        method: "DELETE",
      },
    ) as any;

    const res = await DELETE(req, { params: { key: "daily_checkin" } } as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
