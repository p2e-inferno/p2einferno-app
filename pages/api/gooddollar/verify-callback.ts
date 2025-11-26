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
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const log = getLogger("api:gooddollar-verify-callback");

interface VerifyCallbackResponse {
  success: boolean;
  message: string;
  data?: {
    address: string;
    isWhitelisted: boolean;
    expiryTimestamp?: number;
  };
  error?: string;
}

/**
 * Handler for GoodDollar face verification callback
 *
 * CRITICAL SECURITY NOTES:
 * 1. Always verify on-chain whitelist status - never trust client callback alone
 * 2. Validate address matches connected wallet - prevent hijacking attempts
 * 3. Use service role for database updates - ensure proper authorization
 * 4. Store proof hash for audit trail
 *
 * Flow:
 * 1. Validate callback status and address format
 * 2. Verify user is authenticated
 * 3. Verify address matches connected wallet
 * 4. Check on-chain whitelist status
 * 5. Get expiry data
 * 6. Update database with verification status
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyCallbackResponse>,
) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed",
      error: "Only GET and POST are supported",
    });
  }

  try {
    // Extract callback parameters
    const params = req.method === "GET" ? req.query : req.body;
    const status = params.status as string;
    const address = params.address as string;

    log.info("Face verification callback received", { status, address });

    // ✅ VALIDATION 1: Check callback status
    if (status !== "success") {
      log.warn("Face verification failed at provider", { status, address });
      return res.status(200).json({
        success: false,
        message: "Face verification failed",
        error: `Verification status: ${status}`,
      });
    }

    // ✅ VALIDATION 2: Validate address format
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
      return res.status(400).json({
        success: false,
        message: "Invalid address format",
        error: "Address must be a valid Ethereum address",
      });
    }

    // ✅ VALIDATION 3: Verify user is authenticated
    const privyUser = await getPrivyUser(req, true);
    if (!privyUser) {
      log.warn("Unauthenticated callback attempt", {
        callbackAddress: normalizedAddress,
      });
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        error: "User must be authenticated to verify face",
      });
    }

    // ✅ VALIDATION 4: Verify address matches connected wallet
    const userWalletAddress =
      "wallet" in privyUser && privyUser.wallet?.address
        ? privyUser.wallet.address
        : "walletAddresses" in privyUser
          ? privyUser.walletAddresses?.[0]
          : undefined;

    if (
      !userWalletAddress ||
      userWalletAddress.toLowerCase() !== normalizedAddress
    ) {
      const userAddress = userWalletAddress || "none";
      log.error("Address mismatch - potential hijacking or session issue", {
        callbackAddress: normalizedAddress,
        userAddress,
        userId: privyUser.id,
      });
      return res.status(403).json({
        success: false,
        message: "Address mismatch",
        error:
          "The address in the callback does not match your connected wallet. This could indicate a security issue.",
      });
    }

    // ✅ VALIDATION 5: Verify on-chain whitelist status
    // This is the MOST IMPORTANT check - don't trust GoodDollar callback alone
    let isWhitelisted: boolean;
    let root: any;

    try {
      const result = await checkWhitelistStatus(normalizedAddress);
      isWhitelisted = result.isWhitelisted;
      root = result.root;
    } catch (error) {
      log.error("Failed to check on-chain whitelist status", {
        address: normalizedAddress,
        error,
      });
      return res.status(500).json({
        success: false,
        message: "Failed to verify on-chain status",
        error: "Could not verify whitelist status on blockchain",
      });
    }

    if (!isWhitelisted) {
      log.warn("Address not whitelisted on-chain after callback", {
        address: normalizedAddress,
      });
      return res.status(200).json({
        success: false,
        message: "Face verification not confirmed on-chain",
        error:
          "Verification failed on-chain validation. Address is not whitelisted.",
      });
    }

    // ✅ VALIDATION 6: Get expiry data for re-verification tracking
    let expiryTimestampMs: number | undefined;
    try {
      const expiryData = await getIdentityExpiry(normalizedAddress);
      // Calculate expiry from lastAuthenticated + authPeriod
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
      // Don't fail the whole callback - expiry is optional
    }

    // ✅ UPDATE DATABASE with verification status
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      log.error("Supabase credentials not configured");
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "Database credentials not configured",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate proof hash for audit trail
    const proofData = JSON.stringify({
      status,
      address: normalizedAddress,
      timestamp: new Date().toISOString(),
      rootHash: root
        ? crypto.createHash("sha256").update(JSON.stringify(root)).digest("hex")
        : null,
    });
    const proofHash = crypto
      .createHash("sha256")
      .update(proofData)
      .digest("hex");

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

    if (dbError) {
      log.error("Failed to update user face verification status", {
        address: normalizedAddress,
        error: dbError,
      });
      return res.status(500).json({
        success: false,
        message: "Failed to save verification status",
        error: "Could not update database",
      });
    }

    log.info("Face verification completed successfully", {
      address: normalizedAddress,
      expiryTimestampMs,
      proofHash,
    });

    return res.status(200).json({
      success: true,
      message: "Face verification completed successfully",
      data: {
        address: normalizedAddress,
        isWhitelisted: true,
        expiryTimestamp: expiryTimestampMs,
      },
    });
  } catch (error) {
    const gooddollarError = handleGoodDollarError(error);
    log.error("Unexpected error in verify callback", {
      code: gooddollarError.code,
      message: gooddollarError.message,
    });
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: "An unexpected error occurred",
    });
  }
}
