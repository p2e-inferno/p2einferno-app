import { type Address, type PublicClient, type WalletClient } from "viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("blockchain:grant-key-service");

export interface GrantKeyResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
  retryCount?: number;
}

/**
 * Grant a key to a user wallet with automatic retry on failure.
 * Uses wallet client passed as parameter to avoid RPC hammering.
 *
 * @param walletClient - Wallet client for signing transactions
 * @param publicClient - Public client for reading transaction receipts
 * @param walletAddress - User's wallet address to grant key to
 * @param lockAddress - Lock contract address
 * @param keyManagers - Array of key manager addresses
 * @param expirationDuration - Key expiration duration in seconds (default: 1 year)
 * @param maxRetries - Maximum retry attempts (default: 1)
 * @param retryDelay - Delay between retries in ms (default: 2000)
 */
export async function grantKeyToUser(
  walletClient: WalletClient,
  publicClient: PublicClient,
  walletAddress: string,
  lockAddress: Address,
  keyManagers: Address[],
  expirationDuration: bigint = BigInt(365 * 24 * 60 * 60), // 1 year default
  maxRetries: number = 1,
  retryDelay: number = 2000,
): Promise<GrantKeyResponse> {
  // Validate wallet address
  if (!isValidAddress(walletAddress)) {
    return {
      success: false,
      error: "Invalid wallet address format",
    };
  }

  // Check if wallet client is available
  if (!walletClient || !walletClient.account) {
    return {
      success: false,
      error: "Wallet client not configured or account not available",
    };
  }

  let lastError: string = "";
  let retryCount = 0;

  // Attempt to grant key with retries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      log.info(`Granting key attempt ${attempt + 1}/${maxRetries + 1}`, {
        walletAddress,
        lockAddress,
        keyManagers: keyManagers.length,
      });

      // Calculate expiration timestamp (current time + duration)
      const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000)) + expirationDuration;

      // Execute the grant keys transaction
      const txHash = await walletClient.writeContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "grantKeys",
        args: [
          [walletAddress as Address], // recipients
          [expirationTimestamp], // expirationTimestamps
          keyManagers, // keyManagers
        ],
        account: walletClient.account,
        chain: walletClient.chain,
      });

      log.info(`Grant keys transaction sent`, { txHash, walletAddress });

      // Wait for confirmation (2 blocks)
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        log.info(`Successfully granted key to ${walletAddress}`, {
          txHash,
          blockNumber: receipt.blockNumber.toString(),
        });
        return {
          success: true,
          transactionHash: txHash,
          retryCount: attempt,
        };
      } else {
        lastError = "Transaction reverted on-chain";
        log.error(`Grant keys transaction reverted`, { txHash, receipt });
      }
    } catch (error: any) {
      lastError = error.message || "Transaction failed";
      log.error(`Grant key attempt ${attempt + 1} failed:`, {
        error: lastError,
        walletAddress,
        lockAddress,
      });

      // Don't retry on certain errors
      if (isPermanentError(lastError)) {
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
      await delay(retryDelay);
    }
  }

  return {
    success: false,
    error: lastError || "Failed to grant key after all retries",
    retryCount,
  };
}

/**
 * Check if user already has a valid key.
 * Uses public client passed as parameter to avoid RPC hammering.
 *
 * @param publicClient - Public client for read operations
 * @param walletAddress - User's wallet address to check
 * @param lockAddress - Lock contract address
 * @returns True if user has a valid key
 */
export async function hasValidKey(
  publicClient: PublicClient,
  walletAddress: Address,
  lockAddress: Address,
): Promise<boolean> {
  if (!isValidAddress(walletAddress)) {
    return false;
  }

  try {
    const hasKey = await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: "getHasValidKey",
      args: [walletAddress],
    });

    return Boolean(hasKey);
  } catch (error) {
    log.error("Error checking user key:", {
      error,
      walletAddress,
      lockAddress,
    });
    return false;
  }
}

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Check if an error is permanent and shouldn't be retried
 */
function isPermanentError(error: string): boolean {
  const permanentErrors = [
    "Invalid wallet address",
    "User already has a valid key",
    "Invalid private key",
    "Contract not found",
    "Function not found",
    "Wallet client not configured",
    "Account not available",
  ];

  return permanentErrors.some((permError) =>
    error.toLowerCase().includes(permError.toLowerCase()),
  );
}

/**
 * Delay helper for retries
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
