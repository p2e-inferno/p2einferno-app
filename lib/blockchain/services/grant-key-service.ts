import { type Address } from "viem";
import { LockManagerService } from "./lock-manager";
import { createPublicClientUnified } from "../config/clients/public-client";
import { createWalletClientUnified } from "../config/clients/wallet-client";
import { getLockManagerAddress } from "../legacy/server-config";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("blockchain:grant-key-service");

export interface GrantKeyOptions {
  walletAddress: string;
  lockAddress: Address;
  keyManagers: Address[];
  expirationDuration?: bigint;
  maxRetries?: number;
  retryDelay?: number;
}

export interface GrantKeyResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
  retryCount?: number;
}

/**
 * High-level service for granting keys with error handling and retry logic
 * NOTE: Write operations require LOCK_MANAGER_PRIVATE_KEY to be configured.
 * Currently, only read operations are fully supported.
 */
export class GrantKeyService {
  private readonly DEFAULT_MAX_RETRIES = 1;
  private readonly DEFAULT_RETRY_DELAY = 2000; // 2 seconds

  /**
   * Grant a key to a user wallet with automatic retry on failure
   * NOTE: This operation requires LOCK_MANAGER_PRIVATE_KEY to be configured.
   */
  async grantKeyToUser({
    walletAddress,
    lockAddress,
    keyManagers,
    expirationDuration,
    maxRetries = this.DEFAULT_MAX_RETRIES,
    retryDelay = this.DEFAULT_RETRY_DELAY,
  }: GrantKeyOptions): Promise<GrantKeyResponse> {
    // Validate wallet address
    if (!this.isValidAddress(walletAddress)) {
      return {
        success: false,
        error: "Invalid wallet address format",
      };
    }

    // Create clients using unified config
    const publicClient = createPublicClientUnified();
    const walletClient = createWalletClientUnified();
    const lockManager = new LockManagerService(publicClient, walletClient);

    // Check if user is a lock manager
    const adminAddress = getLockManagerAddress();
    const isLockManager = await lockManager.checkUserIsLockManager(
      adminAddress as Address,
      lockAddress,
    );
    if (!isLockManager) {
      return {
        success: false,
        error: "Admin address is not a manager of this lock",
      };
    }

    // Check if user already has a valid key (1 RPC call vs 3)
    const hasKey = await lockManager.hasValidKey(
      walletAddress as Address,
      lockAddress,
    );
    if (hasKey) {
      return {
        success: true,
        error: "User already has a valid key",
      };
    }

    let lastError: string = "";
    let retryCount = 0;

    // Attempt to grant key with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Attempt to grant key
        const result = await lockManager.grantKeys({
          recipientAddress: walletAddress as Address,
          lockAddress,
          keyManagers,
          expirationDuration,
        });

        // If operation failed because write operations are disabled
        if (result.error?.includes("LOCK_MANAGER_PRIVATE_KEY not configured")) {
          return {
            success: false,
            error:
              "Admin key granting is currently disabled. Contact the system administrator to enable this feature.",
            retryCount: attempt,
          };
        }

        if (result.success) {
          log.info(`Successfully granted key to ${walletAddress}`);
          return {
            success: true,
            transactionHash: result.transactionHash,
            retryCount: attempt,
          };
        }

        // Handle specific error cases
        if (result.error?.includes("already has a valid key")) {
          return {
            success: true,
            error: result.error,
            retryCount: attempt,
          };
        }

        lastError = result.error || "Unknown error";

        // Don't retry if it's a permanent error
        if (this.isPermanentError(lastError)) {
          break;
        }
      } catch (error: any) {
        lastError = error.message || "Transaction failed";
        log.error(`Attempt ${attempt + 1} failed:`, error);

        // Don't retry on certain errors
        if (this.isPermanentError(lastError)) {
          break;
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        retryCount = attempt + 1;
        log.info(
          `Retrying in ${
            retryDelay / 1000
          } seconds... (Attempt ${retryCount}/${maxRetries})`,
        );
        await this.delay(retryDelay);
      }
    }

    return {
      success: false,
      error: lastError || "Failed to grant key after all retries",
      retryCount,
    };
  }

  /**
   * Check if user already has a valid key
   * This is a read-only operation that works without a private key
   */
  async userHasValidKey(
    walletAddress: string,
    lockAddress: Address,
  ): Promise<boolean> {
    if (!this.isValidAddress(walletAddress)) {
      return false;
    }

    try {
      // Create public client using unified config
      const publicClient = createPublicClientUnified();
      const lockManager = new LockManagerService(publicClient);
      return await lockManager.hasValidKey(
        walletAddress as Address,
        lockAddress,
      );
    } catch (error) {
      log.error("Error checking user key:", error);
      return false;
    }
  }

  /**
   * Validate Ethereum address format
   */
  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Check if an error is permanent and shouldn't be retried
   */
  private isPermanentError(error: string): boolean {
    const permanentErrors = [
      "Invalid wallet address",
      "User already has a valid key",
      "Invalid private key",
      "Contract not found",
      "Function not found",
      "LOCK_MANAGER_PRIVATE_KEY not configured",
    ];

    return permanentErrors.some((permError) =>
      error.toLowerCase().includes(permError.toLowerCase()),
    );
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const grantKeyService = new GrantKeyService();
