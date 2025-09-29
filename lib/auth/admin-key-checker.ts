/**
 * Admin Key Checker Utilities
 * Purpose: Optimize admin authentication by checking multiple wallets in parallel
 * Runtime: Server-side only
 */

import { Address, zeroAddress } from "viem";
import { createServerLockManager } from "../blockchain/services/lock-manager";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { KeyInfo } from "@/lib/blockchain/services/lock-manager";

const log = getLogger("auth:key-check");

export interface AdminKeyResult {
  hasValidKey: boolean;
  validAddress?: string;
  checkedAddresses: string[];
  errors: Array<{
    address: string;
    error: string;
  }>;
}

export interface WalletKeyCheck {
  address: string;
  keyInfo: { isValid: boolean } | null;
  error?: string;
}

/**
 * Check multiple wallet addresses for admin keys in parallel
 * Significantly faster than sequential checking for users with multiple wallets
 *
 * @param walletAddresses Array of wallet addresses to check
 * @param adminLockAddress The admin lock contract address
 * @returns Promise with validation results
 */
export const checkMultipleWalletsForAdminKey = async (
  walletAddresses: string[],
  adminLockAddress: string,
  client?: any,
): Promise<AdminKeyResult> => {
  if (walletAddresses.length === 0) {
    return {
      hasValidKey: false,
      checkedAddresses: [],
      errors: [],
    };
  }

  log.info(
    `Checking ${walletAddresses.length} wallet(s) in parallel for admin access`,
  );

  // Create parallel key check promises
  const keyCheckPromises = walletAddresses.map(
    async (address): Promise<WalletKeyCheck> => {
      try {
        log.debug(`Checking wallet ${address}...`);
        let keyInfo: KeyInfo | null = {
          tokenId: 0n,
          owner: zeroAddress,
          expirationTimestamp: 0n,
          isValid: false,
        };
        // Create fresh service instance for each check - no persistence
        if (client) {
          const hasValidKey = await client.readContract({
            address: adminLockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "getHasValidKey",
            args: [address],
          });
          keyInfo.isValid = hasValidKey;
          keyInfo.owner = address as Address;
        }else {
          const lockManager = createServerLockManager();
          keyInfo = await lockManager.checkUserHasValidKey(
            address as Address,
            adminLockAddress as Address,
          );
        }

        log.debug(
          `Wallet ${address}: ${keyInfo?.isValid ? "VALID" : "INVALID"}`,
        );

        return {
          address,
          keyInfo,
        };
      } catch (error: any) {
        log.error(`Key check failed for ${address}`, { error: error.message });

        return {
          address,
          keyInfo: null,
          error: error.message || "Unknown error during key check",
        };
      }
    },
  );

  // Execute all key checks in parallel
  const startTime = Date.now();
  const keyCheckResults = await Promise.allSettled(keyCheckPromises);
  const endTime = Date.now();

  log.info(
    `Completed ${walletAddresses.length} key checks in ${endTime - startTime}ms`,
  );

  // Process results
  const errors: Array<{ address: string; error: string }> = [];
  let validAddress: string | undefined;

  for (const result of keyCheckResults) {
    if (result.status === "fulfilled") {
      const { address, keyInfo, error } = result.value;

      if (error) {
        errors.push({ address, error });
      } else if (keyInfo?.isValid && !validAddress) {
        // Use the first valid address found
        validAddress = address;
        log.info(`✅ Admin access granted for wallet ${address}`);
      }
    } else {
      // Promise was rejected - this should be rare due to individual error handling
      errors.push({
        address: "unknown",
        error: result.reason?.message || "Promise rejection during key check",
      });
    }
  }

  const result: AdminKeyResult = {
    hasValidKey: !!validAddress,
    validAddress,
    checkedAddresses: walletAddresses,
    errors,
  };

  if (result.hasValidKey) {
    log.info(`✅ Access GRANTED - found valid admin key`);
  } else {
    log.info(`❌ Access DENIED - no valid admin keys found`);
    if (errors.length > 0) {
      log.warn(`Encountered ${errors.length} errors during validation`);
    }
  }

  return result;
};

/**
 * Check a single development admin address
 * Used as fallback in development environments
 *
 * @param devAddress Development admin address
 * @param adminLockAddress Admin lock contract address
 * @returns Promise with validation result
 */
export const checkDevelopmentAdminAddress = async (
  devAddress: string,
  adminLockAddress: string,
  client?: any,
): Promise<{ isValid: boolean; error?: string }> => {
  try {
    log.info(`Checking development admin address: ${devAddress}`);
    let keyInfo: KeyInfo | null = {
      tokenId: 0n,
      owner: zeroAddress,
      expirationTimestamp: 0n,
      isValid: false,
    };
    // Create fresh service instance - no persistence
    if (client) {
      const hasValidKey = await client.readContract({
        address: adminLockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: "getHasValidKey",
        args: [devAddress],
      });
      keyInfo.isValid = hasValidKey;
      keyInfo.owner = devAddress as Address;
    } else {
      const lockManager = createServerLockManager();
      keyInfo = await lockManager.checkUserHasValidKey(
        devAddress as Address,
        adminLockAddress as Address,
      );
    }

    const isValid = keyInfo?.isValid || false;
    log.info(`Development admin check: ${isValid ? "VALID" : "INVALID"}`);

    return { isValid };
  } catch (error: any) {
    const errorMessage =
      error.message || "Unknown error during dev admin check";
    log.error(`Development admin check failed`, { error: errorMessage });

    return { isValid: false, error: errorMessage };
  }
};

/**
 * Performance comparison utility for testing
 * Compares sequential vs parallel wallet checking performance
 */
export const compareKeyCheckPerformance = async (
  walletAddresses: string[],
  adminLockAddress: string,
): Promise<{
  parallelTime: number;
  estimatedSequentialTime: number;
  performanceGain: string;
}> => {
  const startTime = Date.now();
  await checkMultipleWalletsForAdminKey(walletAddresses, adminLockAddress);
  const parallelTime = Date.now() - startTime;

  // Estimate sequential time (this is approximate)
  const estimatedSequentialTime = parallelTime * walletAddresses.length;
  const gainFactor = estimatedSequentialTime / parallelTime;

  return {
    parallelTime,
    estimatedSequentialTime,
    performanceGain: `${gainFactor.toFixed(1)}x faster`,
  };
};
