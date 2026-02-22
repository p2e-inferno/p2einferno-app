import handler from "@/pages/api/quests/complete-task";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("@/lib/quests/verification/registry");
jest.mock("@/lib/supabase/server");
jest.mock("@/lib/auth/privy");
jest.mock("@/lib/quests/prerequisite-checker");

const mockGetVerificationStrategy = getVerificationStrategy as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;
const mockGetPrivyUser = getPrivyUser as jest.Mock;
const mockCheckQuestPrerequisites = checkQuestPrerequisites as jest.Mock;
const mockGetUserPrimaryWallet = getUserPrimaryWallet as jest.Mock;

const makeSupabase = (overrides?: {
  rpc?: jest.Mock;
  insert?: jest.Mock;
  task?: Partial<{
    requires_admin_review: boolean;
    input_required: boolean;
    task_type: string;
    verification_method: string;
    task_config: Record<string, unknown> | null;
  }>;
}) => {
  const insert =
    overrides?.insert || jest.fn().mockResolvedValue({ error: null });
  const deleteEq = jest.fn().mockResolvedValue({ error: null });
  const deleteFn = jest.fn().mockReturnValue({
    eq: deleteEq,
  });
  const update = jest.fn().mockResolvedValue({ error: null });
  const rpc =
    overrides?.rpc ||
    jest
      .fn()
      .mockResolvedValueOnce({ data: { success: true }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

  const quest = {
    prerequisite_quest_id: null,
    prerequisite_quest_lock_address: null,
    requires_prerequisite_key: false,
  };

  const task = {
    requires_admin_review: false,
    input_required: false,
    task_type: "vendor_buy",
    verification_method: "blockchain",
    task_config: { required_amount: "1" },
    ...(overrides?.task || {}),
  };

  const from = jest.fn((table: string) => {
    if (table === "quests") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: quest, error: null }),
      };
    }
    if (table === "quest_tasks") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: task, error: null }),
      };
    }
    if (table === "user_task_completions") {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }),
        insert,
        update,
        delete: deleteFn,
      };
    }
    return {};
  });

  return {
    from,
    rpc,
    _insertFn: insert,
    _deleteEq: deleteEq,
  };
};

describe("POST /api/quests/complete-task", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrivyUser.mockResolvedValue({ id: "user-1" });
    mockGetUserPrimaryWallet.mockResolvedValue(
      "0x000000000000000000000000000000000000bEEF",
    );
    mockCheckQuestPrerequisites.mockResolvedValue({ canProceed: true });
  });

  it("invokes verification strategy and blocks completion on failure", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: false,
      error: "Event not found",
      code: "EVENT_NOT_FOUND",
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: { transactionHash: "0xabc" },
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await handler(req, res);

    expect(verify).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(
      (supabase as any).from("user_task_completions").insert,
    ).not.toHaveBeenCalled();
  });

  it("blocks completion when transaction replay is detected", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: true,
      metadata: {
        eventName: "TokensPurchased",
        amount: "10",
        logIndex: 1,
        blockNumber: "2",
      },
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const rpc = jest.fn().mockResolvedValue({
      data: { success: false, error: "Transaction already used" },
      error: null,
    });

    const insert = jest.fn().mockResolvedValue({ error: null });
    const supabase = makeSupabase({ rpc, insert });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: { transactionHash: "0xabc" },
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await handler(req, res);

    expect(verify).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(insert).not.toHaveBeenCalled();
    expect((supabase as any)._deleteEq).not.toHaveBeenCalled();
  });

  it("enforces blockchain verification for vendor tasks even when verification_method is misconfigured", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: true,
      metadata: {
        eventName: "TokensPurchased",
        amount: "10",
        logIndex: 1,
        blockNumber: "2",
      },
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase({
      task: {
        task_type: "vendor_buy",
        verification_method: "automatic",
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: { transactionHash: "0xabc" },
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await handler(req, res);

    expect(verify).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not persist client tx hash for vendor_level_up verification data", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: true,
      metadata: { currentStage: 3, targetStage: 3 },
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase({
      task: {
        task_type: "vendor_level_up",
        verification_method: "blockchain",
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: {
          transactionHash:
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect((supabase as any)._insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        verification_data: expect.objectContaining({
          txHash: null,
          verificationMethod: "blockchain",
          currentStage: 3,
          targetStage: 3,
        }),
      }),
    );
  });
});
