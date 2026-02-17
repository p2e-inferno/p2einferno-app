/**
 * Quest prerequisite validation helpers
 * Checks both DB completion status and on-chain key ownership
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { getReadOnlyProvider } from "@/lib/blockchain/provider";
import { ethers } from "ethers";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";

const log = getLogger("lib:quests:prerequisite-checker");

export type PrerequisiteState =
  | "none"
  | "missing_completion"
  | "missing_key"
  | "missing_verification"
  | "ok";

export interface PrerequisiteCheckResult {
  canProceed: boolean;
  reason?: string;
  prerequisiteState?: PrerequisiteState;
}

export interface QuestPrerequisiteData {
  prerequisite_quest_id: string | null;
  prerequisite_quest_lock_address: string | null;
  requires_prerequisite_key: boolean;
  requires_gooddollar_verification?: boolean;
  /** Pre-fetched face verification status to avoid redundant DB queries in list endpoints. */
  userFaceVerified?: boolean | null;
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
  _userWalletAddress: string | null,
  questPrereqs: QuestPrerequisiteData,
): Promise<PrerequisiteCheckResult> {
  const {
    prerequisite_quest_id,
    prerequisite_quest_lock_address,
    requires_prerequisite_key,
    requires_gooddollar_verification,
  } = questPrereqs;

  // No prerequisites or verification configured
  if (
    !prerequisite_quest_id &&
    !prerequisite_quest_lock_address &&
    !requires_gooddollar_verification
  ) {
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

  // Check on-chain key ownership across all linked wallets if required
  if (requires_prerequisite_key && prerequisite_quest_lock_address) {
    try {
      const publicClient = createPublicClientUnified();
      const keyCheck = await checkUserKeyOwnership(
        publicClient,
        userId,
        prerequisite_quest_lock_address,
      );

      if (!keyCheck.hasValidKey) {
        log.info("Prerequisite key not found across linked wallets", {
          userId,
          checkedAddresses: keyCheck.checkedAddresses,
          prerequisite_quest_lock_address,
          errors: keyCheck.errors,
        });
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
        userId,
        prerequisite_quest_lock_address,
      });
      return {
        canProceed: false,
        reason: "Failed to verify key ownership",
        prerequisiteState: "missing_key",
      };
    }
  }

  // Check GoodDollar face verification if required
  if (requires_gooddollar_verification) {
    // Use pre-fetched status if provided (avoids N+1 queries in list endpoints)
    if (questPrereqs.userFaceVerified != null) {
      if (!questPrereqs.userFaceVerified) {
        return {
          canProceed: false,
          reason: "GoodDollar face verification is required for this quest.",
          prerequisiteState: "missing_verification",
        };
      }
    } else {
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("is_face_verified, face_verification_expiry")
        .eq("privy_user_id", userId)
        .maybeSingle();

      if (profileError) {
        log.error("Error checking user face verification status", {
          error: profileError,
          userId,
        });
        return {
          canProceed: false,
          reason: "Failed to verify face verification status",
          prerequisiteState: "missing_verification",
        };
      }

      const now = new Date();
      const isExpired =
        profile?.face_verification_expiry &&
        new Date(profile.face_verification_expiry) < now;

      if (!profile?.is_face_verified || isExpired) {
        return {
          canProceed: false,
          reason: isExpired
            ? "Your face verification has expired. Please re-verify."
            : "GoodDollar face verification is required for this quest.",
          prerequisiteState: "missing_verification",
        };
      }
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
