/**
 * POST /api/subscriptions/renew-with-xp
 * Execute XP-based renewal (deduct XP + extend key on-chain)
 *
 * ATOMIC FLOW:
 * 1. Validate user & request
 * 2. Create renewal_attempt record (recovery point)
 * 3. Deduct XP from user (RPC function - atomic)
 * 4. Extend key on-chain (using service wallet)
 * 5. Confirm new expiration
 * 6. On failure: Rollback XP (but keep treasury fee)
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { createWalletClientUnified } from "@/lib/blockchain/config/clients/wallet-client";
import {
  calculateXpRenewalCost,
  getServiceFeePercent,
  validateRenewalParams,
  calculateNewExpiration,
} from "@/lib/helpers/xp-renewal-helpers";
import { formatUnits, type Address } from "viem";
import {
  sendEmail,
  getRenewalEmail,
  sendEmailWithDedup,
  normalizeEmail,
} from "@/lib/email";

const log = getLogger("api:subscriptions:renew-with-xp");

interface RenewalRequest {
  duration: 30 | 90 | 365;
}

interface RenewalResponse {
  success: boolean;
  data?: {
    baseCostXp: number;
    serviceFeeXp: number;
    totalXpDeducted: number;
    newExpiration: string;
    transactionHash?: string;
    treasuryAfterFee: number;
  };
  error?: string;
  recovery?: {
    action: "RETRY" | "MANUAL_REVIEW";
    message?: string;
    renewalAttemptId?: string;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RenewalResponse>,
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  const body = req.body as RenewalRequest;
  const supabase = createAdminClient();

  let renewalAttemptId: string | null = null;

  try {
    // ========== PHASE 1: VALIDATION ==========
    log.info("Starting XP renewal request");

    const privyResult = await getPrivyUser(req, true);
    if (
      !privyResult ||
      !privyResult.id ||
      !("wallet" in privyResult) ||
      !privyResult.wallet?.address
    ) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }
    const privy = privyResult as any;

    // Validate duration
    if (![30, 90, 365].includes(body.duration)) {
      return res.status(400).json({
        success: false,
        error: "Invalid duration. Must be 30, 90, or 365",
      });
    }

    // Get user profile
    const { data: userProfile, error: userError } = await supabase
      .from("user_profiles")
      .select("id, experience_points, email")
      .eq("privy_user_id", privy.id)
      .single();

    if (userError || !userProfile) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const userProfileId = userProfile.id;
    const userXpBalance = userProfile.experience_points || 0;

    // Get lock address
    const lockAddress = (process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS ||
      process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS_TESTNET) as `0x${string}`;

    if (!lockAddress) {
      return res.status(500).json({
        success: false,
        error: "System configuration error",
      });
    }

    // Get service fee
    const serviceFeePct = await getServiceFeePercent(supabase);

    // Fetch key price
    const publicClient = createPublicClientUnified();
    const keyPrice = (await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: "keyPrice",
    })) as bigint;

    const keyPriceDg = parseInt(formatUnits(keyPrice, 18));

    // Calculate costs
    const costs = calculateXpRenewalCost(keyPriceDg, serviceFeePct);

    // Validate user can afford
    const validation = validateRenewalParams(
      userXpBalance,
      costs.total,
      body.duration,
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || "Renewal not possible",
      });
    }

    // Get user's current key
    let tokenId: bigint | null = null;
    try {
      const balance = await publicClient.readContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "balanceOf",
        args: [privy.wallet.address as Address],
      });

      if ((balance as bigint) > 0n) {
        const id = await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [privy.wallet.address as Address, 0n],
        });
        tokenId = id as bigint;
      }
    } catch (error) {
      log.error("Failed to get user token ID", { error });
      return res.status(400).json({
        success: false,
        error: "Failed to verify key ownership",
      });
    }

    if (!tokenId) {
      return res.status(400).json({
        success: false,
        error: "No active key found for renewal",
      });
    }

    // Get current expiration
    const currentExpiration = (await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: "keyExpirationTimestampFor",
      args: [tokenId],
    })) as bigint;

    const newExpiration = calculateNewExpiration(
      Number(currentExpiration),
      body.duration,
    );

    // ========== PHASE 2: CREATE TRACKING RECORD ==========
    log.info("Creating renewal attempt record", {
      userId: privy.id,
      duration: body.duration,
      costs,
    });

    const { data: attemptData, error: attemptError } = await supabase
      .from("subscription_renewal_attempts")
      .insert({
        user_id: privy.id,
        user_profile_id: userProfileId,
        lock_address: lockAddress,
        token_id: tokenId.toString(),
        renewal_method: "xp",
        amount_value: costs.baseCost,
        service_fee_amount: costs.fee,
        service_fee_percent: serviceFeePct,
        duration_days: body.duration,
        expected_new_expiration: new Date(newExpiration * 1000).toISOString(),
        status: "pending",
      })
      .select("id")
      .single();

    if (attemptError || !attemptData) {
      log.error("Failed to create renewal attempt", { attemptError });
      return res.status(500).json({
        success: false,
        error: "Failed to initialize renewal",
      });
    }

    renewalAttemptId = attemptData.id;

    // ========== PHASE 3: DEDUCT XP (ATOMIC RPC) ==========
    log.info("Calling deduct_xp_for_renewal RPC function", {
      renewalAttemptId,
      baseCost: costs.baseCost,
      serviceFee: costs.fee,
    });

    const { data: deductData, error: deductError } = await supabase.rpc(
      "deduct_xp_for_renewal",
      {
        p_user_id: privy.id,
        p_xp_amount: costs.baseCost,
        p_service_fee_xp: costs.fee,
        p_renewal_attempt_id: renewalAttemptId,
      },
    );

    if (deductError || !deductData || !deductData[0]?.success) {
      log.error("XP deduction failed", {
        renewalAttemptId,
        deductError,
        data: deductData,
      });

      return res.status(400).json({
        success: false,
        error:
          deductData?.[0]?.error_message || "Insufficient XP or system error",
        recovery: {
          action: "MANUAL_REVIEW",
          message: "XP deduction failed. Please contact support.",
          renewalAttemptId: renewalAttemptId!,
        },
      });
    }

    log.info("XP deducted successfully", {
      renewalAttemptId,
      newBalance: deductData[0].new_xp_balance,
    });

    // ========== PHASE 4: EXTEND KEY ON-CHAIN (GRANT KEY EXTENSION) ==========
    log.info("Extending key on-chain using admin wallet", {
      renewalAttemptId,
      tokenId: tokenId.toString(),
    });

    const walletClient = createWalletClientUnified();

    if (!walletClient) {
      log.error("Admin wallet not configured for key extension");
      await supabase.rpc("rollback_xp_renewal", {
        p_renewal_attempt_id: renewalAttemptId,
        p_reason: "admin_wallet_not_configured",
      });

      return res.status(500).json({
        success: false,
        error: "System configuration error",
        recovery: {
          action: "RETRY",
          message: "System error. Your XP has been restored. Please retry.",
          renewalAttemptId: renewalAttemptId!,
        },
      });
    }

    const adminAddress = walletClient.account?.address as Address | undefined;

    if (!adminAddress) {
      log.error("Admin wallet account missing");
      await supabase.rpc("rollback_xp_renewal", {
        p_renewal_attempt_id: renewalAttemptId,
        p_reason: "admin_wallet_account_missing",
      });

      return res.status(500).json({
        success: false,
        error: "System configuration error",
        recovery: {
          action: "RETRY",
          message: "System error. Your XP has been restored. Please retry.",
          renewalAttemptId: renewalAttemptId!,
        },
      });
    }

    let txHash: string | undefined;
    try {
      const isLockManager = (await publicClient.readContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "isLockManager",
        args: [adminAddress],
      })) as boolean;

      if (!isLockManager) {
        log.error("Admin wallet is not a lock manager for lock", {
          renewalAttemptId,
          lockAddress,
          adminAddress,
        });

        const { data: rollbackData, error: rollbackError } = await supabase.rpc(
          "rollback_xp_renewal",
          {
            p_renewal_attempt_id: renewalAttemptId,
            p_reason: "admin_wallet_not_lock_manager",
          },
        );

        if (rollbackError) {
          log.error("Rollback failed critically after lock manager check", {
            renewalAttemptId,
            rollbackError,
          });

          return res.status(500).json({
            success: false,
            error:
              "Key extension failed and rollback encountered issues. Please contact support.",
            recovery: {
              action: "MANUAL_REVIEW",
              message:
                "Critical error - please contact support with renewal attempt ID",
              renewalAttemptId: renewalAttemptId!,
            },
          });
        }

        log.info(
          "Rollback successful - XP and fee restored after lock manager check",
          {
            renewalAttemptId,
            restoredXp: rollbackData?.[0]?.restored_xp,
            restoredFee: rollbackData?.[0]?.restored_fee_xp,
          },
        );

        return res.status(500).json({
          success: false,
          error:
            "Renewal wallet is not authorized for this lock. Your XP has been restored.",
          recovery: {
            action: "MANUAL_REVIEW",
            message:
              "Configuration issue detected. Please contact support with your renewal attempt ID.",
            renewalAttemptId: renewalAttemptId!,
          },
        });
      }

      const expirationDuration = (await publicClient.readContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "expirationDuration",
      })) as bigint;

      const baseDurationSeconds =
        expirationDuration && expirationDuration > 0n
          ? expirationDuration
          : BigInt(30 * 24 * 60 * 60);

      let durationMultiplier: bigint;
      switch (body.duration) {
        case 30:
          durationMultiplier = 1n;
          break;
        case 90:
          durationMultiplier = 3n;
          break;
        case 365:
          durationMultiplier = 12n;
          break;
        default:
          durationMultiplier = 1n;
      }

      const durationInSeconds = baseDurationSeconds * durationMultiplier;

      txHash = await walletClient.writeContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "grantKeyExtension",
        args: [tokenId, durationInSeconds],
        account: walletClient.account!,
        chain: walletClient.chain,
      });

      log.info("grantKeyExtension transaction submitted", {
        renewalAttemptId,
        txHash,
      });

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      log.info("grantKeyExtension transaction confirmed", {
        renewalAttemptId,
        txHash,
      });
    } catch (extendError) {
      log.error("Grant key extension failed", {
        renewalAttemptId,
        extendError,
      });

      // Rollback BOTH XP AND FEE
      const { data: rollbackData, error: rollbackError } = await supabase.rpc(
        "rollback_xp_renewal",
        {
          p_renewal_attempt_id: renewalAttemptId,
          p_reason: "extend_failed",
        },
      );

      if (rollbackError) {
        log.error("Rollback failed critically", {
          renewalAttemptId,
          rollbackError,
        });

        // Even if rollback fails, inform user
        return res.status(500).json({
          success: false,
          error:
            "Key extension failed and rollback encountered issues. Please contact support.",
          recovery: {
            action: "MANUAL_REVIEW",
            message:
              "Critical error - please contact support with renewal attempt ID",
            renewalAttemptId: renewalAttemptId!,
          },
        });
      }

      log.info("Rollback successful - XP and fee restored", {
        renewalAttemptId,
        restoredXp: rollbackData?.[0]?.restored_xp,
        restoredFee: rollbackData?.[0]?.restored_fee_xp,
      });

      return res.status(500).json({
        success: false,
        error: "Failed to extend key on-chain",
        recovery: {
          action: "RETRY",
          message:
            "Key extension failed. Your XP and fee have been fully restored. Please retry.",
          renewalAttemptId: renewalAttemptId!,
        },
      });
    }

    // ========== PHASE 5: CONFIRM & UPDATE ==========
    log.info("Confirming renewal success", { renewalAttemptId });

    // Verify new expiration on-chain
    const verifiedExpiration = (await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: "keyExpirationTimestampFor",
      args: [tokenId],
    })) as bigint;

    // Update renewal attempt
    const { error: updateError } = await supabase
      .from("subscription_renewal_attempts")
      .update({
        status: "success",
        actual_new_expiration: new Date(
          Number(verifiedExpiration) * 1000,
        ).toISOString(),
        transaction_hash: txHash,
        completed_at: new Date().toISOString(),
      })
      .eq("id", renewalAttemptId);

    if (updateError) {
      log.error("Failed to update renewal attempt", { updateError });
    }

    // Update user_activation_grants
    const { error: grantError } = await supabase
      .from("user_activation_grants")
      .update({
        expires_at: new Date(Number(verifiedExpiration) * 1000).toISOString(),
        renewed_at: new Date().toISOString(),
        renewal_attempt_id: renewalAttemptId,
      })
      .eq("lock_address", lockAddress)
      .eq("user_id", privy.id);

    if (grantError) {
      log.warn("Failed to update activation grant", { grantError });
    }

    // Log activity
    await supabase.from("user_activities").insert({
      user_profile_id: userProfileId,
      activity_type: "xp_subscription_renewal",
      points_earned: 0,
      activity_data: {
        lock_address: lockAddress,
        token_id: tokenId.toString(),
        base_cost: costs.baseCost,
        service_fee: costs.fee,
        duration_days: body.duration,
        transaction_hash: txHash,
        renewal_attempt_id: renewalAttemptId,
      },
    });

    // Get treasury balance
    const { data: treasuryData } = await supabase
      .from("subscription_treasury")
      .select("xp_fees_accumulated")
      .single();

    const treasuryBalance = treasuryData?.xp_fees_accumulated || 0;

    log.info("XP renewal completed successfully", {
      renewalAttemptId,
      userId: privy.id,
      baseCost: costs.baseCost,
      serviceFee: costs.fee,
      newExpiration: Number(verifiedExpiration),
      treasuryBalance,
    });

    try {
      const userEmail = normalizeEmail(userProfile?.email);
      if (userEmail) {
        const tpl = getRenewalEmail({
          durationDays: body.duration,
          newExpiration: new Date(
            Number(verifiedExpiration) * 1000,
          ).toISOString(),
        });

        await sendEmailWithDedup(
          "subscription-renewal",
          renewalAttemptId!,
          userEmail as string,
          `renewal:${renewalAttemptId}`,
          () =>
            sendEmail({
              to: userEmail as string,
              ...tpl,
              tags: ["subscription-renewal", "xp"],
            }),
        );
      }
    } catch (emailErr) {
      log.error("Failed to send renewal email", { renewalAttemptId, emailErr });
    }

    return res.status(200).json({
      success: true,
      data: {
        baseCostXp: costs.baseCost,
        serviceFeeXp: costs.fee,
        totalXpDeducted: costs.total,
        newExpiration: new Date(
          Number(verifiedExpiration) * 1000,
        ).toISOString(),
        transactionHash: txHash,
        treasuryAfterFee: treasuryBalance,
      },
    });
  } catch (error: any) {
    log.error("Unexpected error in renewal endpoint", {
      error,
      renewalAttemptId,
    });

    // Try to rollback if we created a renewal attempt
    if (renewalAttemptId) {
      try {
        const { data: rollbackData, error: rollbackErr } = await supabase.rpc(
          "rollback_xp_renewal",
          {
            p_renewal_attempt_id: renewalAttemptId,
            p_reason: "unexpected_error",
          },
        );

        if (rollbackErr) {
          log.error("Rollback failed on unexpected error", {
            renewalAttemptId,
            rollbackErr,
          });
        } else {
          log.info("Rollback successful on unexpected error", {
            renewalAttemptId,
            restoredXp: rollbackData?.[0]?.restored_xp,
            restoredFee: rollbackData?.[0]?.restored_fee_xp,
          });
        }
      } catch (rollbackErr) {
        log.error("Exception during rollback on unexpected error", {
          rollbackErr,
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      recovery: renewalAttemptId
        ? {
            action: "RETRY",
            message:
              "An unexpected error occurred. Your XP and fee have been restored. Please retry.",
            renewalAttemptId,
          }
        : undefined,
    });
  }
}
