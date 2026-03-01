import handler from "@/pages/api/quests/complete-task";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { sendQuestReviewNotification } from "@/lib/email/admin-notifications";

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
jest.mock("@/lib/email/admin-notifications");

const mockGetVerificationStrategy = getVerificationStrategy as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;
const mockGetPrivyUser = getPrivyUser as jest.Mock;
const mockCheckQuestPrerequisites = checkQuestPrerequisites as jest.Mock;
const mockGetUserPrimaryWallet = getUserPrimaryWallet as jest.Mock;
const mockSendQuestReviewNotification =
  sendQuestReviewNotification as jest.Mock;

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
    mockSendQuestReviewNotification.mockResolvedValue(undefined);
  });

  it("blocks submit_proof completion when proof URL is missing", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: false,
      error: "Screenshot proof is required",
      code: "AI_IMAGE_REQUIRED",
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase({
      task: {
        task_type: "submit_proof",
        verification_method: "manual_review",
        requires_admin_review: false,
        input_required: true,
        task_config: { ai_verification_prompt: "must show the badge" },
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: {}, // missing inputData / url
        inputData: "",
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PROOF_URL_REQUIRED" }),
    );
    expect((supabase as any)._insertFn).not.toHaveBeenCalled();
  });

  it("sends admin notification for AI-deferred pending submissions even when requires_admin_review is false", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: false,
      code: "AI_DEFER",
      error: "Not confident enough",
      metadata: {
        aiVerified: false,
        aiConfidence: 0.4,
        aiReason: "Ambiguous screenshot",
        aiModel: "openai/gpt-4o-mini",
      },
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase({
      task: {
        task_type: "submit_proof",
        verification_method: "manual_review",
        requires_admin_review: false,
        input_required: true,
        task_config: { ai_verification_prompt: "must show the badge" },
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: { inputData: "https://example.com/proof.png" },
        inputData: "https://example.com/proof.png",
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
        submission_status: "pending",
        verification_data: expect.objectContaining({
          aiDeferred: true,
          proofUrl: "https://example.com/proof.png",
          inputData: "https://example.com/proof.png",
          verificationMethod: "ai",
        }),
      }),
    );
    expect(mockSendQuestReviewNotification).toHaveBeenCalledWith(
      "task-1",
      "user-1",
      "quest-1",
    );
  });

  it("sets retry status and user feedback for AI retry without notifying admins", async () => {
    const verify = jest.fn().mockResolvedValue({
      success: false,
      code: "AI_RETRY",
      error: "Please resubmit with the completion badge visible",
      metadata: {
        aiDecision: "retry",
        aiVerified: false,
        aiConfidence: 0.6,
        aiReason: "Badge not visible",
        aiModel: "google/gemini-2.0-flash-001",
      },
    });
    mockGetVerificationStrategy.mockReturnValue({ verify });

    const supabase = makeSupabase({
      task: {
        task_type: "submit_proof",
        verification_method: "manual_review",
        requires_admin_review: false,
        input_required: true,
        task_config: { ai_verification_prompt: "must show the badge" },
      },
    });
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = {
      method: "POST",
      body: {
        questId: "quest-1",
        taskId: "task-1",
        verificationData: { inputData: "https://example.com/proof.png" },
        inputData: "https://example.com/proof.png",
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
        submission_status: "retry",
        admin_feedback: expect.stringContaining("completion badge"),
      }),
    );
    expect(mockSendQuestReviewNotification).not.toHaveBeenCalled();
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
