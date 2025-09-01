import { type Address, type Hash, formatEther } from "viem";
import {
  createServerPublicClient,
  createServerWalletClient,
} from "./server-config";
import { COMPLETE_LOCK_ABI } from "./shared/abi-definitions";
import { blockchainLogger } from "./shared/logging-utils";
import { extractTokenIdsFromReceipt } from "./shared/transaction-utils";
export interface GrantKeysParams {
  recipientAddress: Address;
  lockAddress: Address;
  expirationDuration?: bigint;
  keyManagers?: Address[];
}

export interface GrantKeysResult {
  success: boolean;
  transactionHash?: Hash;
  error?: string;
  tokenIds?: bigint[];
}

export interface KeyInfo {
  tokenId: bigint;
  owner: Address;
  expirationTimestamp: bigint;
  isValid: boolean;
}

/**
 * Service for managing lock operations on the blockchain
 */
export class LockManagerService {
  private publicClient;
  private walletClient;
  private contractAbi;

  constructor() {
    this.publicClient = createServerPublicClient();
    this.walletClient = createServerWalletClient();
    this.contractAbi = COMPLETE_LOCK_ABI;
    
    blockchainLogger.debug("LockManagerService initialized", {
      operation: "constructor",
      hasWalletClient: !!this.walletClient,
      chainId: this.publicClient.chain?.id
    });
  }

  /**
   * Grant keys to a recipient address
   * NOTE: This operation requires a wallet client with a private key.
   * Currently disabled until LOCK_MANAGER_PRIVATE_KEY is configured.
   */
  async grantKeys({
    recipientAddress,
    lockAddress,
    keyManagers,
    expirationDuration,
  }: GrantKeysParams): Promise<GrantKeysResult> {
    // Check if wallet client is available
    if (!this.walletClient) {
      blockchainLogger.logConfigurationWarning(
        "Grant keys operation not available - No private key configured",
        { operation: "grantKeys", recipientAddress }
      );
      return {
        success: false,
        error:
          "Write operations disabled - LOCK_MANAGER_PRIVATE_KEY not configured",
      };
    }

    try {
      blockchainLogger.logTransactionStart("grantKeys", {
        operation: "grantKeys",
        recipientAddress,
        lockAddress,
        expirationDuration: expirationDuration?.toString()
      });

      // Get the default expiration duration if not provided
      const duration =
        expirationDuration || (await this.getDefaultExpirationDuration());
      const account = this.walletClient.account;

      // Convert duration to timestamp (current time + duration)
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
      const expirationTimestamp = currentTimestamp + duration;

      // Prepare the transaction
      const { request } = await this.publicClient.simulateContract({
        address: lockAddress,
        abi: this.contractAbi,
        functionName: "grantKeys",
        args: [
          [recipientAddress], // recipients array
          [expirationTimestamp], // expirationTimestamps array (not duration!)
          keyManagers, // key managers array
        ],
        account: account,
      });

      // Execute the transaction
      const hash = await this.walletClient.writeContract(request);
      blockchainLogger.info("Grant keys transaction submitted", {
        operation: "grantKeys",
        transactionHash: hash,
        recipientAddress,
        lockAddress
      });

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        // Extract token IDs from events if available
        const tokenIds = extractTokenIdsFromReceipt(receipt);

        blockchainLogger.logTransactionSuccess("grantKeys", hash, {
          tokenIds: tokenIds.map(id => id.toString()),
          recipientAddress,
          lockAddress
        });

        return {
          success: true,
          transactionHash: hash,
          tokenIds,
        };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error: any) {
      blockchainLogger.logTransactionError("grantKeys", error, {
        recipientAddress,
        lockAddress,
        expirationDuration: expirationDuration?.toString()
      });
      return {
        success: false,
        error: error.message || "Failed to grant key",
      };
    }
  }

