import { type Address, type Hash, formatEther } from "viem";
import {
  createBlockchainPublicClient,
  createBlockchainWalletClient,
} from "./config";
import { PUBLIC_LOCK_CONTRACT } from "../../constants";
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
    this.publicClient = createBlockchainPublicClient();
    this.walletClient = createBlockchainWalletClient(); // May be null if no private key
    this.contractAbi = PUBLIC_LOCK_CONTRACT.abi;
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
      console.error(
        "Grant keys operation not available - No private key configured"
      );
      return {
        success: false,
        error:
          "Write operations disabled - LOCK_MANAGER_PRIVATE_KEY not configured",
      };
    }

    try {
      console.log(`Granting key to address: ${recipientAddress}`);

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
      console.log(`Transaction submitted: ${hash}`);

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        // Extract token IDs from events if available
        const tokenIds = this.extractTokenIdsFromReceipt(receipt);

        return {
          success: true,
          transactionHash: hash,
          tokenIds,
        };
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error: any) {
      console.error("Error granting key:", error);
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

      if (!hasValidKey) {
        console.log(
          `User ${userAddress} does not have a valid key for lock ${lockAddress}`
        );
        return null;
      }

      // Check if the user has any keys at all
      const balance = (await this.publicClient.readContract({
        address: lockAddress,
        abi: this.contractAbi,
        functionName: "balanceOf",
        args: [userAddress],
        ...cacheOptions,
      })) as bigint;

      if (balance === 0n) {
        console.log(`User ${userAddress} has 0 keys for lock ${lockAddress}`);
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

        // Check if the key has expired
        const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const isExpired = expirationTimestamp <= currentTimestamp;

        return {
          tokenId,
          owner: userAddress,
          expirationTimestamp,
          isValid: !isExpired,
        };
      } catch (error) {
        console.error("Error getting token details:", error);
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
      console.error("Error checking user key:", error);
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
   * Extract token IDs from transaction receipt
   */
  private extractTokenIdsFromReceipt(receipt: any): bigint[] {
    const tokenIds: bigint[] = [];

    try {
      // Look for Transfer events in the logs
      for (const log of receipt.logs) {
        if (
          log.topics[0] ===
          "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
        ) {
          // Transfer event topic
          const tokenId = BigInt(log.topics[3]);
          tokenIds.push(tokenId);
        }
      }
    } catch (error) {
      console.warn("Could not extract token IDs from receipt");
    }

    return tokenIds;
  }

  /**
   * Get the balance of the lock manager account
   * NOTE: This operation requires a wallet client with a private key.
   * Currently disabled until LOCK_MANAGER_PRIVATE_KEY is configured.
   */
  async getManagerBalance(): Promise<string> {
    // Check if wallet client is available
    if (!this.walletClient || !this.walletClient.account) {
      console.warn(
        "Get manager balance operation not available - No private key configured"
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
      console.error("Error getting manager balance:", error);
      return "0";
    }
  }
}

// Export a singleton instance
export const lockManagerService = new LockManagerService();
