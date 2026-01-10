/**
 * POST /api/quests/get-trial
 *
 * Grants a DG Nation trial membership key to users who complete an activation quest.
 *
 * Security:
 * - Checks quest completion in DB
 * - Checks on-chain balances to prevent double-claiming (DG Nation lock + trial quest lock)
 * - Enforces one-time trial per user via DB unique constraint
 * - Uses service wallet to grant keys (not user's wallet)
 */

import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { isServerBlockchainConfigured } from "@/lib/blockchain/legacy/server-config";
import { isValidEthereumAddress } from "@/lib/blockchain/services/transaction-service";
import { grantKeyToUser } from "@/lib/blockchain/services/grant-key-service";
import { getKeyManagersForContext } from "@/lib/helpers/key-manager-utils";
import { getUserPrimaryWallet } from "@/lib/quests/prerequisite-checker";
import { ethers } from "ethers";
import { getReadOnlyProvider } from "@/lib/blockchain/provider";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { evaluateTrialEligibility } from "@/lib/quests/trial-eligibility";

const log = getLogger("api:quests:get-trial");

interface TrialClaimRequest {
  questId: string;
}

interface TrialClaimResponse {
  success: boolean;
  message: string;
  transactionHash?: string;
  expiresAt?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrialClaimResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
      error: "Method not allowed",
    });
  }

  // Check if server blockchain is properly configured
  if (!isServerBlockchainConfigured()) {
    return res.status(500).json({
      success: false,
      message: "Server configuration error",
      error:
        "Server blockchain configuration error - LOCK_MANAGER_PRIVATE_KEY not configured",
    });
  }

  const { questId }: TrialClaimRequest = req.body;

  if (!questId) {
    return res.status(400).json({
      success: false,
      message: "Invalid request",
      error: "questId is required",
    });
  }

  try {
    // Verify Privy user from token
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        error: "Unauthorized",
      });
    }
    const userId = authUser.id;

    const supabase = createAdminClient();

    // Get quest details
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select("*")
      .eq("id", questId)
      .single();

    if (questError || !quest) {
      log.error("Error fetching quest:", questError);
      return res.status(404).json({
        success: false,
        message: "Quest not found",
        error: "Quest not found",
      });
    }

    // Verify this is an activation quest
    if (quest.reward_type !== "activation") {
      return res.status(400).json({
        success: false,
        message: "Invalid quest type",
        error: "This quest is not an activation quest",
      });
    }

    if (quest.activation_type !== "dg_trial") {
      return res.status(400).json({
        success: false,
        message: "Invalid activation type",
        error: "This quest does not grant DG trials",
      });
    }

    // Parse activation config
    const activationConfig = quest.activation_config as {
      lockAddress?: string;
      trialDurationSeconds?: number;
      keyManager?: string;
    } | null;

    if (!activationConfig?.lockAddress) {
      log.error("Quest missing activation config", { questId });
      return res.status(500).json({
        success: false,
        message: "Configuration error",
        error: "Quest activation not properly configured",
      });
    }

    const dgNationLockAddress = activationConfig.lockAddress;
    const trialDurationSeconds =
      activationConfig.trialDurationSeconds || 7 * 24 * 60 * 60; // Default 7 days

    // Validate lock address
    if (!isValidEthereumAddress(dgNationLockAddress)) {
      log.error("Invalid DG Nation lock address", { dgNationLockAddress });
      return res.status(500).json({
        success: false,
        message: "Configuration error",
        error: "Invalid lock address configuration",
      });
    }

    // Check if user has completed the quest
    const { data: progress, error: progressError } = await supabase
      .from("user_quest_progress")
      .select("is_completed, reward_claimed")
      .eq("user_id", userId)
      .eq("quest_id", questId)
      .maybeSingle();

    if (progressError) {
      log.error("Error fetching quest progress:", progressError);
      return res.status(500).json({
        success: false,
        message: "Failed to verify quest completion",
        error: "Failed to verify quest completion",
      });
    }

    if (!progress || !progress.is_completed) {
      return res.status(400).json({
        success: false,
        message: "Quest not completed",
        error: "You must complete all quest tasks before claiming the trial",
      });
    }

    if (progress.reward_claimed) {
      return res.status(400).json({
        success: false,
        message: "Trial already claimed",
        error: "You have already claimed your DG Nation trial",
      });
    }

    // Get user's wallet address
    const userWalletAddress = await getUserPrimaryWallet(supabase, userId);
    if (!userWalletAddress || !isValidEthereumAddress(userWalletAddress)) {
      return res.status(400).json({
        success: false,
        message: "Wallet not found",
        error: "No valid wallet address found for your account",
      });
    }

    // ON-CHAIN CHECKS: Prevent double-claiming by checking balances
    // Check both DG Nation lock and trial quest lock (if configured)
    const provider = getReadOnlyProvider();
    const dgNationLock = new ethers.Contract(
      dgNationLockAddress,
      COMPLETE_LOCK_ABI,
      provider,
    ) as any;

    let hasDGNationKey = false;
    let hasTrialQuestKey = false;
    let onChainDGKeyBalance: bigint | null = null;
    let onChainTrialKeyBalance: bigint | null = null;

    try {
      // Check DG Nation lock balance
      const dgBalance = await dgNationLock.balanceOf(userWalletAddress);
      log.info("DG Nation balance check", {
        userWalletAddress,
        dgBalance: dgBalance.toString(),
      });
      hasDGNationKey = dgBalance > 0n;
      onChainDGKeyBalance = BigInt(dgBalance);

      // Check trial quest lock balance if configured
      let trialQuestBalance = BigInt(0);
      if (quest.lock_address && isValidEthereumAddress(quest.lock_address)) {
        const trialQuestLock = new ethers.Contract(
          quest.lock_address,
          COMPLETE_LOCK_ABI,
          provider,
        ) as any;
        trialQuestBalance = await trialQuestLock.balanceOf(userWalletAddress);
        log.info("Trial quest lock balance check", {
          userWalletAddress,
          trialQuestBalance: trialQuestBalance.toString(),
        });
        hasTrialQuestKey = trialQuestBalance > 0n;
        onChainTrialKeyBalance = trialQuestBalance;
      }
    } catch (balanceError) {
      log.error("Error checking on-chain balances:", balanceError);
      // Continue anyway - DB check will be the fallback
    }

    // DB CHECK (last line of defense): Check if user has already received this activation
    const { data: existingGrant, error: grantCheckError } = await supabase
      .from("user_activation_grants")
      .select("id")
      .eq("user_id", userId)
      .eq("activation_type", "dg_trial")
      .maybeSingle();

    if (grantCheckError) {
      log.error("Error checking existing activation grants:", grantCheckError);
      return res.status(500).json({
        success: false,
        message: "Failed to verify trial eligibility",
        error: "Failed to verify trial eligibility",
      });
    }

    const eligibility = evaluateTrialEligibility({
      hasExistingGrant: Boolean(existingGrant),
      hasDGNationKey,
      hasTrialQuestKey,
    });

    if (!eligibility.allowed) {
      if (eligibility.reason === "trial_already_used") {
        log.warn("User already has keys in both locks (trial already used)", {
          userId,
          userWalletAddress,
          dgBalance: onChainDGKeyBalance?.toString() ?? "0",
          trialQuestBalance: onChainTrialKeyBalance?.toString() ?? "0",
        });
      }
      return res.status(409).json({
        success: false,
        message: "Trial already used",
        error:
          "You have already received a DG Nation trial. This is a one-time offer.",
      });
    }

    // All checks passed - grant the trial key
    log.info("Granting DG Nation trial key", {
      userId,
      userWalletAddress,
      dgNationLockAddress,
      trialDurationSeconds,
    });

    // Create wallet client for key granting (uses service wallet)
    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      return res.status(500).json({
        success: false,
        message: "Server wallet not configured",
        error: "Server wallet not configured",
      });
    }

    const publicClient = createPublicClientUnified();

    // Calculate expiration timestamp
    const expirationTimestamp =
      BigInt(Math.floor(Date.now() / 1000)) + BigInt(trialDurationSeconds);

    // Grant key with custom expiration
    const grantResult = await grantKeyToUser(
      walletClient,
      publicClient,
      userWalletAddress,
      dgNationLockAddress as `0x${string}`,
      getKeyManagersForContext(
        userWalletAddress as `0x${string}`,
        "admin_grant",
      ),
      BigInt(trialDurationSeconds), // Pass duration for expiration
    );

    if (!grantResult.success) {
      log.error("Key granting failed:", grantResult.error);
      return res.status(500).json({
        success: false,
        message: "Failed to grant trial key",
        error: grantResult.error || "Failed to grant trial key",
      });
    }

    // Record the activation grant in DB
    const expiresAt = new Date(
      Number(expirationTimestamp) * 1000,
    ).toISOString();
    const { error: insertError } = await supabase
      .from("user_activation_grants")
      .insert({
        user_id: userId,
        activation_type: "dg_trial",
        lock_address: dgNationLockAddress,
        metadata: {
          transactionHash: grantResult.transactionHash,
          trialDurationSeconds,
        },
        granted_at: new Date().toISOString(),
        expires_at: expiresAt,
        quest_id: questId,
      });

    if (insertError) {
      // Check if it's a unique constraint violation
      if (insertError.code === "23505") {
        // PostgreSQL unique violation
        log.warn("Unique constraint violation - trial already granted", {
          userId,
          error: insertError,
        });
        return res.status(409).json({
          success: false,
          message: "Trial already used",
          error:
            "You have already received a DG Nation trial. This is a one-time offer.",
        });
      }

      log.error("Error recording activation grant:", insertError);
      // Don't fail the whole operation - the key was granted successfully
    }

    // Mark quest rewards as claimed
    const { error: updateError } = await supabase
      .from("user_quest_progress")
      .update({
        reward_claimed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("quest_id", questId);

    if (updateError) {
      log.error("Error updating quest progress:", updateError);
      // Don't fail - the key was granted successfully
    }

    log.info("DG Nation trial granted successfully", {
      userId,
      userWalletAddress,
      transactionHash: grantResult.transactionHash,
      expiresAt,
    });

    return res.status(200).json({
      success: true,
      message: `DG Nation trial granted! Your trial expires in ${Math.floor(trialDurationSeconds / 86400)} days.`,
      transactionHash: grantResult.transactionHash,
      expiresAt,
    });
  } catch (error) {
    log.error("Error in get-trial API:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: "Internal server error",
    });
  }
}
