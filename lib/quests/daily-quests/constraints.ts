import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";
import { checkQuestPrerequisites } from "@/lib/quests/prerequisite-checker";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import {
  createPublicClientUnified,
  createPublicClientForNetwork,
} from "@/lib/blockchain/config/clients/public-client";
import { resolveChain } from "@/lib/blockchain/config/core/chain-resolution";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { getStageLabel } from "@/lib/blockchain/shared/vendor-constants";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { parseUnits, isAddress } from "viem";

const log = getLogger("quests:daily:constraints");
const DEFAULT_ELIGIBILITY_CHAIN_ID = resolveChain().chain.id;

export type RequirementStatus = "met" | "unmet" | "error";

export type DailyQuestRequirement = {
  type:
  | "vendor_stage"
  | "gooddollar_verification"
  | "lock_key"
  | "erc20_balance";
  status: RequirementStatus;
  label: string;
  value?: string;
  requiredValue?: string;
  message?: string;
};

export type DailyQuestEligibility = {
  eligible: boolean;
  requirements: DailyQuestRequirement[];
  failures: Array<{
    type: DailyQuestRequirement["type"];
    message: string;
  }>;
  vendor_stage_current?: number;
  vendor_stage_required?: number;
};

type EligibilityConfig = {
  min_vendor_stage?: number;
  requires_gooddollar_verification?: boolean;
  required_lock_address?: string;
  required_erc20?: { token: string; min_balance: string; chain_id?: number };
};

