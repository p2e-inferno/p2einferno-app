import handler from "@/pages/api/quests/complete-task";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { createPrivyClient } from "@/lib/utils/privyUtils";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/lib/supabase/server");
jest.mock("@/lib/auth/privy");
jest.mock("@/lib/utils/privyUtils");
jest.mock("@/lib/quests/prerequisite-checker");
jest.mock("@/lib/quests/verification/registry");
jest.mock("@/lib/email/admin-notifications", () => ({
  sendQuestReviewNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/quests/verification/replay-prevention", () => ({
  registerQuestTransaction: jest.fn().mockResolvedValue({ success: true }),
}));

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockGetPrivyUser = getPrivyUser as jest.MockedFunction<
  typeof getPrivyUser
>;
const mockCreatePrivyClient = createPrivyClient as jest.MockedFunction<
  typeof createPrivyClient
>;
const mockCheckPrereqs = checkQuestPrerequisites as jest.MockedFunction<
  typeof checkQuestPrerequisites
>;
const mockGetUserWallet = getUserPrimaryWallet as jest.MockedFunction<
  typeof getUserPrimaryWallet
>;
const mockGetStrategy = getVerificationStrategy as jest.MockedFunction<
  typeof getVerificationStrategy
>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Supabase client configurable per task type. */
function makeSupabase(
  taskOverrides: Record<string, unknown> = {},
  options: {
    userProfile?: { data: any; error: any };
  } = {},
) {
  const defaultTask = {
    requires_admin_review: false,
    input_required: false,
    task_type: "link_email",
    verification_method: "automatic",
    task_config: null,
    ...taskOverrides,
  };

  const quest = {
    prerequisite_quest_id: null,
    prerequisite_quest_lock_address: null,
    requires_prerequisite_key: false,
  };

  const insertFn = jest.fn().mockResolvedValue({ error: null });
  const updateFn = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  const rpcFn = jest.fn().mockResolvedValue({ data: null, error: null });

  const profileResult = options.userProfile ?? { data: null, error: null };

  const from = jest.fn((table: string) => {
    if (table === "quests") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: quest, error: null }),
          }),
        }),
      };
    }
    if (table === "quest_tasks") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockResolvedValue({ data: defaultTask, error: null }),
          }),
        }),
      };
    }
    if (table === "user_task_completions") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
        insert: insertFn,
        update: updateFn,
      };
    }
    if (table === "user_profiles") {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue(profileResult),
          }),
        }),
      };
    }
    // Default fallback for any other table
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });

  return { from, rpc: rpcFn, _insertFn: insertFn };
}

function makeReq(body: Record<string, unknown> = {}, method = "POST") {
  return { method, body } as any;
}

