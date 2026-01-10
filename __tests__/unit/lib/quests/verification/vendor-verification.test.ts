import type { Mock } from "jest-mock";

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  decodeEventLog: jest.fn(),
}));

const vendorAddress = "0x000000000000000000000000000000000000dEaD";
const userAddress = "0x000000000000000000000000000000000000bEEF";
const otherAddress = "0x000000000000000000000000000000000000c0de";

const baseReceipt = {
  to: vendorAddress,
  from: userAddress,
  status: "success",
  blockNumber: 123n,
  logs: [
    {
      address: vendorAddress,
      data: "0x",
      topics: ["0x1"],
      logIndex: 7,
    },
  ],
};

const loadStrategy = () => {
  process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS = vendorAddress;
  const {
    VendorVerificationStrategy,
  } = require("@/lib/quests/verification/vendor-verification");
  return VendorVerificationStrategy;
};

describe("VendorVerificationStrategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails when expected event is missing", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({ eventName: "OtherEvent", args: {} });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue(baseReceipt),
      readContract: jest.fn(),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: { required_amount: "1" } },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("EVENT_NOT_FOUND");
  });

  it("fails when event user does not match", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({
      eventName: "TokensPurchased",
      args: { buyer: otherAddress, baseTokenAmount: 10n, swapTokenAmount: 5n },
    });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue(baseReceipt),
      readContract: jest.fn(),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: { required_amount: "1" } },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("USER_MISMATCH");
  });

  it("fails when amount is below required", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({
      eventName: "TokensPurchased",
      args: { buyer: userAddress, baseTokenAmount: 5n, swapTokenAmount: 2n },
    });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue(baseReceipt),
      readContract: jest.fn(),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: { required_amount: "10", required_token: "base" } },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("AMOUNT_TOO_LOW");
  });

  it("passes for light up when Lit event matches user", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({
      eventName: "Lit",
      args: { user: userAddress, burnAmount: 1n, newFuel: 2n },
    });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue(baseReceipt),
      readContract: jest.fn(),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_light_up",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: {} },
    );

    expect(result.success).toBe(true);
    expect(result.metadata?.eventName).toBe("Lit");
  });

  it("fails when user stage is below target", async () => {
    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn(),
      readContract: jest.fn().mockResolvedValue([1, 0, 0, 0, 0, 0] as const),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_level_up",
      {},
      "user",
      userAddress,
      { taskConfig: { target_stage: 3 } },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("STAGE_TOO_LOW");
  });

  it("fails when transaction is to wrong contract", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({
      eventName: "TokensPurchased",
      args: { buyer: userAddress, baseTokenAmount: 10n, swapTokenAmount: 5n },
    });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue({
        ...baseReceipt,
        to: otherAddress, // NOT vendor address
      }),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: {} },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("WRONG_CONTRACT");
  });

  it("fails when transaction sender does not match user", async () => {
    const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
    decodeEventLog.mockReturnValue({
      eventName: "TokensPurchased",
      args: { buyer: userAddress, baseTokenAmount: 10n, swapTokenAmount: 5n },
    });

    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue({
        ...baseReceipt,
        from: otherAddress, // Different sender
      }),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: {} },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("SENDER_MISMATCH");
  });

  it("fails when transaction status is not success", async () => {
    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest.fn().mockResolvedValue({
        ...baseReceipt,
        status: "reverted",
      }),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: {} },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("TX_FAILED");
  });

  it("fails when transaction receipt is not found", async () => {
    const VendorVerificationStrategy = loadStrategy();
    const client = {
      getTransactionReceipt: jest
        .fn()
        .mockRejectedValue(new Error("not found")),
    } as any;

    const strategy = new VendorVerificationStrategy(client);
    const result = await strategy.verify(
      "vendor_buy",
      { transactionHash: "0xabc" },
      "user",
      userAddress,
      { taskConfig: {} },
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("TX_FETCH_FAILED");
  });
});
