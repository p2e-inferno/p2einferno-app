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

const { UNISWAP_ADDRESSES, UNISWAP_CHAIN } = jest.requireActual(
  "@/lib/uniswap/constants",
);

const userAddress = "0x000000000000000000000000000000000000bEEF";
const otherAddress = "0x000000000000000000000000000000000000c0de";

function makeSwapLog(
  poolAddress: string,
  _amount0: bigint,
  _amount1: bigint,
) {
  return {
    address: poolAddress,
    data: "0x",
    topics: [
      "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    ],
    logIndex: 0,
    blockNumber: 100n,
    transactionHash: "0xabc",
    transactionIndex: 0,
    blockHash: "0xdef",
    removed: false,
  };
}

function loadStrategy() {
  jest.resetModules();
  const { decodeEventLog } = require("viem") as { decodeEventLog: Mock };
  const {
    UniswapVerificationStrategy,
  } = require("@/lib/quests/verification/uniswap-verification");
  return { UniswapVerificationStrategy, decodeEventLog };
}

function createMockClient(overrides: {
  receipt?: any;
  chainId?: number;
  receiptError?: Error;
}) {
  return {
    getTransactionReceipt: overrides.receiptError
      ? jest.fn().mockRejectedValue(overrides.receiptError)
      : jest.fn().mockResolvedValue(overrides.receipt ?? null),
    getChainId: jest.fn().mockResolvedValue(overrides.chainId ?? UNISWAP_CHAIN.id),
  };
}

describe("UniswapVerificationStrategy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic validation", () => {
    it("should return TX_HASH_REQUIRED when no transaction hash provided", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({ receipt: null });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        {},
        "user1",
        userAddress,
        { taskConfig: { pair: "ETH_UP", direction: "A_TO_B", required_amount_in: "1000" } },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_HASH_REQUIRED");
    });

    it("should return TASK_CONFIG_MISSING when no task config", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({ receipt: null });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        { taskConfig: null },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TASK_CONFIG_MISSING");
    });

    it("should return INVALID_TASK_CONFIG for invalid pair", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({ receipt: null });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "INVALID_PAIR",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_TASK_CONFIG");
    });

    it("should return INVALID_TASK_CONFIG for invalid direction", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({ receipt: null });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "INVALID",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_TASK_CONFIG");
    });
  });

  describe("receipt validation", () => {
    it("should return TX_NOT_FOUND when receipt is null", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({ receipt: null });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_NOT_FOUND");
    });

    it("should return TX_FAILED when receipt status is reverted", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({
        receipt: {
          status: "reverted",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [],
        },
      });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_FAILED");
    });

    it("should return SENDER_MISMATCH when from != user wallet", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({
        receipt: {
          status: "success",
          from: otherAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [],
        },
      });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("SENDER_MISMATCH");
    });

    it("should return WRONG_ROUTER when tx targets wrong address", async () => {
      const { UniswapVerificationStrategy } = loadStrategy();
      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: otherAddress,
          blockNumber: 100n,
          logs: [],
        },
      });
      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("WRONG_ROUTER");
    });
  });

  describe("single-hop verification (ETH_UP)", () => {
    it("should succeed for valid ETH_UP A_TO_B swap", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();
      // ETH_UP pool: WETH in (amount0 or amount1 positive = pool received)
      decodeEventLog.mockReturnValue({
        eventName: "Swap",
        args: {
          sender: userAddress,
          recipient: userAddress,
          amount0: 1000000000000000000n, // 1 WETH in (positive = received by pool)
          amount1: -500000000000000000000n, // UP out (negative = sent by pool)
          sqrtPriceX96: 0n,
          liquidity: 0n,
          tick: 0,
        },
      });

      const swapLog = makeSwapLog(
        UNISWAP_ADDRESSES.pools.ETH_UP,
        1000000000000000000n,
        -500000000000000000000n,
      );

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [swapLog],
        },
      });

      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000000000000000000", // 1 ETH
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.pair).toBe("ETH_UP");
      expect(result.metadata?.direction).toBe("A_TO_B");
    });

    it("should return AMOUNT_TOO_LOW when input below required", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();
      decodeEventLog.mockReturnValue({
        eventName: "Swap",
        args: {
          sender: userAddress,
          recipient: userAddress,
          amount0: 500000000000000000n, // 0.5 WETH in
          amount1: -250000000000000000000n,
          sqrtPriceX96: 0n,
          liquidity: 0n,
          tick: 0,
        },
      });

      const swapLog = makeSwapLog(
        UNISWAP_ADDRESSES.pools.ETH_UP,
        500000000000000000n,
        -250000000000000000000n,
      );

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [swapLog],
        },
      });

      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000000000000000000", // requires 1 ETH
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("AMOUNT_TOO_LOW");
    });
  });

  describe("multi-hop verification (UP_USDC)", () => {
    it("should return MISSING_REQUIRED_POOL_SWAPS when only one pool has logs", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();
      decodeEventLog.mockReturnValue({
        eventName: "Swap",
        args: {
          sender: userAddress,
          recipient: userAddress,
          amount0: 1000000000000000000n,
          amount1: -500000000000000000000n,
          sqrtPriceX96: 0n,
          liquidity: 0n,
          tick: 0,
        },
      });

      // Only ETH_UP pool log, no ETH_USDC
      const swapLog = makeSwapLog(
        UNISWAP_ADDRESSES.pools.ETH_UP,
        1000000000000000000n,
        -500000000000000000000n,
      );

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [swapLog],
        },
      });

      const strategy = new UniswapVerificationStrategy(client);

      const result = await strategy.verify(
        "uniswap_swap",
        { transactionHash: "0x1234" },
        "user1",
        userAddress,
        {
          taskConfig: {
            pair: "UP_USDC",
            direction: "A_TO_B",
            required_amount_in: "1000000000000000000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("MISSING_REQUIRED_POOL_SWAPS");
    });
  });

  describe("resolveTaskVerificationMethod", () => {
    it("should map uniswap_swap to blockchain", () => {
      const { resolveTaskVerificationMethod } = require("@/lib/quests/taskVerificationMethod");
      const result = resolveTaskVerificationMethod({ task_type: "uniswap_swap" });
      expect(result).toBe("blockchain");
    });
  });

  describe("isTxHashRequiredTaskType", () => {
    it("should return true for uniswap_swap", () => {
      const { isTxHashRequiredTaskType } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("uniswap_swap")).toBe(true);
    });

    it("should return true for deploy_lock", () => {
      const { isTxHashRequiredTaskType } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("deploy_lock")).toBe(true);
    });

    it("should return true for vendor_buy", () => {
      const { isTxHashRequiredTaskType } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("vendor_buy")).toBe(true);
    });

    it("should return false for link_email", () => {
      const { isTxHashRequiredTaskType } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("link_email")).toBe(false);
    });
  });
});
