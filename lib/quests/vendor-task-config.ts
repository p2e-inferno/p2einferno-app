import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { createViemPublicClient } from "@/lib/blockchain/providers/privy-viem";
import { getLogger } from "@/lib/utils/logger";
import { validateDeployLockConfig } from "./verification/deploy-lock-utils";
import type { SwapDirection, SwapPair } from "@/lib/uniswap/types";

const log = getLogger("quests:vendor-task-config");

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as
  | `0x${string}`
  | undefined;

export interface VendorTaskConfig {
  required_amount?: string | number | bigint;
  required_token?: "base" | "swap";
  target_stage?: number | string;
}

export function parseRequiredAmount(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.floor(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0n;
    try {
      return BigInt(trimmed);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export async function getVendorStageConstants(): Promise<
  | { minBuyAmount: bigint; minSellAmount: bigint }
  | null
> {
  if (!VENDOR_ADDRESS) {
    log.warn("Vendor address missing; cannot validate stage constants");
    return null;
  }

  const client = createViemPublicClient();
  const raw = await client.readContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getStageConstants",
  });

  const tuple = raw as unknown as
    | { minBuyAmount?: bigint; minSellAmount?: bigint }
    | readonly [bigint, bigint, bigint, bigint];

  const minBuyAmount =
    (tuple as { minBuyAmount?: bigint }).minBuyAmount ?? (tuple as any)[2];
  const minSellAmount =
    (tuple as { minSellAmount?: bigint }).minSellAmount ?? (tuple as any)[3];

  return { minBuyAmount, minSellAmount };
}

function validateUniswapSwapTaskConfig(
  config: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!config || typeof config !== "object") {
    return { ok: false, error: "Task configuration missing" };
  }
  const c = config as Record<string, unknown>;
  const pair = c.pair;
  const direction = c.direction;
  const required = c.required_amount_in;

  const allowedPairs: readonly SwapPair[] = ["ETH_UP", "ETH_USDC", "UP_USDC"];
  const allowedDirections: readonly SwapDirection[] = ["A_TO_B", "B_TO_A"];

  if (typeof pair !== "string" || !allowedPairs.includes(pair as SwapPair)) {
    return { ok: false, error: `Invalid pair: ${String(pair)}` };
  }
  if (
    typeof direction !== "string" ||
    !allowedDirections.includes(direction as SwapDirection)
  ) {
    return { ok: false, error: `Invalid direction: ${String(direction)}` };
  }
  if (typeof required !== "string" || !required.trim()) {
    return { ok: false, error: "required_amount_in is required" };
  }
  if (!/^[0-9]+$/.test(required.trim())) {
    return { ok: false, error: "required_amount_in must be a base-10 integer string" };
  }
  const asBigInt = parseRequiredAmount(required);
  if (asBigInt <= 0n) {
    return { ok: false, error: "required_amount_in must be > 0" };
  }
  return { ok: true };
}

export async function validateVendorTaskConfig(
  tasks: Array<{ title?: string; task_type?: string; task_config?: Record<string, unknown> }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1) Always validate deploy_lock + uniswap_swap configs if present (no RPC calls).
  for (const task of tasks) {
    if (task.task_type === "deploy_lock") {
      const deployValidation = validateDeployLockConfig(task.task_config);
      if (!deployValidation.success) {
        return {
          ok: false,
          error: `Task "${task.title || "Deploy Lock"}": ${deployValidation.error}`,
        };
      }
    }

    if (task.task_type === "uniswap_swap") {
      const uniValidation = validateUniswapSwapTaskConfig(task.task_config);
      if (!uniValidation.ok) {
        return {
          ok: false,
          error: `Task "${task.title || "Uniswap Swap"}": ${uniValidation.error}`,
        };
      }
    }
  }

  // 2) Vendor buy/sell minimums (RPC) only when required_amount is provided and > 0.
  const relevant = tasks.filter((task) => {
    const type = task.task_type;
    if (type !== "vendor_buy" && type !== "vendor_sell") return false;
    const cfg = task.task_config as VendorTaskConfig | undefined;
    const required = parseRequiredAmount(cfg?.required_amount);
    return required > 0n;
  });

  if (relevant.length === 0) {
    return { ok: true };
  }

  const constants = await getVendorStageConstants();
  if (!constants) {
    return { ok: false, error: "Unable to validate vendor minimum amounts" };
  }

  for (const task of relevant) {
    const cfg = task.task_config as VendorTaskConfig | undefined;
    const required = parseRequiredAmount(cfg?.required_amount);
    if (required <= 0n) continue;

    if (task.task_type === "vendor_buy" && required < constants.minBuyAmount) {
      return {
        ok: false,
        error: `Required buy amount must be >= contract minimum (${constants.minBuyAmount.toString()})`,
      };
    }

    if (task.task_type === "vendor_sell" && required < constants.minSellAmount) {
      return {
        ok: false,
        error: `Required sell amount must be >= contract minimum (${constants.minSellAmount.toString()})`,
      };
    }
  }

  return { ok: true };
}
