import { registerQuestTransaction } from "@/lib/quests/verification/replay-prevention";

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe("registerQuestTransaction", () => {
  it("returns success when rpc succeeds", async () => {
    const supabase = {
      rpc: jest
        .fn()
        .mockResolvedValue({ data: { success: true }, error: null }),
    } as any;

    const result = await registerQuestTransaction(supabase, {
      txHash: "0xabc",
      userId: "user",
      taskId: "task",
      taskType: "vendor_buy",
      metadata: {
        amount: "10",
        eventName: "TokensPurchased",
        blockNumber: "1",
        logIndex: 2,
      },
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRegistered).toBe(false);
  });

  it("returns idempotent success when tx is already registered for same user/task", async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({
        data: { success: true, already_registered: true },
        error: null,
      }),
    } as any;

    const result = await registerQuestTransaction(supabase, {
      txHash: "0xabc",
      userId: "user",
      taskId: "task",
      taskType: "vendor_buy",
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRegistered).toBe(true);
  });

  it("returns conflict when rpc reports reused tx", async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({
        data: { success: false, error: "Transaction already used" },
        error: null,
      }),
    } as any;

    const result = await registerQuestTransaction(supabase, {
      txHash: "0xabc",
      userId: "user",
      taskId: "task",
      taskType: "vendor_buy",
    });

    expect(result.success).toBe(false);
    expect(result.kind).toBe("conflict");
  });

  it("returns rpc_error when rpc fails", async () => {
    const supabase = {
      rpc: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: "db error" } }),
    } as any;

    const result = await registerQuestTransaction(supabase, {
      txHash: "0xabc",
      userId: "user",
      taskId: "task",
      taskType: "vendor_buy",
    });

    expect(result.success).toBe(false);
    expect(result.kind).toBe("rpc_error");
  });
});
