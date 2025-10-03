import { Address } from "viem";
import {
  LockManagerService,
  KeyInfo,
} from "@/lib/blockchain/services/lock-manager";
import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import {
  GrantKeyService,
  GrantKeyResponse,
} from "@/lib/blockchain/services/grant-key-service";
import { getLogger } from "@/lib/utils/logger";
import { getKeyManagersForContext } from "@/lib/helpers/key-manager-utils";

const log = getLogger("services:user-key-service");

export interface UserKeyCheckResult {
  hasValidKey: boolean;
  validAddress?: string;
  checkedAddresses: string[];
  errors: Array<{ address: string; error: string }>;
  keyInfo?: KeyInfo | null;
}

export type UserKeyGrantResult = GrantKeyResponse;

/**
 * A scalable, reusable service for all user-facing key operations.
 * This service is designed to be used from backend/server-side environments.
 */
export class UserKeyService {
  /**
   * Checks if a user has a valid key for a specific lock across all their linked wallets.
   * This is the primary method for verification and runs checks in parallel.
   * @param userId - The user's Privy DID.
   * @param lockAddress - The contract address of the Unlock lock.
   * @returns A result object indicating if a key was found, on which address, and any errors.
   */
  static async checkUserKeyOwnership(
    userId: string,
    lockAddress: string,
  ): Promise<UserKeyCheckResult> {
    const walletAddresses = await getUserWalletAddresses(userId);
    if (walletAddresses.length === 0) {
      return { hasValidKey: false, checkedAddresses: [], errors: [] };
    }

    // Create public client using unified config
    const publicClient = createPublicClientUnified();
    const lockManager = new LockManagerService(publicClient);

    const keyCheckPromises = walletAddresses.map((address) =>
      lockManager
        .checkUserHasValidKey(address as Address, lockAddress as Address)
        .then((keyInfo) => ({ address, keyInfo, error: null }))
        .catch((error) => ({
          address,
          keyInfo: null,
          error: error.message || "Unknown error",
        })),
    );

    const results = await Promise.all(keyCheckPromises);

    let validAddress: string | undefined;
    let keyInfo: KeyInfo | null = null;
    const errors: Array<{ address: string; error: string }> = [];

    for (const result of results) {
      if (result.error) {
        errors.push({ address: result.address, error: result.error });
      } else if (result.keyInfo?.isValid && !validAddress) {
        // Found the first valid key, capture its details
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
   * Grants a key to the user's primary wallet using the server-side admin wallet.
   * This is a gasless transaction for the user.
   * @param userId - The user's Privy DID.
   * @param lockAddress - The contract address of the Unlock lock to grant a key for.
   * @returns The result of the key granting transaction from the GrantKeyService.
   */
  static async grantKeyToUser(
    userId: string,
    lockAddress: string,
  ): Promise<UserKeyGrantResult> {
    const walletAddresses = await getUserWalletAddresses(userId);
    if (!walletAddresses.length) {
      throw new Error("User has no wallet address to grant the key to.");
    }

    // Grant the key to the user's primary (first linked) wallet.
    const targetWallet = walletAddresses[0]!;

    // Before granting, quickly check if they already have a key to prevent wasted transactions.
    const keyCheck = await this.checkUserKeyOwnership(userId, lockAddress);
    if (keyCheck.hasValidKey) {
      log.info(
        `User ${userId} already has a key for lock ${lockAddress}. Skipping grant.`,
      );
      return { success: true };
    }

    const grantKeyService = new GrantKeyService();
    return grantKeyService.grantKeyToUser({
      walletAddress: targetWallet,
      lockAddress: lockAddress as Address,
      keyManagers: getKeyManagersForContext(
        targetWallet as Address,
        "milestone",
      ),
      expirationDuration: BigInt(365 * 24 * 60 * 60), // 1 year expiration for milestone keys
    });
  }
}
