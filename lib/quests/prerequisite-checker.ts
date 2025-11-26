/**
 * Quest prerequisite validation helpers
 * Checks both DB completion status and on-chain key ownership
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";
import { checkKeyOwnership } from "@/lib/unlock/lockUtils";
import { getReadOnlyProvider } from "@/lib/blockchain/provider";
import { ethers } from "ethers";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";

const log = getLogger("lib:quests:prerequisite-checker");

export interface PrerequisiteCheckResult {
  canProceed: boolean;
  reason?: string;
  prerequisiteState?: "none" | "missing_completion" | "missing_key" | "ok";
}

export interface QuestPrerequisiteData {
  prerequisite_quest_id: string | null;
  prerequisite_quest_lock_address: string | null;
  requires_prerequisite_key: boolean;
}

/**
 * Check if a user meets the prerequisites for a quest
 * 
 * @param supabase - Supabase client for DB queries
 * @param userId - User's Privy ID
 * @param userWalletAddress - User's primary wallet address (for on-chain checks)
 * @param questPrereqs - Quest prerequisite configuration
 * @returns Result indicating if user can proceed and why
 */
export async function checkQuestPrerequisites(
  supabase: SupabaseClient,
  userId: string,
  userWalletAddress: string | null,
  questPrereqs: QuestPrerequisiteData,
): Promise<PrerequisiteCheckResult> {
  const {
    prerequisite_quest_id,
    prerequisite_quest_lock_address,
    requires_prerequisite_key,
  } = questPrereqs;

  // No prerequisites configured
  if (!prerequisite_quest_id && !prerequisite_quest_lock_address) {
    return {
      canProceed: true,
      prerequisiteState: "none",
    };
  }

  // Check DB completion if prerequisite quest ID is set
  if (prerequisite_quest_id) {
    const { data: prereqProgress, error } = await supabase
      .from("user_quest_progress")
      .select("is_completed")
      .eq("user_id", userId)
      .eq("quest_id", prerequisite_quest_id)
      .maybeSingle();

    if (error) {
      log.error("Error checking prerequisite quest completion", {
        error,
        userId,
        prerequisite_quest_id,
      });
      return {
        canProceed: false,
        reason: "Failed to verify prerequisite quest completion",
        prerequisiteState: "missing_completion",
      };
    }

    if (!prereqProgress || !prereqProgress.is_completed) {
      return {
        canProceed: false,
        reason: "You must complete the prerequisite quest first",
        prerequisiteState: "missing_completion",
      };
    }
  }

  // Check on-chain key ownership if required
  if (requires_prerequisite_key && prerequisite_quest_lock_address) {
    if (!userWalletAddress) {
      return {
        canProceed: false,
        reason: "Wallet address required to verify key ownership",
        prerequisiteState: "missing_key",
      };
    }

    try {
      const hasKey = await checkKeyOwnership(
        prerequisite_quest_lock_address,
        userWalletAddress,
      );

      if (!hasKey) {
        return {
          canProceed: false,
          reason:
            "You must hold a valid key for the prerequisite quest to proceed",
          prerequisiteState: "missing_key",
        };
      }
    } catch (error) {
      log.error("Error checking prerequisite key ownership", {
        error,
        userWalletAddress,
        prerequisite_quest_lock_address,
      });
      return {
        canProceed: false,
        reason: "Failed to verify key ownership",
        prerequisiteState: "missing_key",
      };
    }
  }

  // All checks passed
  return {
    canProceed: true,
    prerequisiteState: "ok",
  };
}

/**
 * Check if user has a valid key using ethers (for server-side use)
 * This is a simpler version for when we just need a boolean result
 */
export async function hasValidKeyEthers(
  lockAddress: string,
  userAddress: string,
): Promise<boolean> {
  try {
    if (!ethers.isAddress(lockAddress) || !ethers.isAddress(userAddress)) {
      return false;
    }

    const provider = getReadOnlyProvider();
    const lockContract = new ethers.Contract(
      lockAddress,
      COMPLETE_LOCK_ABI,
      provider,
    ) as any;

    const hasKey = await lockContract.getHasValidKey(userAddress);
    return Boolean(hasKey);
  } catch (error) {
    log.error("Error checking key ownership with ethers", {
      error,
      lockAddress,
      userAddress,
    });
    return false;
  }
}

/**
 * Get user's primary wallet address from their profile
 */
export async function getUserPrimaryWallet(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("wallet_address")
      .eq("privy_user_id", userId)
      .maybeSingle();

    if (error) {
      log.error("Error fetching user wallet address", { error, userId });
      return null;
    }

    return profile?.wallet_address || null;
  } catch (error) {
    log.error("Error in getUserPrimaryWallet", { error, userId });
    return null;
  }
}
