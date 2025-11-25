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
  extractUserWallet,
  isRetryableDbError,
  generateProofHash,
} from "@/lib/gooddollar/callback-handler";

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
    const address = params.address as string;

    log.info("Face verification callback received", { status, address });

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

    // Validate address exists
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
    const privyUser = await getPrivyUser(req, true);
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
    const userWalletAddress = extractUserWallet(privyUser);
    if (
      !userWalletAddress ||
      userWalletAddress.toLowerCase() !== normalizedAddress
    ) {
      log.error("Address mismatch - potential hijacking or session issue", {
        callbackAddress: normalizedAddress,
        userAddress: userWalletAddress || "none",
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

    // Update database
    const proofHash = generateProofHash(status, normalizedAddress, root);
    const updateUserVerification = async () => {
      const { error: dbError } = await supabase
        .from("user_profiles")
        .update({
          is_face_verified: true,
          face_verified_at: new Date().toISOString(),
          gooddollar_whitelist_checked_at: new Date().toISOString(),
          face_verification_expiry: expiryTimestampMs
            ? new Date(expiryTimestampMs).toISOString()
            : null,
          face_verification_proof_hash: proofHash,
        })
        .eq("wallet_address", normalizedAddress);
      if (dbError) throw dbError;
    };

    try {
      await retryWithDelay(updateUserVerification, 3, 400);
    } catch (dbError: any) {
      const retryable = isRetryableDbError(dbError);
      log.error("Failed to update user face verification status", {
        address: normalizedAddress,
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
