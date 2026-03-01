/**
 * Uniswap Swap Verification Strategy
 *
 * Verifies Uniswap V3 swap transactions on Base for supported pairs.
 * Decodes Swap event logs from tx receipts and validates pair, direction,
 * amount, and sender against task configuration.
 */

import type { PublicClient, Log } from "viem";
import { decodeEventLog } from "viem";
import type { TaskType } from "@/lib/supabase/types";
import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import type { SwapPair, SwapDirection } from "@/lib/uniswap/types";
import { UNISWAP_V3_POOL_ABI } from "@/lib/uniswap/abi/pool";
import { UNISWAP_ADDRESSES, UNISWAP_CHAIN } from "@/lib/uniswap/constants";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:verification:uniswap");

type SwapLogDecoded = {
  amount0: bigint;
  amount1: bigint;
};

/**
 * Deterministic token ordering: Uniswap V3 token0 = min(tokenA, tokenB) by address.
 */
function sortAddress(
  a: `0x${string}`,
  b: `0x${string}`,
): [`0x${string}`, `0x${string}`] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function decodeSwapLog(logEntry: Log): SwapLogDecoded | null {
  try {
    const decoded = decodeEventLog({
      abi: UNISWAP_V3_POOL_ABI,
      data: logEntry.data,
      topics: logEntry.topics as [`0x${string}`, ...`0x${string}`[]],
    });
    if (decoded.eventName !== "Swap") return null;
    const args = decoded.args as unknown as Record<string, unknown>;
    const amount0 = args.amount0;
    const amount1 = args.amount1;
    if (typeof amount0 !== "bigint" || typeof amount1 !== "bigint") return null;
    return { amount0, amount1 };
  } catch {
    return null;
  }
}

function abs(v: bigint) {
  return v < 0n ? -v : v;
}

/**
 * Get the input amount for a specific token from a Swap event.
 * Positive amount = pool received that token (i.e. it was the input token).
 */
function getAmountInForToken(
  swap: SwapLogDecoded,
  tokenIn: `0x${string}`,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
): bigint {
  const [token0, token1] = sortAddress(tokenA, tokenB);
  const token0In = swap.amount0 > 0n ? swap.amount0 : 0n;
  const token1In = swap.amount1 > 0n ? swap.amount1 : 0n;

  if (tokenIn.toLowerCase() === token0.toLowerCase()) return token0In;
  if (tokenIn.toLowerCase() === token1.toLowerCase()) return token1In;
  return 0n;
}

/** Resolve input token address for a pair + direction */
function getInputToken(
  pair: SwapPair,
  direction: SwapDirection,
): `0x${string}` {
  switch (pair) {
    case "ETH_UP":
      return direction === "A_TO_B"
        ? UNISWAP_ADDRESSES.weth
        : UNISWAP_ADDRESSES.up;
    case "ETH_USDC":
      return direction === "A_TO_B"
        ? UNISWAP_ADDRESSES.weth
        : UNISWAP_ADDRESSES.usdc;
    case "UP_USDC":
      return direction === "A_TO_B"
        ? UNISWAP_ADDRESSES.up
        : UNISWAP_ADDRESSES.usdc;
  }
}

/** Get the pool address(es) for verification */
function getPoolAddresses(pair: SwapPair): `0x${string}`[] {
  switch (pair) {
    case "ETH_UP":
      return [UNISWAP_ADDRESSES.pools.ETH_UP];
    case "ETH_USDC":
      return [UNISWAP_ADDRESSES.pools.ETH_USDC];
    case "UP_USDC":
      // Multi-hop: UP -> WETH -> USDC (through both pools)
      return [
        UNISWAP_ADDRESSES.pools.ETH_UP,
        UNISWAP_ADDRESSES.pools.ETH_USDC,
      ];
  }
}

function extractSingleHopInputAmount(params: {
  receiptLogs: Log[];
  poolAddress: `0x${string}`;
  inputToken: `0x${string}`;
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
}): { ok: true; inputAmount: bigint } | { ok: false; code: string; error: string } {
  const poolLogs = params.receiptLogs.filter(
    (l) => l.address.toLowerCase() === params.poolAddress.toLowerCase(),
  );
  const decoded = poolLogs.map(decodeSwapLog).filter(Boolean) as SwapLogDecoded[];

  if (decoded.length === 0) {
    return {
      ok: false,
      code: "MISSING_REQUIRED_POOL_SWAPS",
      error: "No Swap event found from the expected pool",
    };
  }
  if (decoded.length > 1) {
    return {
      ok: false,
      code: "AMBIGUOUS_POOL_SWAPS",
      error: `Expected exactly one Swap log from pool, got ${decoded.length}`,
    };
  }

  const inputAmount = getAmountInForToken(
    decoded[0]!,
    params.inputToken,
    params.tokenA,
    params.tokenB,
  );

  if (inputAmount <= 0n) {
    return {
      ok: false,
      code: "INPUT_AMOUNT_NOT_FOUND",
      error: "Could not derive a positive input amount from Swap log",
    };
  }

  return { ok: true, inputAmount: abs(inputAmount) };
}