  /**
   * Check if a user has a valid key
   * This is a read-only operation that works without a private key
   * @param userAddress The user's wallet address
   * @param lockAddress The lock contract address
   * @param forceRefresh Whether to bypass cache and force a fresh check
   */
  async checkUserHasValidKey(
    userAddress: Address,
    lockAddress: Address,
    forceRefresh = false
  ): Promise<KeyInfo | null> {
    try {
      // Add cache-busting parameter if forceRefresh is true
      const cacheOptions = forceRefresh
        ? { multicallAddress: undefined } // This forces viem to not use its internal cache
        : {};

      // First check if the user has a valid key
      const hasValidKey = (await this.publicClient.readContract({
        address: lockAddress,
        abi: this.contractAbi,
        functionName: "getHasValidKey",
        args: [userAddress],
        ...cacheOptions,
      })) as boolean;

      if (hasValidKey === false) {
        blockchainLogger.logKeyCheck(lockAddress, userAddress, false);
        return null;
      }

      try {
        // Get the token ID for the user
        const tokenId = (await this.publicClient.readContract({
          address: lockAddress,
          abi: this.contractAbi,
          functionName: "tokenOfOwnerByIndex",
          args: [userAddress, 0n],
          ...cacheOptions,
        })) as bigint;

        // Get key expiration
        const expirationTimestamp = (await this.publicClient.readContract({
          address: lockAddress,
          abi: this.contractAbi,
          functionName: "keyExpirationTimestampFor",
          args: [tokenId],
          ...cacheOptions,
        })) as bigint;

        blockchainLogger.logKeyCheck(lockAddress, userAddress, hasValidKey);
        
        return {
          tokenId,
          owner: userAddress,
          expirationTimestamp,
          isValid: hasValidKey,
        };
      } catch (error) {
        blockchainLogger.warn("Error getting token details, using fallback", {
          operation: "checkUserHasValidKey",
          userAddress,
          lockAddress,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Even though getHasValidKey returned true, we couldn't get the token details
        // This might happen if the contract doesn't implement ERC721Enumerable
        return {
          tokenId: 0n,
          owner: userAddress,
          expirationTimestamp: 0n,
          isValid: true, // We trust getHasValidKey
        };
      }
    } catch (error) {
      blockchainLogger.error("Failed to check user key", {
        operation: "checkUserHasValidKey",
        userAddress,
        lockAddress,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Check if a user is a lock manager
   * This is a read-only operation that works without a private key
   * @param userAddress The user's wallet address
   * @param lockAddress The lock contract address
   * @param forceRefresh Whether to bypass cache and force a fresh check
   */
  async checkUserIsLockManager(
    userAddress: Address,
    lockAddress: Address,
    forceRefresh = false
    ): Promise<boolean | null> {
    try {
      // Add cache-busting parameter if forceRefresh is true
      const cacheOptions = forceRefresh
        ? { multicallAddress: undefined } // This forces viem to not use its internal cache
        : {};

      // First check if the user has a valid key
      const isLockManager = (await this.publicClient.readContract({
        address: lockAddress,
        abi: this.contractAbi,
        functionName: "isLockManager",
        args: [userAddress],
        ...cacheOptions,
      })) as boolean;

      if (!isLockManager) {
        blockchainLogger.logKeyCheck(lockAddress, userAddress, false);
        return null;
      }

      try {

        blockchainLogger.logKeyCheck(lockAddress, userAddress, isLockManager);
        
        return isLockManager;
      } catch (error) {
        blockchainLogger.warn("Error checking if user is lock manager", {
          operation: "checkUserIsLockManager",
          userAddress,
          lockAddress,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
      }
    } catch (error) {
      blockchainLogger.error("Failed to check if user is lock manager", {
        operation: "checkUserIsLockManager",
        userAddress,
        lockAddress,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Get the default expiration duration from the contract
   */
  private async getDefaultExpirationDuration(): Promise<bigint> {
    // Default to 30 days if we can't fetch from contract
    return BigInt(30 * 24 * 60 * 60);
  }


  /**
   * Get the balance of the lock manager account
   * NOTE: This operation requires a wallet client with a private key.
   * Currently disabled until LOCK_MANAGER_PRIVATE_KEY is configured.
   */
  async getManagerBalance(): Promise<string> {
    // Check if wallet client is available
    if (!this.walletClient || !this.walletClient.account) {
      blockchainLogger.logConfigurationWarning(
        "Get manager balance operation not available - No private key configured",
        { operation: "getManagerBalance" }
      );
      return "0";
    }

    try {
      const account = this.walletClient.account;
      const balance = await this.publicClient.getBalance({
        address: account.address,
      });

      return formatEther(balance);
    } catch (error) {
      blockchainLogger.error("Failed to get manager balance", {
        operation: "getManagerBalance",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return "0";
    }
  }
}

// Export a singleton instance
export const lockManagerService = new LockManagerService();
