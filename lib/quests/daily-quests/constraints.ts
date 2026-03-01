import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";
import { checkQuestPrerequisites } from "@/lib/quests/prerequisite-checker";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { getStageLabel } from "@/lib/blockchain/shared/vendor-constants";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { parseUnits, isAddress } from "viem";

const log = getLogger("quests:daily:constraints");

export type DailyQuestEligibility = {
  eligible: boolean;
  failures: Array<{
    type:
      | "wallet_required"
      | "vendor_stage"
      | "gooddollar_verification"
      | "lock_key"
      | "erc20_balance";
    message: string;
  }>;
  vendor_stage_current?: number;
  vendor_stage_required?: number;
};

type EligibilityConfig = {
  min_vendor_stage?: number;
  requires_gooddollar_verification?: boolean;
  required_lock_address?: string;
  required_erc20?: { token: string; min_balance: string };
};

export async function evaluateDailyQuestEligibility(
  supabase: SupabaseClient,
  userId: string,
  walletAddress: string | null,
  eligibilityConfig: EligibilityConfig,
): Promise<DailyQuestEligibility> {
  const failures: DailyQuestEligibility["failures"] = [];
  const result: DailyQuestEligibility = { eligible: true, failures };

  // GoodDollar face verification (no wallet required)
  if (eligibilityConfig.requires_gooddollar_verification) {
    const prereq = await checkQuestPrerequisites(supabase, userId, null, {
      prerequisite_quest_id: null,
      prerequisite_quest_lock_address: null,
      requires_prerequisite_key: false,
      requires_gooddollar_verification: true,
    });
    if (!prereq.canProceed) {
      failures.push({
        type: "gooddollar_verification",
        message: "GoodDollar face verification required",
      });
    }
  }

  // Lock key ownership across linked wallets (no selected-wallet requirement)
  if (
    eligibilityConfig.required_lock_address &&
    typeof eligibilityConfig.required_lock_address === "string" &&
    eligibilityConfig.required_lock_address.trim()
  ) {
    try {
      const publicClient = createPublicClientUnified();
      const keyCheck = await checkUserKeyOwnership(
        publicClient,
        userId,
        eligibilityConfig.required_lock_address.trim(),
      );
      if (!keyCheck.hasValidKey) {
        failures.push({
          type: "lock_key",
          message: "Requires a key from a specific lock",
        });
      }
    } catch (error) {
      log.error("Lock key eligibility check failed", { userId, error });
      failures.push({
        type: "lock_key",
        message: "Requires a key from a specific lock",
      });
    }
  }

  const requiresWalletForEligibility =
    typeof eligibilityConfig.min_vendor_stage === "number" ||
    Boolean(eligibilityConfig.required_erc20);

  if (requiresWalletForEligibility && (!walletAddress || !walletAddress.trim())) {
    failures.push({
      type: "wallet_required",
      message: "Wallet is required to participate",
    });
    result.eligible = failures.length === 0;
    return result;
  }

  // Vendor stage gating
  if (typeof eligibilityConfig.min_vendor_stage === "number") {
    const requiredStage = eligibilityConfig.min_vendor_stage;
    result.vendor_stage_required = requiredStage;

    const vendorAddress = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS;
    if (!vendorAddress || !isAddress(vendorAddress)) {
      failures.push({
        type: "vendor_stage",
        message: "Vendor level check unavailable",
      });
    } else {
      try {
        const publicClient = createPublicClientUnified();
        const userState = await publicClient.readContract({
          address: vendorAddress as `0x${string}`,
          abi: DG_TOKEN_VENDOR_ABI,
          functionName: "getUserState",
          args: [walletAddress as `0x${string}`],
        });

        const stateObj =
          typeof userState === "object" && userState !== null
            ? (userState as Record<string, unknown>)
            : null;
        const stage =
          typeof stateObj?.stage === "number"
            ? stateObj.stage
            : Array.isArray(userState) && typeof userState[0] === "number"
              ? userState[0]
              : null;

        if (stage === null || !Number.isFinite(stage)) {
          failures.push({
            type: "vendor_stage",
            message: "Vendor level check unavailable",
          });
        } else {
          result.vendor_stage_current = stage;
          if (stage < requiredStage) {
            failures.push({
              type: "vendor_stage",
              message: `Requires ${getStageLabel(requiredStage)} level or higher`,
            });
          }
        }
      } catch (error) {
        log.error("Vendor stage eligibility check failed", {
          userId,
          walletAddress,
          requiredStage,
          error,
        });
        failures.push({
          type: "vendor_stage",
          message: "Vendor level check unavailable",
        });
      }
    }
  }

  // ERC20 balance gating
  if (eligibilityConfig.required_erc20) {
    const token = eligibilityConfig.required_erc20.token;
    const minBalance = eligibilityConfig.required_erc20.min_balance;

    if (!token || !minBalance || !isAddress(token)) {
      failures.push({
        type: "erc20_balance",
        message: "Insufficient token balance",
      });
    } else {
      try {
        const publicClient = createPublicClientUnified();
        const decimals = await publicClient.readContract({
          address: token as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "decimals",
        });

        const minRaw = parseUnits(minBalance, Number(decimals));
        const balance = await publicClient.readContract({
          address: token as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [walletAddress as `0x${string}`],
        });

        if ((balance as bigint) < minRaw) {
          failures.push({
            type: "erc20_balance",
            message: "Insufficient token balance",
          });
        }
      } catch (error) {
        log.error("ERC20 balance eligibility check failed", {
          userId,
          walletAddress,
          token,
          error,
        });
        failures.push({
          type: "erc20_balance",
          message: "Insufficient token balance",
        });
      }
    }
  }

  result.eligible = failures.length === 0;
  return result;
}