function extractUpUsdcMultiHopInputAmount(params: {
  receiptLogs: Log[];
  direction: SwapDirection;
}): { ok: true; inputAmount: bigint } | { ok: false; code: string; error: string } {
  const ethUpPool = UNISWAP_ADDRESSES.pools.ETH_UP.toLowerCase();
  const ethUsdcPool = UNISWAP_ADDRESSES.pools.ETH_USDC.toLowerCase();

  const ethUpSwapLogs = params.receiptLogs.filter(
    (l) => l.address.toLowerCase() === ethUpPool,
  );
  const ethUsdcSwapLogs = params.receiptLogs.filter(
    (l) => l.address.toLowerCase() === ethUsdcPool,
  );

  const decodedEthUp = ethUpSwapLogs
    .map(decodeSwapLog)
    .filter(Boolean) as SwapLogDecoded[];
  const decodedEthUsdc = ethUsdcSwapLogs
    .map(decodeSwapLog)
    .filter(Boolean) as SwapLogDecoded[];

  if (decodedEthUp.length !== 1 || decodedEthUsdc.length !== 1) {
    return {
      ok: false,
      code:
        decodedEthUp.length === 0 || decodedEthUsdc.length === 0
          ? "MISSING_REQUIRED_POOL_SWAPS"
          : "AMBIGUOUS_POOL_SWAPS",
      error: `Expected exactly one Swap log in each pool (ETH_UP + ETH_USDC). Got ETH_UP=${decodedEthUp.length}, ETH_USDC=${decodedEthUsdc.length}.`,
    };
  }

  const ethUpSwap = decodedEthUp[0]!;
  const ethUsdcSwap = decodedEthUsdc[0]!;

  const tokenIn =
    params.direction === "A_TO_B"
      ? UNISWAP_ADDRESSES.up
      : UNISWAP_ADDRESSES.usdc;

  // For UP->USDC, input amount is UP-in on the ETH_UP pool.
  // For USDC->UP, input amount is USDC-in on the ETH_USDC pool.
  const inputAmount =
    params.direction === "A_TO_B"
      ? getAmountInForToken(
          ethUpSwap,
          tokenIn,
          UNISWAP_ADDRESSES.weth,
          UNISWAP_ADDRESSES.up,
        )
      : getAmountInForToken(
          ethUsdcSwap,
          tokenIn,
          UNISWAP_ADDRESSES.weth,
          UNISWAP_ADDRESSES.usdc,
        );

  if (inputAmount <= 0n) {
    return {
      ok: false,
      code: "INPUT_AMOUNT_NOT_FOUND",
      error: `Could not derive a positive input amount for token ${tokenIn} from required pool Swap logs.`,
    };
  }

  return { ok: true, inputAmount: abs(inputAmount) };
}

const ALLOWED_PAIRS: readonly SwapPair[] = ["ETH_UP", "ETH_USDC", "UP_USDC"];
const ALLOWED_DIRECTIONS: readonly SwapDirection[] = ["A_TO_B", "B_TO_A"];

/** Token pair for single-hop pools */
function getPoolTokenPair(
  pair: "ETH_UP" | "ETH_USDC",
): [`0x${string}`, `0x${string}`] {
  switch (pair) {
    case "ETH_UP":
      return [UNISWAP_ADDRESSES.weth, UNISWAP_ADDRESSES.up];
    case "ETH_USDC":
      return [UNISWAP_ADDRESSES.weth, UNISWAP_ADDRESSES.usdc];
  }
}

export class UniswapVerificationStrategy implements VerificationStrategy {
  constructor(private readonly client: PublicClient) {}

