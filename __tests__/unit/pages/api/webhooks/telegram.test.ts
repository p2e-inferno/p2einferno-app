import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock dependencies before importing handler
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/notifications/telegram", () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import handler from "@/pages/api/webhooks/telegram";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/notifications/telegram";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockSendMessage = sendTelegramMessage as jest.MockedFunction<
  typeof sendTelegramMessage
>;

const WEBHOOK_SECRET = "test-webhook-secret";

function makeRequest(body: any, secret?: string, method = "POST") {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
    body,
    headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
  });
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

// ---------------------------------------------------------------------------
// Method validation
// ---------------------------------------------------------------------------
describe("method validation", () => {
  it("returns 405 for non-POST requests", async () => {
    const { req, res } = makeRequest({}, WEBHOOK_SECRET, "GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Authentication & Security
// ---------------------------------------------------------------------------
describe("authentication", () => {
  it("returns 401 when secret token header is missing", async () => {
    const { req, res } = makeRequest({ message: {} });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 401 when secret token does not match", async () => {
    const { req, res } = makeRequest({ message: {} }, "wrong-secret");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 200 for valid secret token with non-message update", async () => {
    const { req, res } = makeRequest({ callback_query: {} }, WEBHOOK_SECRET);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Non-command messages
// ---------------------------------------------------------------------------
describe("non-command messages", () => {
  it("replies with help text for unrecognized text messages", async () => {
    const body = {
      message: { chat: { id: 12345 }, text: "Hello bot!" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("notification bot"),
    );
  });

  it("ignores non-message updates", async () => {
    const body = { edited_message: { chat: { id: 99 }, text: "edit" } };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /start with no token
// ---------------------------------------------------------------------------
describe("/start with no token", () => {
  it("sends welcome message when /start has no payload", async () => {
    const body = {
      message: { chat: { id: 12345 }, text: "/start" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Enable Telegram"),
    );
  });
});

// ---------------------------------------------------------------------------
// /start <token> - happy path
// ---------------------------------------------------------------------------
describe("/start <token> - happy path", () => {
  const validToken = "abc123def456";
  const tokenRecord = {
    id: "token-uuid",
    user_profile_id: "user-uuid",
    expires_at: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
    used_at: null,
  };

  function setupHappyPathMocks() {
    // Token lookup: from().select().eq().single()
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEqToken = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelectToken = jest.fn().mockReturnValue({ eq: mockEqToken });

    // Mark token used: from().update().eq().is().select().single()
    const mockMarkSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: tokenRecord.id }, error: null });
    const mockMarkSelect = jest
      .fn()
      .mockReturnValue({ single: mockMarkSingle });
    const mockIs = jest.fn().mockReturnValue({ select: mockMarkSelect });
    const mockEqMark = jest.fn().mockReturnValue({ is: mockIs });
    const mockUpdateToken = jest.fn().mockReturnValue({ eq: mockEqMark });

    // Update profile: from().update().eq()
    const mockEqProfile = jest.fn().mockResolvedValue({ error: null });
    const mockUpdateProfile = jest.fn().mockReturnValue({ eq: mockEqProfile });

    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({ select: mockSelectToken }) // token lookup
      .mockReturnValueOnce({ update: mockUpdateToken }) // mark used
      .mockReturnValueOnce({ update: mockUpdateProfile }); // update profile

    mockCreateAdminClient.mockReturnValue({ from: mockFrom } as any);

    return { mockFrom, mockIs, mockEqProfile, mockSingle };
  }

  it("validates token and enables notifications successfully", async () => {
    setupHappyPathMocks();

    const body = {
      message: { chat: { id: 99999 }, text: `/start ${validToken}` },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    // Confirm success message sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      99999,
      expect.stringContaining("Notifications enabled"),
    );
  });

  it("sends confirmation message to the user", async () => {
    setupHappyPathMocks();

    const body = {
      message: { chat: { id: 99999 }, text: `/start ${validToken}` },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(mockSendMessage).toHaveBeenCalledWith(
      99999,
      expect.stringContaining("quest approvals"),
    );
  });
});

// ---------------------------------------------------------------------------
// /start <token> - error cases
// ---------------------------------------------------------------------------
describe("/start <token> - error cases", () => {
  it("sends error reply when token does not exist", async () => {
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "not found" } });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({ select: mockSelect }),
    } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start invalidtoken" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("invalid"),
    );
  });

  it("sends error reply when token is already used", async () => {
    const tokenRecord = {
      id: "token-uuid",
      user_profile_id: "user-uuid",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used_at: new Date().toISOString(), // already used
    };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({ select: mockSelect }),
    } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start usedtoken" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("already been used"),
    );
  });

  it("sends error reply when token is expired", async () => {
    const tokenRecord = {
      id: "token-uuid",
      user_profile_id: "user-uuid",
      expires_at: new Date(Date.now() - 600_000).toISOString(), // expired
      used_at: null,
    };
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEq = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockCreateAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({ select: mockSelect }),
    } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start expiredtoken" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("expired"),
    );
  });

  it("sends error reply when marking token as used fails", async () => {
    const tokenRecord = {
      id: "token-uuid",
      user_profile_id: "user-uuid",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used_at: null,
    };

    // Token lookup succeeds
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEqToken = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelectToken = jest.fn().mockReturnValue({ eq: mockEqToken });

    // Mark used fails
    const mockMarkSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: { message: "update failed" } });
    const mockMarkSelect = jest
      .fn()
      .mockReturnValue({ single: mockMarkSingle });
    const mockIs = jest.fn().mockReturnValue({ select: mockMarkSelect });
    const mockEqMark = jest.fn().mockReturnValue({ is: mockIs });
    const mockUpdateToken = jest.fn().mockReturnValue({ eq: mockEqMark });

    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({ select: mockSelectToken })
      .mockReturnValueOnce({ update: mockUpdateToken });

    mockCreateAdminClient.mockReturnValue({ from: mockFrom } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start sometoken" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("already been used"),
    );
  });

  it("sends error reply when updating user profile fails", async () => {
    const tokenRecord = {
      id: "token-uuid",
      user_profile_id: "user-uuid",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used_at: null,
    };

    // Token lookup succeeds
    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEqToken = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelectToken = jest.fn().mockReturnValue({ eq: mockEqToken });

    // Mark used succeeds
    const mockMarkSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: "token-uuid" }, error: null });
    const mockMarkSelect = jest
      .fn()
      .mockReturnValue({ single: mockMarkSingle });
    const mockIs = jest.fn().mockReturnValue({ select: mockMarkSelect });
    const mockEqMark = jest.fn().mockReturnValue({ is: mockIs });
    const mockUpdateToken = jest.fn().mockReturnValue({ eq: mockEqMark });

    // Update profile fails
    const mockEqProfile = jest
      .fn()
      .mockResolvedValue({ error: { message: "profile update failed" } });
    const mockUpdateProfile = jest.fn().mockReturnValue({ eq: mockEqProfile });

    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({ select: mockSelectToken })
      .mockReturnValueOnce({ update: mockUpdateToken })
      .mockReturnValueOnce({ update: mockUpdateProfile });

    mockCreateAdminClient.mockReturnValue({ from: mockFrom } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start sometoken" },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Something went wrong"),
    );
  });
});

