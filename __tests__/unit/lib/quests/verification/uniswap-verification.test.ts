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

function sortAddress(
  a: `0x${string}`,
  b: `0x${string}`,
): [`0x${string}`, `0x${string}`] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function makeSwapArgs(params: {
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  tokenIn: `0x${string}`;
  amountIn: bigint;
  amountOut: bigint;
}) {
  const [token0, token1] = sortAddress(params.tokenA, params.tokenB);
  const tokenInLower = params.tokenIn.toLowerCase();

  // Uniswap V3 Swap: positive = pool received token (token flowed into pool),
  // negative = pool sent token (token flowed out of pool).
  const amount0 =
    token0.toLowerCase() === tokenInLower ? params.amountIn : -params.amountOut;
  const amount1 =
    token1.toLowerCase() === tokenInLower ? params.amountIn : -params.amountOut;

  return { amount0, amount1 };
}

function makeSwapLog(poolAddress: string, _amount0: bigint, _amount1: bigint) {
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

type MockReceipt = {
  status: "success" | "reverted" | (string & {});
  from: string;
  to: string | null;
  blockNumber: bigint;
  logs: any[];
};

function createMockClient(overrides: {
  receipt?: MockReceipt | null;
  chainId?: number;
  receiptError?: Error;
}) {
  return {
    getTransactionReceipt: overrides.receiptError
      ? jest.fn().mockRejectedValue(overrides.receiptError)
      : jest.fn().mockResolvedValue(overrides.receipt ?? null),
    getChainId: jest
      .fn()
      .mockResolvedValue(overrides.chainId ?? UNISWAP_CHAIN.id),
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
        {
          taskConfig: {
            pair: "ETH_UP",
            direction: "A_TO_B",
            required_amount_in: "1000",
          },
        },
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

    it("should succeed for valid UP_USDC A_TO_B route (UP->WETH then WETH->USDC)", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();

      const ethUpArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.up,
        tokenIn: UNISWAP_ADDRESSES.up,
        amountIn: 2000n,
        amountOut: 1000n,
      });
      const ethUsdcArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.usdc,
        tokenIn: UNISWAP_ADDRESSES.weth,
        amountIn: 1000n,
        amountOut: 900n,
      });

      decodeEventLog
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUpArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }))
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUsdcArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }));

      const ethUpLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_UP, 0n, 0n);
      const ethUsdcLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_USDC, 0n, 0n);

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [ethUpLog, ethUsdcLog],
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
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.pair).toBe("UP_USDC");
      expect(result.metadata?.direction).toBe("A_TO_B");
    });

    it("should succeed for valid UP_USDC B_TO_A route (USDC->WETH then WETH->UP)", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();

      const ethUsdcArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.usdc,
        tokenIn: UNISWAP_ADDRESSES.usdc,
        amountIn: 5000000n,
        amountOut: 1000n,
      });
      const ethUpArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.up,
        tokenIn: UNISWAP_ADDRESSES.weth,
        amountIn: 1000n,
        amountOut: 900n,
      });

      // Note: decode order is ETH_UP pool logs first, then ETH_USDC pool logs.
      decodeEventLog
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUpArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }))
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUsdcArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }));

      const ethUpLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_UP, 0n, 0n);
      const ethUsdcLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_USDC, 0n, 0n);

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [ethUpLog, ethUsdcLog],
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
            direction: "B_TO_A",
            required_amount_in: "5000000",
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.pair).toBe("UP_USDC");
      expect(result.metadata?.direction).toBe("B_TO_A");
    });

    it("should return ROUTE_MISMATCH when required pools swap unrelated directions (bypass regression)", async () => {
      const { UniswapVerificationStrategy, decodeEventLog } = loadStrategy();

      // ETH_UP: UP -> WETH (correct for A_TO_B)
      const ethUpArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.up,
        tokenIn: UNISWAP_ADDRESSES.up,
        amountIn: 2000n,
        amountOut: 1000n,
      });
      // ETH_USDC: USDC -> WETH (wrong for A_TO_B; should be WETH -> USDC)
      const ethUsdcWrongArgs = makeSwapArgs({
        tokenA: UNISWAP_ADDRESSES.weth,
        tokenB: UNISWAP_ADDRESSES.usdc,
        tokenIn: UNISWAP_ADDRESSES.usdc,
        amountIn: 5000000n,
        amountOut: 1000n,
      });

      decodeEventLog
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUpArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }))
        .mockImplementationOnce(() => ({
          eventName: "Swap",
          args: {
            sender: userAddress,
            recipient: userAddress,
            ...ethUsdcWrongArgs,
            sqrtPriceX96: 0n,
            liquidity: 0n,
            tick: 0,
          },
        }));

      const ethUpLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_UP, 0n, 0n);
      const ethUsdcLog = makeSwapLog(UNISWAP_ADDRESSES.pools.ETH_USDC, 0n, 0n);

      const client = createMockClient({
        receipt: {
          status: "success",
          from: userAddress,
          to: UNISWAP_ADDRESSES.universalRouter,
          blockNumber: 100n,
          logs: [ethUpLog, ethUsdcLog],
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
            required_amount_in: "1000",
          },
        },
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("ROUTE_MISMATCH");
    });
  });
});

describe("Uniswap verification helper functions", () => {
  describe("resolveTaskVerificationMethod", () => {
    it("should map uniswap_swap to blockchain", () => {
      const {
        resolveTaskVerificationMethod,
      } = require("@/lib/quests/taskVerificationMethod");
      const result = resolveTaskVerificationMethod({
        task_type: "uniswap_swap",
      });
      expect(result).toBe("blockchain");
    });
  });

  describe("isTxHashRequiredTaskType", () => {
    it("should return true for uniswap_swap", () => {
      const {
        isTxHashRequiredTaskType,
      } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("uniswap_swap")).toBe(true);
    });

    it("should return true for deploy_lock", () => {
      const {
        isTxHashRequiredTaskType,
      } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("deploy_lock")).toBe(true);
    });

    it("should return true for vendor_buy", () => {
      const {
        isTxHashRequiredTaskType,
      } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("vendor_buy")).toBe(true);
    });

    it("should return false for link_email", () => {
      const {
        isTxHashRequiredTaskType,
      } = require("@/lib/quests/vendorTaskTypes");
      expect(isTxHashRequiredTaskType("link_email")).toBe(false);
    });
  });
});