export async function evaluateDailyQuestEligibility(
  supabase: SupabaseClient,
  userId: string,
  walletAddress: string | null,
  eligibilityConfig: EligibilityConfig,
): Promise<DailyQuestEligibility> {
  const requirements: DailyQuestRequirement[] = [];
  const failures: DailyQuestEligibility["failures"] = [];
  const result: DailyQuestEligibility = {
    eligible: true,
    requirements,
    failures,
  };

  const hasWallet = Boolean(walletAddress && walletAddress.trim());

  // 1. GoodDollar face verification
  if (eligibilityConfig.requires_gooddollar_verification) {
    const prereq = await checkQuestPrerequisites(supabase, userId, null, {
      prerequisite_quest_id: null,
      prerequisite_quest_lock_address: null,
      requires_prerequisite_key: false,
      requires_gooddollar_verification: true,
    });

    const isMet = prereq.canProceed;
    requirements.push({
      type: "gooddollar_verification",
      status: isMet ? "met" : "unmet",
      label: "Face Verification",
      message: isMet
        ? "Identity verified via GoodDollar"
        : "GoodDollar face verification required",
    });

    if (!isMet) {
      failures.push({
        type: "gooddollar_verification",
        message: "GoodDollar face verification required",
      });
    }
  }

  // 2. Lock key ownership
  if (
    eligibilityConfig.required_lock_address &&
    typeof eligibilityConfig.required_lock_address === "string" &&
    eligibilityConfig.required_lock_address.trim()
  ) {
    const lockAddr = eligibilityConfig.required_lock_address.trim();
    let isMet = false;
    let errorOccurred = false;

    try {
      const publicClient = createPublicClientUnified();
      const keyCheck = await checkUserKeyOwnership(
        publicClient,
        userId,
        lockAddr,
      );
      isMet = keyCheck.hasValidKey;
    } catch (error) {
      log.error("Lock key eligibility check failed", { userId, error });
      errorOccurred = true;
    }

    requirements.push({
      type: "lock_key",
      status: errorOccurred ? "error" : isMet ? "met" : "unmet",
      label: "Membership Key",
      message: errorOccurred
        ? "Unable to verify key ownership"
        : isMet
          ? "Valid membership key found"
          : "Required membership key not found",
    });

    if (!isMet || errorOccurred) {
      failures.push({
        type: "lock_key",
        message: errorOccurred
          ? "Key verification unavailable"
          : "Requires a key from a specific lock",
      });
    }
  }

  // 3. Vendor stage gating
  if (typeof eligibilityConfig.min_vendor_stage === "number") {
    const requiredStage = eligibilityConfig.min_vendor_stage;
    result.vendor_stage_required = requiredStage;

    if (!hasWallet) {
      requirements.push({
        type: "vendor_stage",
        status: "unmet",
        label: "Account Level",
        message: `Requires ${getStageLabel(requiredStage)} level (Current status unknown)`,
      });
    } else {
      const vendorAddress = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS;
      if (!vendorAddress || !isAddress(vendorAddress)) {
        requirements.push({
          type: "vendor_stage",
          status: "error",
          label: "Account Level",
          message: "Vendor check unavailable",
        });
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
            requirements.push({
              type: "vendor_stage",
              status: "error",
              label: "Account Level",
              message: "Unable to determine level",
            });
            failures.push({
              type: "vendor_stage",
              message: "Vendor level check unavailable",
            });
          } else {
            result.vendor_stage_current = stage;
            const isMet = stage >= requiredStage;
            requirements.push({
              type: "vendor_stage",
              status: isMet ? "met" : "unmet",
              label: "Account Level",
              value: getStageLabel(stage),
              requiredValue: getStageLabel(requiredStage),
              message: isMet
                ? `Level ${getStageLabel(stage)} verified`
                : `${getStageLabel(requiredStage)} level or higher needed (Current: ${getStageLabel(stage)})`,
            });

            if (!isMet) {
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
          requirements.push({
            type: "vendor_stage",
            status: "error",
            label: "Account Level",
            message: "Level verification failed",
          });
          failures.push({
            type: "vendor_stage",
            message: "Vendor level check unavailable",
          });
        }
      }
    }
  }

  // 4. ERC20 balance gating
  if (eligibilityConfig.required_erc20) {
    const token = eligibilityConfig.required_erc20.token;
    const minBalance = eligibilityConfig.required_erc20.min_balance;
    const chainId =
      eligibilityConfig.required_erc20.chain_id || DEFAULT_ELIGIBILITY_CHAIN_ID;

    if (!token || !minBalance || !isAddress(token)) {
      requirements.push({
        type: "erc20_balance",
        status: "error",
        label: "Token Balance",
        message: "Invalid balance configuration",
      });
      failures.push({
        type: "erc20_balance",
        message: "Insufficient token balance",
      });
    } else {
      try {
        const publicClient = createPublicClientForNetwork({ chainId });

        // Fetch token metadata for a better UI experience
        const [decimals, symbol] = await Promise.all([
          publicClient.readContract({
            address: token as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "decimals",
          }),
          publicClient.readContract({
            address: token as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "symbol",
          }).catch(() => "tokens"),
        ]);

        if (!hasWallet) {
          requirements.push({
            type: "erc20_balance",
            status: "unmet",
            label: "Token Balance",
            message: `Requires a minimum of ${minBalance} ${symbol} (Current status unknown)`,
          });
        } else {
          const minRaw = parseUnits(minBalance, Number(decimals));
          const balance = await publicClient.readContract({
            address: token as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [walletAddress as `0x${string}`],
          });

          const isMet = (balance as bigint) >= minRaw;
          requirements.push({
            type: "erc20_balance",
            status: isMet ? "met" : "unmet",
            label: "Token Balance",
            message: isMet
              ? `Minimum balance of ${minBalance} ${symbol} verified`
              : `Insufficient ${symbol} balance (Requires ${minBalance})`,
          });

          if (!isMet) {
            failures.push({
              type: "erc20_balance",
              message: `Insufficient ${symbol} balance`,
            });
          }
        }
      } catch (error) {
        log.error("ERC20 balance eligibility check failed", {
          userId,
          walletAddress,
          token,
          error,
        });
        requirements.push({
          type: "erc20_balance",
          status: "error",
          label: "Token Balance",
          message: "Balance verification failed",
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