// ---------------------------------------------------------------------------
// /start <token> - edge cases
// ---------------------------------------------------------------------------
describe("/start <token> - edge cases", () => {
  it("handles token with extra whitespace in message text", async () => {
    const tokenRecord = {
      id: "token-uuid",
      user_profile_id: "user-uuid",
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      used_at: null,
    };

    const mockSingle = jest
      .fn()
      .mockResolvedValue({ data: tokenRecord, error: null });
    const mockEqToken = jest.fn().mockReturnValue({ single: mockSingle });
    const mockSelectToken = jest.fn().mockReturnValue({ eq: mockEqToken });

    const mockMarkSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: "token-uuid" }, error: null });
    const mockMarkSelect = jest
      .fn()
      .mockReturnValue({ single: mockMarkSingle });
    const mockIs = jest.fn().mockReturnValue({ select: mockMarkSelect });
    const mockEqMark = jest.fn().mockReturnValue({ is: mockIs });
    const mockUpdateToken = jest.fn().mockReturnValue({ eq: mockEqMark });

    const mockEqProfile = jest.fn().mockResolvedValue({ error: null });
    const mockUpdateProfile = jest.fn().mockReturnValue({ eq: mockEqProfile });

    const mockFrom = jest
      .fn()
      .mockReturnValueOnce({ select: mockSelectToken })
      .mockReturnValueOnce({ update: mockUpdateToken })
      .mockReturnValueOnce({ update: mockUpdateProfile });

    mockCreateAdminClient.mockReturnValue({ from: mockFrom } as any);

    const body = {
      message: { chat: { id: 12345 }, text: "/start   spaced-token   " },
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    // The token should have been trimmed
    expect(mockEqToken).toHaveBeenCalledWith("token", "spaced-token");
  });

  it("returns 200 when message has no chat id", async () => {
    const body = {
      message: { text: "/start sometoken" }, // no chat.id
    };
    const { req, res } = makeRequest(body, WEBHOOK_SECRET);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
