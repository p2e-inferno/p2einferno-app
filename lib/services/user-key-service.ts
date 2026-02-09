import { Address, PublicClient, WalletClient } from "viem";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import { getKeyManagersForContext } from "@/lib/helpers/key-manager-utils";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("services:user-key-service");

export interface UserKeyCheckResult {
  hasValidKey: boolean;
  validAddress?: string;
  checkedAddresses: string[];
  errors: Array<{ address: string; error: string }>;
  keyInfo?: {
    tokenId: bigint;
    owner: Address;
    expirationTimestamp: bigint;
    isValid: boolean;
  } | null;
}

export interface UserKeyGrantResult {
  success: boolean;
  transactionHash: string | null;
  error?: string;
  retryCount?: number;
}

/**
 * Check if a user has a valid key for a specific lock across all their linked wallets.
 * Uses fresh public client per call to avoid RPC hammering.
 * Fetches detailed key info including tokenId and expiration timestamp.
 *
 * @param publicClient - Public client for blockchain read operations
 * @param userId - The user's Privy DID
 * @param lockAddress - The contract address of the Unlock lock
 * @returns A result object indicating if a key was found, on which address, and any errors
 */
export async function checkUserKeyOwnership(
  publicClient: PublicClient,
  userId: string,
  lockAddress: string,
): Promise<UserKeyCheckResult> {
  const walletAddresses = await getUserWalletAddresses(userId);
  if (walletAddresses.length === 0) {
    return { hasValidKey: false, checkedAddresses: [], errors: [] };
  }

  const keyCheckPromises = walletAddresses.map(async (address) => {
    try {
      // Direct contract call using passed-in client
      const hasValidKey = await publicClient.readContract({
        address: lockAddress as Address,
        abi: COMPLETE_LOCK_ABI,
        functionName: "getHasValidKey",
        args: [address as Address],
      });

      if (!hasValidKey) {
        return { address, keyInfo: null, error: null };
      }

      // Get additional key details if valid
      try {
        const tokenId = await publicClient.readContract({
          address: lockAddress as Address,
          abi: COMPLETE_LOCK_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [address as Address, 0n],
        });

        const expirationTimestamp = await publicClient.readContract({
          address: lockAddress as Address,
          abi: COMPLETE_LOCK_ABI,
          functionName: "keyExpirationTimestampFor",
          args: [tokenId as bigint],
        });

        return {
          address,
          keyInfo: {
            tokenId: tokenId as bigint,
            owner: address as Address,
            expirationTimestamp: expirationTimestamp as bigint,
            isValid: true,
          },
          error: null,
        };
      } catch (detailError) {
        // Fallback: key is valid but couldn't get details
        return {
          address,
          keyInfo: {
            tokenId: 0n,
            owner: address as Address,
            expirationTimestamp: 0n,
            isValid: true,
          },
          error: null,
        };
      }
    } catch (error) {
      return {
        address,
        keyInfo: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  const results = await Promise.all(keyCheckPromises);

  let validAddress: string | undefined;
  let keyInfo: UserKeyCheckResult["keyInfo"] = null;
  const errors: Array<{ address: string; error: string }> = [];

  for (const result of results) {
    if (result.error) {
      errors.push({ address: result.address, error: result.error });
    } else if (result.keyInfo?.isValid && !validAddress) {
      validAddress = result.address;
      keyInfo = result.keyInfo;
    }
  }

  return {
    hasValidKey: !!validAddress,
    validAddress,
    checkedAddresses: walletAddresses,
    errors,
    keyInfo,
  };
}

/**
 * Grant a key to a user's primary wallet using the server-side admin wallet.
 * Single responsibility: just grant the key, no pre-checking.
 * Uses wallet client passed as parameter to avoid RPC hammering.
 *
 * @param walletClient - Wallet client for signing transactions
 * @param publicClient - Public client for reading transaction receipts
 * @param userId - The user's Privy DID
 * @param lockAddress - The contract address of the Unlock lock to grant a key for
 * @returns The result of the key granting transaction
 */
export async function grantKeyToUser(
  walletClient: WalletClient,
  publicClient: PublicClient,
  userId: string,
  lockAddress: string,
): Promise<UserKeyGrantResult> {
  const walletAddresses = await getUserWalletAddresses(userId);
  if (!walletAddresses.length) {
    throw new Error("User has no wallet address to grant the key to.");
  }

  const targetWallet = walletAddresses[0]!;

  try {
    // Check if admin is lock manager using wallet client
    const adminAddress = walletClient.account?.address;
    if (!adminAddress) {
      return {
        success: false,
        transactionHash: null,
        error: "Admin wallet not configured",
      };
    }

    // Validate that the lock address is a contract on the target network
    const bytecode = await publicClient.getBytecode({
      address: lockAddress as Address,
    });

    if (!bytecode || bytecode === "0x") {
      const networkName = walletClient.chain?.name || "current network";
      const errorMsg = `No contract exists at ${lockAddress} on ${networkName}. This address may be from a different network.`;
      log.error("Lock address validation failed", {
        lockAddress,
        networkName,
        chainId: walletClient.chain?.id,
        userId,
      });
      return {
        success: false,
        transactionHash: null,
        error: errorMsg,
      };
    }

    log.debug("Lock contract validation passed", {
      lockAddress,
      networkName: walletClient.chain?.name,
      chainId: walletClient.chain?.id,
    });

    // Grant the key using wallet client
    const keyManagers = getKeyManagersForContext(
      targetWallet as Address,
      "milestone",
    );

    // Calculate expiration timestamp (current time + 1 year)
    const expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60);

    const txHash = await walletClient.writeContract({
      address: lockAddress as Address,
      abi: COMPLETE_LOCK_ABI,
      functionName: "grantKeys",
      args: [
        [targetWallet as Address], // recipients
        [expirationTimestamp], // expirationTimestamps
        keyManagers, // keyManagers
      ],
      account: walletClient.account!,
      chain: walletClient.chain,
    });

    // Wait for confirmation using public client
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2,
    });

    if (receipt.status === "success") {
      log.info(`Successfully granted key to ${targetWallet}`, {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
      });
      return {
        success: true,
        transactionHash: txHash,
      };
    } else {
      return {
        success: false,
        transactionHash: txHash,
        error: "Transaction reverted on-chain",
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error("Failed to grant key", {
      error: errorMessage,
      userId,
      lockAddress,
      targetWallet,
    });
    return {
      success: false,
      transactionHash: null,
      error: errorMessage,
    };
  }
}

/**
 * Simple key check function for single wallet.
 * Client passed in as parameter following API endpoint pattern.
 *
 * @param publicClient - Public client for blockchain read operations
 * @param walletAddress - Wallet address to check
 * @param lockAddress - Lock contract address
 * @returns True if wallet has a valid key
 */
export async function hasValidKey(
  publicClient: PublicClient,
  walletAddress: Address,
  lockAddress: Address,
): Promise<boolean> {
  try {
    const hasKey = await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: "getHasValidKey",
      args: [walletAddress],
    });
    return Boolean(hasKey);
  } catch (error) {
    log.error("Error checking key validity", {
      error,
      walletAddress,
      lockAddress,
    });
    return false;
  }
}
