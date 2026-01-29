import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { createViemPublicClient } from "@/lib/blockchain/providers/privy-viem";
import { getLogger } from "@/lib/utils/logger";
import { validateDeployLockConfig } from "./verification/deploy-lock-utils";

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

export async function validateVendorTaskConfig(
  tasks: Array<{ title?: string; task_type?: string; task_config?: Record<string, unknown> }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

    if (task.task_type === "vendor_buy") {
      if (required < constants.minBuyAmount) {
        return {
          ok: false,
          error: `Required buy amount must be >= contract minimum (${constants.minBuyAmount.toString()})`,
        };
      }
    }

    if (task.task_type === "vendor_sell") {
      if (required < constants.minSellAmount) {
        return {
          ok: false,
          error: `Required sell amount must be >= contract minimum (${constants.minSellAmount.toString()})`,
        };
      }
    }

    if (task.task_type === "deploy_lock") {
      const deployValidation = validateDeployLockConfig(task.task_config);
      if (!deployValidation.success) {
        return {
          ok: false,
          error: `Task "${task.title || "Deploy Lock"}": ${deployValidation.error}`,
        };
      }
    }
  }

  return { ok: true };
}
