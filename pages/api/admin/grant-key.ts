import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { grantKeyService } from "@/lib/blockchain/services/grant-key-service";
import { isValidEthereumAddress } from "@/lib/blockchain/services/transaction-service";
import { isServerBlockchainConfigured } from "@/lib/blockchain/legacy/server-config";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:grant-key");

interface GrantKeyRequest {
  walletAddress: string;
  cohortId?: string;
  lockAddress?: string; // Either cohortId or lockAddress must be provided
}

interface GrantKeyResponse {
  success: boolean;
  message: string;
  transactionHash?: string;
  tokenIds?: string[];
  error?: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GrantKeyResponse>,
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

  const { walletAddress, cohortId, lockAddress }: GrantKeyRequest = req.body;

  // Validate required fields
  if (!walletAddress) {
    return res.status(400).json({
      success: false,
      message: "Invalid request",
      error: "walletAddress is required",
    });
  }

  if (!cohortId && !lockAddress) {
    return res.status(400).json({
      success: false,
      message: "Invalid request",
      error: "Either cohortId or lockAddress must be provided",
    });
  }

  // Validate wallet address format
  if (!isValidEthereumAddress(walletAddress)) {
    return res.status(400).json({
      success: false,
      message: "Invalid wallet address",
      error: "Invalid wallet address format",
    });
  }

  try {
    const supabase = createAdminClient();
    let targetLockAddress = lockAddress;

    // If cohortId provided, fetch the lock address from database
    if (cohortId && !lockAddress) {
      log.info(`Fetching lock address for cohort: ${cohortId}`);

      const { data: cohort, error: cohortError } = await supabase
        .from("cohorts")
        .select("lock_address, name")
        .eq("id", cohortId)
        .single();

      if (cohortError) {
        log.error("Error fetching cohort:", cohortError);
        return res.status(404).json({
          success: false,
          message: "Cohort not found",
          error: `Cohort not found: ${cohortId}`,
        });
      }

      if (!cohort.lock_address) {
        return res.status(400).json({
          success: false,
          message: "Lock not configured",
          error: `Cohort ${cohort.name} does not have a lock address configured`,
        });
      }

      targetLockAddress = cohort.lock_address;
      log.info(
        `Found lock address for cohort ${cohort.name}: ${targetLockAddress}`,
      );
    }

    // Validate lock address
    if (!targetLockAddress || !isValidEthereumAddress(targetLockAddress)) {
      return res.status(400).json({
        success: false,
        message: "Invalid lock address",
        error: "Invalid lock address",
      });
    }

    // Check if user already has a valid key
    log.info(
      `Checking if user ${walletAddress} already has key for lock ${targetLockAddress}`,
    );

    const hasValidKey = await grantKeyService.userHasValidKey(
      walletAddress,
      targetLockAddress as `0x${string}`,
    );

    if (hasValidKey) {
      log.info(`User ${walletAddress} already has a valid key`);
      return res.status(200).json({
        success: true,
        message: "User already has a valid key for this lock",
      });
    }

    // Grant key to user
    log.info(
      `Granting key to user ${walletAddress} for lock ${targetLockAddress}`,
    );

    const grantResult = await grantKeyService.grantKeyToUser({
      walletAddress,
      lockAddress: targetLockAddress as `0x${string}`,
      keyManagers: [], // Will use default key managers from lock
    });

    if (!grantResult.success) {
      log.error("Key granting failed:", grantResult.error);
      return res.status(500).json({
        success: false,
        error: grantResult.error || "Failed to grant key",
        message: "Key granting operation failed",
      });
    }

    log.info("Key granted successfully:", grantResult);

    return res.status(200).json({
      success: true,
      message: "Key granted successfully",
      transactionHash: grantResult.transactionHash,
    });
  } catch (error: any) {
    log.error("Grant key API error:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      message: "Failed to grant key due to server error",
    });
  }
}

// Wrap with admin authentication
export default withAdminAuth(handler);
