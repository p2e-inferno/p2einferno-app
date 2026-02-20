import type { NextApiRequest, NextApiResponse } from "next";
import { getLogger } from "@/lib/utils/logger";
import {
  checkWhitelistStatus,
  getIdentityExpiry,
} from "@/lib/gooddollar/identity-sdk";
import {
  GoodDollarError,
  handleGoodDollarError,
  validateAndNormalizeAddress,
} from "@/lib/gooddollar/error-handler";
import { getPrivyUser } from "@/lib/auth/privy";
import { createAdminClient } from "@/lib/supabase/server";
import {
  VerifyCallbackResponse,
  sendResponse,
  retryWithDelay,
  extractStatus,
  getPrivyUserWallets,
  isRetryableDbError,
  generateProofHash,
} from "@/lib/gooddollar/callback-handler";
import {
  claimOrValidateVerifiedWalletOwnership,
  GOODDOLLAR_OWNERSHIP_CONFLICT_CODE,
  GOODDOLLAR_USER_WALLET_LOCKED_CODE,
} from "@/lib/gooddollar/verification-ownership";

const log = getLogger("api:gooddollar-verify-callback");

/**
 * Handler for GoodDollar face verification callback
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyCallbackResponse>,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return sendResponse(
      res,
      405,
      false,
      "Method not allowed",
      "Only GET and POST are supported",
    );
  }

  try {
    const params = req.method === "GET" ? req.query : req.body;
    const status = extractStatus(params);
    const addressParam =
      (params.wallet as string) || (params.address as string);
    const address = addressParam as string | undefined;
    let privyUser: any = null;

    log.info("Face verification callback received", { status, address });

    // Reconcile stale DB state when user is no longer verified on-chain.
    if (status === "reconcile_unverified") {
      privyUser = await getPrivyUser(req, true);
      if (!privyUser) {
        return sendResponse(
          res,
          401,
          false,
          "Not authenticated",
          "User must be authenticated to reconcile verification status",
        );
      }

      const userWallets = getPrivyUserWallets(privyUser);

      // If user still has any whitelisted linked wallet, keep verified state.
      let hasWhitelistedWallet = false;
      let chainCheckSucceeded = false;
      for (const wallet of userWallets) {
        try {
          const normalized = validateAndNormalizeAddress(wallet);
          const result = await retryWithDelay(
            () => checkWhitelistStatus(normalized),
            2,
            250,
          );
          chainCheckSucceeded = true;
          if (result.isWhitelisted) {
            hasWhitelistedWallet = true;
            break;
          }
        } catch (error) {
          log.warn("Failed wallet check during unverified reconciliation", {
            userId: privyUser.id,
            wallet,
            error,
          });
        }
      }

      // Safety guard: do not clear verified status when we couldn't
      // complete any on-chain check (e.g. transient RPC/identity failures).
      if (!chainCheckSucceeded) {
        log.warn(
          "Skipping unverified reconciliation: no successful chain checks",
          {
            userId: privyUser.id,
            walletCount: userWallets.length,
          },
        );
        return sendResponse(
          res,
          200,
          false,
          "Skipped reconciliation because no on-chain checks succeeded",
        );
      }

      if (hasWhitelistedWallet) {
        return sendResponse(
          res,
          200,
          true,
          "User still has a verified wallet; no reconciliation needed",
        );
      }

      let supabase;
      try {
        supabase = createAdminClient();
      } catch (error) {
        log.error("Supabase credentials not configured", { error });
        return sendResponse(
          res,
          500,
          false,
          "Internal server error",
          "Database credentials not configured",
        );
      }

      const { data: updatedRows, error: clearError } = await supabase
        .from("user_profiles")
        .update({
          is_face_verified: false,
          face_verification_expiry: null,
          gooddollar_whitelist_checked_at: new Date().toISOString(),
        })
        .eq("privy_user_id", privyUser.id)
        .select("id");

      if (clearError) {
        return sendResponse(
          res,
          500,
          false,
          "Failed to reconcile verification status",
          "Could not update database",
        );
      }

      if (!updatedRows || updatedRows.length === 0) {
        log.warn("Unverified reconciliation matched 0 rows", {
          userId: privyUser.id,
        });
      }

      return sendResponse(res, 200, true, "Verification status reconciled");
    }

    // Validate status
    if (status !== "success") {
      log.warn("Face verification failed at provider", { status, address });
      log.warn("Face verification provider failure payload", {
        payload: params,
      });
      return sendResponse(
        res,
        200,
        false,
        "Face verification failed",
        `Verification status: ${status}`,
      );
    }

    // Validate address exists (require caller-provided wallet)
    if (!address) {
      log.warn("Callback missing address on success", { params });
      return sendResponse(
        res,
        200,
        false,
        "Face verification failed",
        "Missing wallet address in verification callback",
      );
    }

    // Validate and normalize address
    let normalizedAddress: `0x${string}`;
    try {
      normalizedAddress = validateAndNormalizeAddress(address);
    } catch (error) {
      if (error instanceof GoodDollarError) {
        log.error("Invalid address format in callback", {
          code: error.code,
          details: error.details,
        });
      } else {
        log.error("Address validation failed", { error });
      }
      return sendResponse(
        res,
        400,
        false,
        "Invalid address format",
        "Address must be a valid Ethereum address",
      );
    }

    // Verify authentication
    if (!privyUser) {
      privyUser = await getPrivyUser(req, true);
    }
    if (!privyUser) {
      log.warn("Unauthenticated callback attempt", {
        callbackAddress: normalizedAddress,
      });
      return sendResponse(
        res,
        401,
        false,
        "Not authenticated",
        "User must be authenticated to verify face",
      );
    }

    // Verify address matches
    const userWallets = getPrivyUserWallets(privyUser);

    const ownsAddress = userWallets.some(
      (w) => w && w.toLowerCase() === normalizedAddress,
    );

    if (!ownsAddress) {
      log.error("Address mismatch - potential hijacking or session issue", {
        callbackAddress: normalizedAddress,
        userAddress: userWallets[0] || "none",
        userId: privyUser.id,
      });
      return sendResponse(
        res,
        403,
        false,
        "Address mismatch",
        "The address in the callback does not match your connected wallet. This could indicate a security issue.",
      );
    }

    // Check on-chain whitelist status
    let isWhitelisted: boolean;
    let root: any;
    try {
      const result = await retryWithDelay(
        () => checkWhitelistStatus(normalizedAddress),
        3,
        400,
      );
      isWhitelisted = result.isWhitelisted;
      root = result.root;
    } catch (error) {
      log.error("Failed to check on-chain whitelist status", {
        address: normalizedAddress,
        error,
      });
      return sendResponse(
        res,
        500,
        false,
        "Failed to verify on-chain status",
        "Could not verify whitelist status on blockchain",
      );
    }

    if (!isWhitelisted) {
      log.warn("Address not whitelisted on-chain after callback", {
        address: normalizedAddress,
      });
      return sendResponse(
        res,
        200,
        false,
        "Face verification not confirmed on-chain",
        "Verification failed on-chain validation. Address is not whitelisted.",
      );
    }

    // Get expiry data (optional)
    let expiryTimestampMs: number | undefined;
    try {
      const expiryData = await getIdentityExpiry(normalizedAddress);
      expiryTimestampMs =
        Number(expiryData.lastAuthenticated) * 1000 +
        Number(expiryData.authPeriod) * 24 * 60 * 60 * 1000;
      log.info("Identity expiry data retrieved", {
        address: normalizedAddress,
        lastAuthenticated: expiryData.lastAuthenticated.toString(),
        authPeriod: expiryData.authPeriod.toString(),
        expiryTimestampMs,
      });
    } catch (error) {
      log.warn("Failed to get expiry data, continuing without it", {
        address: normalizedAddress,
        error,
      });
    }

    // Initialize database client
    let supabase;
    try {
      supabase = createAdminClient();
    } catch (error) {
      log.error("Supabase credentials not configured", { error });
      return sendResponse(
        res,
        500,
        false,
        "Internal server error",
        "Database credentials not configured",
      );
    }

    const proofHash = generateProofHash(status, normalizedAddress, root);
    const ownershipCheck = await claimOrValidateVerifiedWalletOwnership({
      supabase,
      walletAddress: normalizedAddress,
      privyUserId: privyUser.id,
      proofHash,
      source: "callback",
    });

    if (!ownershipCheck.ok) {
      const code =
        ownershipCheck.code === GOODDOLLAR_OWNERSHIP_CONFLICT_CODE
          ? GOODDOLLAR_OWNERSHIP_CONFLICT_CODE
          : GOODDOLLAR_USER_WALLET_LOCKED_CODE;
      return sendResponse(
        res,
        200,
        false,
        ownershipCheck.message,
        undefined,
        undefined,
        code,
      );
    }

    // Persist verification state by canonical user identity (privy_user_id)
    // and self-heal by creating a profile row when missing.
    const verificationPatch = {
      is_face_verified: true,
      face_verified_at: new Date().toISOString(),
      gooddollar_whitelist_checked_at: new Date().toISOString(),
      face_verification_expiry: expiryTimestampMs
        ? new Date(expiryTimestampMs).toISOString()
        : null,
      face_verification_proof_hash: proofHash,
      linked_wallets: userWallets,
    };

    try {
      const upsertVerificationState = async () => {
        const { data: existingProfile, error: profileReadError } =
          await supabase
            .from("user_profiles")
            .select("id")
            .eq("privy_user_id", privyUser.id)
            .maybeSingle();

        if (profileReadError) throw profileReadError;

        if (existingProfile?.id) {
          const { error: updateError } = await supabase
            .from("user_profiles")
            .update(verificationPatch)
            .eq("id", existingProfile.id);
          if (updateError) throw updateError;
          return;
        }

        const { error: insertError } = await supabase
          .from("user_profiles")
          .insert({
            privy_user_id: privyUser.id,
            ...verificationPatch,
          });

        if (insertError) throw insertError;
      };

      await retryWithDelay(upsertVerificationState, 3, 400);

      // Best-effort wallet sync: do not fail verification if wallet_address cannot be written
      const { error: walletSyncError } = await supabase
        .from("user_profiles")
        .update({ wallet_address: normalizedAddress })
        .eq("privy_user_id", privyUser.id);

      if (walletSyncError) {
        log.warn("Best-effort wallet sync failed after verification", {
          address: normalizedAddress,
          userId: privyUser.id,
          error: walletSyncError,
        });
      }
    } catch (dbError: any) {
      const retryable = isRetryableDbError(dbError);
      log.error("Failed to update user face verification status", {
        address: normalizedAddress,
        userId: privyUser.id,
        error: dbError,
        retryable,
      });
      return sendResponse(
        res,
        500,
        false,
        "Verification confirmed on-chain, but we could not save it. Please retry shortly.",
        "Could not update database",
      );
    }

    log.info("Face verification completed successfully", {
      address: normalizedAddress,
      expiryTimestampMs,
      proofHash,
    });

    return sendResponse(
      res,
      200,
      true,
      "Face verification completed successfully",
      undefined,
      {
        address: normalizedAddress,
        isWhitelisted: true,
        expiryTimestamp: expiryTimestampMs,
      },
    );
  } catch (error) {
    const gooddollarError = handleGoodDollarError(error);
    log.error("Unexpected error in verify callback", {
      code: gooddollarError.code,
      message: gooddollarError.message,
    });
    return sendResponse(
      res,
      500,
      false,
      "Internal server error",
      "An unexpected error occurred",
    );
  }
}