function makeRes() {
  const res: any = {
    _statusCode: 0,
    _body: null,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(data: any) {
      res._body = data;
      return res;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrivyUser.mockResolvedValue({ id: "user-1" } as any);
  mockGetUserWallet.mockResolvedValue("0xUserWallet");
  mockCheckPrereqs.mockResolvedValue({ canProceed: true } as any);
  mockGetStrategy.mockReturnValue(undefined); // no blockchain strategy for link tasks
});

// ---------------------------------------------------------------------------
// Common behavior
// ---------------------------------------------------------------------------
describe("POST /api/quests/complete-task - common", () => {
  it("returns 405 for non-POST requests", async () => {
    const req = makeReq({}, "GET");
    const res = makeRes();
    await handler(req, res);
    expect(res._statusCode).toBe(405);
  });

  it("returns 400 when questId is missing", async () => {
    const req = makeReq({ taskId: "task-1" });
    const res = makeRes();
    await handler(req, res);
    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("Missing");
  });

  it("returns 400 when taskId is missing", async () => {
    const req = makeReq({ questId: "quest-1" });
    const res = makeRes();
    await handler(req, res);
    expect(res._statusCode).toBe(400);
  });

  it("returns 401 when user not authenticated", async () => {
    mockGetPrivyUser.mockResolvedValue(null as any);
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "quest-1", taskId: "task-1" });
    const res = makeRes();
    await handler(req, res);
    expect(res._statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// link_farcaster
// ---------------------------------------------------------------------------
describe("link_farcaster", () => {
  const taskConfig = { task_type: "link_farcaster" };

  it("completes when user has farcaster linked in Privy", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [
          { type: "farcaster", fid: 12345, username: "testuser" },
        ],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(200);
    expect(res._body.success).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submission_status: "completed",
        verification_data: { fid: 12345, username: "testuser" },
      }),
    );
  });

  it("stores fid and username in verification_data", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [
          { type: "farcaster", fid: 99999, username: "anotheruser" },
        ],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    const insertCall = supabase._insertFn.mock.calls[0][0];
    expect(insertCall.verification_data).toEqual({
      fid: 99999,
      username: "anotheruser",
    });
  });

  it("returns 400 when user has no farcaster in Privy", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [
          { type: "wallet", address: "0x123", walletClientType: "metamask" },
        ],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("Farcaster not linked");
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it("returns 400 when farcaster account has no fid", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [{ type: "farcaster", fid: null, username: "user" }],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// link_wallet
// ---------------------------------------------------------------------------
describe("link_wallet", () => {
  const taskConfig = { task_type: "link_wallet" };

  it("completes when user has external wallet in Privy", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xExternalWallet",
            walletClientType: "metamask",
          },
        ],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(200);
    expect(res._body.success).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submission_status: "completed",
        verification_data: {
          walletAddress: "0xExternalWallet",
          walletClientType: "metamask",
        },
      }),
    );
  });

  it("returns 400 when no external wallet in Privy", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("External wallet not linked");
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it("rejects embedded wallets (walletClientType: privy)", async () => {
    const supabase = makeSupabase(taskConfig);
    mockCreateAdminClient.mockReturnValue(supabase as any);
    mockCreatePrivyClient.mockReturnValue({
      getUserById: jest.fn().mockResolvedValue({
        linkedAccounts: [
          {
            type: "wallet",
            address: "0xEmbedded",
            walletClientType: "privy",
          },
        ],
      }),
    } as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("External wallet not linked");
  });
});

// ---------------------------------------------------------------------------
// link_email (no server-side validation — passes through with null data)
// ---------------------------------------------------------------------------
describe("link_email", () => {
  it("completes with null verification_data (no server check)", async () => {
    const supabase = makeSupabase({ task_type: "link_email" });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(200);
    expect(res._body.success).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submission_status: "completed",
        verification_data: null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// sign_tos (no server-side validation — passes through with null data)
// ---------------------------------------------------------------------------
describe("sign_tos", () => {
  it("completes with null verification_data (no server check)", async () => {
    const supabase = makeSupabase({ task_type: "sign_tos" });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(200);
    expect(res._body.success).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submission_status: "completed",
        verification_data: null,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// link_telegram
// ---------------------------------------------------------------------------
describe("link_telegram", () => {
  const taskConfig = { task_type: "link_telegram" };

  it("completes when user has telegram_chat_id and notifications enabled", async () => {
    const supabase = makeSupabase(taskConfig, {
      userProfile: {
        data: { telegram_chat_id: 965014523, telegram_notifications_enabled: true },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(200);
    expect(res._body.success).toBe(true);
    expect(supabase._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        submission_status: "completed",
        verification_data: { telegramChatId: 965014523 },
      }),
    );
  });

  it("stores telegramChatId in verification_data", async () => {
    const supabase = makeSupabase(taskConfig, {
      userProfile: {
        data: { telegram_chat_id: 123456789, telegram_notifications_enabled: true },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    const insertCall = supabase._insertFn.mock.calls[0][0];
    expect(insertCall.verification_data).toEqual({
      telegramChatId: 123456789,
    });
  });

  it("returns 400 when telegram_chat_id is null", async () => {
    const supabase = makeSupabase(taskConfig, {
      userProfile: {
        data: { telegram_chat_id: null, telegram_notifications_enabled: true },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("enable Telegram notifications");
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it("returns 400 when telegram_notifications_enabled is false", async () => {
    const supabase = makeSupabase(taskConfig, {
      userProfile: {
        data: { telegram_chat_id: 965014523, telegram_notifications_enabled: false },
        error: null,
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("enable Telegram notifications");
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it("returns 400 when user profile not found", async () => {
    const supabase = makeSupabase(taskConfig, {
      userProfile: {
        data: null,
        error: { message: "No rows found" },
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase as any);

    const req = makeReq({ questId: "q1", taskId: "t1" });
    const res = makeRes();
    await handler(req, res);

    expect(res._statusCode).toBe(400);
    expect(res._body.error).toContain("enable Telegram notifications");
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });
});
