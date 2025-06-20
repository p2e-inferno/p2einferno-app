import { type Address } from "viem";
import { lockManagerService } from "./lock-manager";

export interface GrantKeyOptions {
  walletAddress: string;
  lockAddress: Address;
  keyManagers: Address[];
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
 */
export class GrantKeyService {
  private readonly DEFAULT_MAX_RETRIES = 1;
  private readonly DEFAULT_RETRY_DELAY = 2000; // 2 seconds

  /**
   * Grant a key to a user wallet with automatic retry on failure
   */
  async grantKeyToUser({
    walletAddress,
    lockAddress,
    keyManagers,
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

    let lastError: string = "";
    let retryCount = 0;

    // Attempt to grant key with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Attempt to grant key
        const result = await lockManagerService.grantKeys({
          recipientAddress: walletAddress as Address,
          lockAddress,
          keyManagers,
        });

        if (result.success) {
          console.log(`Successfully granted key to ${walletAddress}`);
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
        console.error(`Attempt ${attempt + 1} failed:`, error);

        // Don't retry on certain errors
        if (this.isPermanentError(lastError)) {
          break;
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < maxRetries) {
        retryCount = attempt + 1;
        console.log(
          `Retrying in ${
            retryDelay / 1000
          } seconds... (Attempt ${retryCount}/${maxRetries})`
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
   */
  async userHasValidKey(walletAddress: string): Promise<boolean> {
    if (!this.isValidAddress(walletAddress)) {
      return false;
    }

    try {
      const keyInfo = await lockManagerService.checkUserHasValidKey(
        walletAddress as Address
      );
      return keyInfo !== null && keyInfo.isValid;
    } catch (error) {
      console.error("Error checking user key:", error);
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
    ];

    return permanentErrors.some((permError) =>
      error.toLowerCase().includes(permError.toLowerCase())
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