  async verify(
    _taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    const { transactionHash } = verificationData as {
      transactionHash?: string;
    };

    if (!transactionHash) {
      return {
        success: false,
        error: "Transaction hash required",
        code: "TX_HASH_REQUIRED",
      };
    }

    const taskConfig = options?.taskConfig as Record<string, unknown> | null;
    if (!taskConfig) {
      return {
        success: false,
        error: "Task configuration missing",
        code: "TASK_CONFIG_MISSING",
      };
    }

    const pair = taskConfig.pair as string;
    const direction = taskConfig.direction as string;
    const requiredAmountIn = taskConfig.required_amount_in as string;

    if (
      !pair ||
      !ALLOWED_PAIRS.includes(pair as SwapPair) ||
      !direction ||
      !ALLOWED_DIRECTIONS.includes(direction as SwapDirection) ||
      !requiredAmountIn
    ) {
      return {
        success: false,
        error: "Invalid task configuration",
        code: "INVALID_TASK_CONFIG",
      };
    }

    if (typeof requiredAmountIn !== "string" || !/^[0-9]+$/.test(requiredAmountIn.trim())) {
      return {
        success: false,
        error: "Invalid task configuration",
        code: "INVALID_TASK_CONFIG",
      };
    }

    let requiredAmount: bigint;
    try {
      requiredAmount = BigInt(requiredAmountIn.trim());
    } catch {
      return {
        success: false,
        error: "Invalid task configuration",
        code: "INVALID_TASK_CONFIG",
      };
    }
    if (requiredAmount <= 0n) {
      return {
        success: false,
        error: "Required amount must be > 0",
        code: "INVALID_TASK_CONFIG",
      };
    }

    try {
      const receipt = await this.client.getTransactionReceipt({
        hash: transactionHash as `0x${string}`,
      });

      if (!receipt) {
        return {
          success: false,
          error: "Transaction receipt not found",
          code: "TX_NOT_FOUND",
        };
      }

      if (receipt.status !== "success") {
        return {
          success: false,
          error: "Transaction failed",
          code: "TX_FAILED",
        };
      }

      // Enforce Base chain
      const txChainId = await this.client.getChainId();
      if (txChainId !== UNISWAP_CHAIN.id) {
        return {
          success: false,
          error: "Transaction must be on Base",
          code: "WRONG_CHAIN",
        };
      }

      // Verify sender matches user wallet
      if (receipt.from.toLowerCase() !== userAddress.toLowerCase()) {
        return {
          success: false,
          error: "Transaction sender does not match your wallet",
          code: "SENDER_MISMATCH",
        };
      }

      // Verify the tx targets the Universal Router
      if (
        !receipt.to ||
        receipt.to.toLowerCase() !==
          UNISWAP_ADDRESSES.universalRouter.toLowerCase()
      ) {
        return {
          success: false,
          error: "Transaction does not target the Uniswap Universal Router",
          code: "WRONG_ROUTER",
        };
      }

      // Extract input amount based on pair type
      const swapPair = pair as SwapPair;
      const swapDirection = direction as SwapDirection;
      let extractResult:
        | { ok: true; inputAmount: bigint }
        | { ok: false; code: string; error: string };

      if (swapPair === "UP_USDC") {
        // Multi-hop: UP -> WETH -> USDC or reverse
        extractResult = extractUpUsdcMultiHopInputAmount({
          receiptLogs: receipt.logs as Log[],
          direction: swapDirection,
        });
      } else {
        // Single-hop: ETH_UP or ETH_USDC
        const poolAddresses = getPoolAddresses(swapPair);
        const inputToken = getInputToken(swapPair, swapDirection);
        const [tokenA, tokenB] = getPoolTokenPair(swapPair);

        extractResult = extractSingleHopInputAmount({
          receiptLogs: receipt.logs as Log[],
          poolAddress: poolAddresses[0]!,
          inputToken,
          tokenA,
          tokenB,
        });
      }

      if (!extractResult.ok) {
        return {
          success: false,
          error: extractResult.error,
          code: extractResult.code,
        };
      }

      // Enforce minimum amount
      if (extractResult.inputAmount < requiredAmount) {
        return {
          success: false,
          error: `Swap input amount (${extractResult.inputAmount.toString()}) is below the required minimum (${requiredAmount.toString()})`,
          code: "AMOUNT_TOO_LOW",
        };
      }

      return {
        success: true,
        metadata: {
          pair: swapPair,
          direction: swapDirection,
          inputAmount: extractResult.inputAmount.toString(),
          transactionHash,
          chainId: UNISWAP_CHAIN.id,
          blockNumber: receipt.blockNumber.toString(),
        },
      };
    } catch (error: any) {
      log.error("Uniswap verification failed", {
        userId,
        transactionHash,
        error: error?.message || String(error),
      });

      if (error?.code === "TX_HASH_REQUIRED" || error?.code) {
        return {
          success: false,
          error: error.message || "Verification failed",
          code: error.code,
        };
      }

      return {
        success: false,
        error: "Failed to verify swap transaction",
        code: "VERIFICATION_ERROR",
      };
    }
  }
}
