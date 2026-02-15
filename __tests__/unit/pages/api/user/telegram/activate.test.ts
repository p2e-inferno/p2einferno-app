import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock dependencies before importing handler
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/auth/privy", () => ({
  getPrivyUser: jest.fn(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock crypto.randomBytes to return deterministic values
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomBytes: jest.fn(() => Buffer.from("a".repeat(32))),
}));

import handler from "@/pages/api/user/telegram/activate";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockGetPrivyUser = getPrivyUser as jest.MockedFunction<
  typeof getPrivyUser
>;

const MOCK_USER = { id: "did:privy:test-user-123" };
const MOCK_PROFILE = {
  id: "profile-uuid-123",
  telegram_chat_id: null,
  telegram_notifications_enabled: false,
};

function makeRequest(method: string) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
  });
  return { req, res };
}

/**
 * Build a mock Supabase client.
 * `profileResult` is the response from the profile lookup.
 * `extraCalls` is an array of additional mock return values for subsequent .from() calls.
 */
function buildMockClient(
  profileResult: { data: any; error: any },
  extraCalls: any[] = [],
) {
  // Profile lookup: from("user_profiles").select(...).eq(...).single()
  const profileSingle = jest.fn().mockResolvedValue(profileResult);
  const profileEq = jest.fn().mockReturnValue({ single: profileSingle });
  const profileSelect = jest.fn().mockReturnValue({ eq: profileEq });

  const mockFrom = jest.fn().mockReturnValueOnce({ select: profileSelect });

  // Add extra from() return values for subsequent calls
  for (const call of extraCalls) {
    mockFrom.mockReturnValueOnce(call);
  }

  const client = { from: mockFrom };
  mockCreateAdminClient.mockReturnValue(client as any);
  return { client, mockFrom, profileEq };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrivyUser.mockResolvedValue(MOCK_USER as any);
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "TestBot";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
});

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe("authentication", () => {
  it("returns 401 when Privy auth fails", async () => {
    mockGetPrivyUser.mockResolvedValueOnce(null as any);
    const { req, res } = makeRequest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 404 when user has no profile record", async () => {
    buildMockClient({ data: null, error: { message: "not found" } });
    const { req, res } = makeRequest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 405 for unsupported methods", async () => {
    buildMockClient({ data: MOCK_PROFILE, error: null });
    const { req, res } = makeRequest("PUT");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// GET - Check notification status
// ---------------------------------------------------------------------------
describe("GET - check status", () => {
  it("returns enabled: false, linked: false when no telegram linked", async () => {
    buildMockClient({ data: MOCK_PROFILE, error: null });
    const { req, res } = makeRequest("GET");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({ enabled: false, linked: false });
  });

  it("returns enabled: true, linked: true when telegram is fully enabled", async () => {
    const enabledProfile = {
      ...MOCK_PROFILE,
      telegram_chat_id: 12345,
      telegram_notifications_enabled: true,
    };
    buildMockClient({ data: enabledProfile, error: null });
    const { req, res } = makeRequest("GET");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({ enabled: true, linked: true });
  });

  it("returns enabled: false, linked: true when chat_id exists but notifications disabled", async () => {
    const linkedProfile = {
      ...MOCK_PROFILE,
      telegram_chat_id: 12345,
      telegram_notifications_enabled: false,
    };
    buildMockClient({ data: linkedProfile, error: null });
    const { req, res } = makeRequest("GET");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({ enabled: false, linked: true });
  });
});

// ---------------------------------------------------------------------------
// POST - Generate activation token
// ---------------------------------------------------------------------------
describe("POST - generate activation token", () => {
  it("generates a token and returns deepLink with bot username", async () => {
    // Invalidate tokens: from().update().eq().is()
    const invalidateIs = jest.fn().mockResolvedValue({ error: null });
    const invalidateEq = jest.fn().mockReturnValue({ is: invalidateIs });
    const invalidateUpdate = jest.fn().mockReturnValue({ eq: invalidateEq });

    // Insert token: from().insert()
    const insertFn = jest.fn().mockResolvedValue({ error: null });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: invalidateUpdate },
      { insert: insertFn },
    ]);

    const { req, res } = makeRequest("POST");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.deepLink).toMatch(/^https:\/\/t\.me\/TestBot\?start=/);
  });

  it("invalidates existing unused tokens before creating new one", async () => {
    const invalidateIs = jest.fn().mockResolvedValue({ error: null });
    const invalidateEq = jest.fn().mockReturnValue({ is: invalidateIs });
    const invalidateUpdate = jest.fn().mockReturnValue({ eq: invalidateEq });

    const insertFn = jest.fn().mockResolvedValue({ error: null });

    const { mockFrom } = buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: invalidateUpdate },
      { insert: insertFn },
    ]);

    const { req, res } = makeRequest("POST");
    await handler(req, res);

    // Second from() call should be to invalidate tokens
    expect(mockFrom).toHaveBeenNthCalledWith(2, "telegram_activation_tokens");
    expect(invalidateEq).toHaveBeenCalledWith("user_profile_id", MOCK_PROFILE.id);
    expect(invalidateIs).toHaveBeenCalledWith("used_at", null);
  });

  it("inserts token with correct user_profile_id", async () => {
    const invalidateIs = jest.fn().mockResolvedValue({ error: null });
    const invalidateEq = jest.fn().mockReturnValue({ is: invalidateIs });
    const invalidateUpdate = jest.fn().mockReturnValue({ eq: invalidateEq });

    const insertFn = jest.fn().mockResolvedValue({ error: null });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: invalidateUpdate },
      { insert: insertFn },
    ]);

    const { req, res } = makeRequest("POST");
    await handler(req, res);

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        user_profile_id: MOCK_PROFILE.id,
        token: expect.any(String),
        expires_at: expect.any(String),
      }),
    );
  });

  it("returns 500 when database insert fails", async () => {
    const invalidateIs = jest.fn().mockResolvedValue({ error: null });
    const invalidateEq = jest.fn().mockReturnValue({ is: invalidateIs });
    const invalidateUpdate = jest.fn().mockReturnValue({ eq: invalidateEq });

    const insertFn = jest.fn().mockResolvedValue({ error: { message: "insert failed" } });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: invalidateUpdate },
      { insert: insertFn },
    ]);

    const { req, res } = makeRequest("POST");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain("Failed");
  });

  it("returns 500 when bot username env var is missing", async () => {
    delete process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    buildMockClient({ data: MOCK_PROFILE, error: null });

    const { req, res } = makeRequest("POST");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain("not configured");
  });
});

// ---------------------------------------------------------------------------
// DELETE - Disable notifications
// ---------------------------------------------------------------------------
describe("DELETE - disable notifications", () => {
  it("disables notifications and returns success", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn().mockReturnValue({ eq: updateEq });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: updateFn },
    ]);

    const { req, res } = makeRequest("DELETE");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body).toEqual({ success: true });
  });

  it("updates user_profiles with correct values", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const updateFn = jest.fn().mockReturnValue({ eq: updateEq });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: updateFn },
    ]);

    const { req, res } = makeRequest("DELETE");
    await handler(req, res);

    expect(updateFn).toHaveBeenCalledWith({
      telegram_notifications_enabled: false,
      telegram_chat_id: null,
    });
    expect(updateEq).toHaveBeenCalledWith("id", MOCK_PROFILE.id);
  });

  it("returns 500 when database update fails", async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: { message: "update failed" } });
    const updateFn = jest.fn().mockReturnValue({ eq: updateEq });

    buildMockClient({ data: MOCK_PROFILE, error: null }, [
      { update: updateFn },
    ]);

    const { req, res } = makeRequest("DELETE");
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });
});
