/**
 * Utility functions for lock purchase security verification and updates
 * Used to check and fix grant-based locks (milestones, quests, bootcamps)
 */

import type { Address, PublicClient } from "viem";
import { LOCK_CONFIG_VIEW_ABI } from "../shared/abi-definitions";

/**
 * Verify if a lock has maxNumberOfKeys set to 0 (purchases disabled for grant-based locks)
 *
 * @param lockAddress - The address of the lock contract to check
 * @param publicClient - Viem public client for blockchain reads
 * @returns Object with security status and current maxNumberOfKeys value
 *
 * @example
 * const { isSecure, currentValue } = await verifyMaxKeysSecurity(lockAddress, publicClient);
 * if (!isSecure) {
 *   console.log(`Lock is insecure! maxNumberOfKeys is ${currentValue}, should be 0`);
 * }
 */
export async function verifyMaxKeysSecurity(
  lockAddress: Address,
  publicClient: PublicClient,
): Promise<{ isSecure: boolean; currentValue: bigint }> {
  const maxKeys = await publicClient.readContract({
    address: lockAddress,
    abi: LOCK_CONFIG_VIEW_ABI,
    functionName: "maxNumberOfKeys",
  });

  return {
    isSecure: maxKeys === 0n,
    currentValue: maxKeys,
  };
}

/**
 * Read current lock configuration and return parameters for updateLockConfig
 * Sets maxNumberOfKeys to 0 while preserving expiration and maxKeysPerAddress
 *
 * @param lockAddress - The address of the lock contract
 * @param publicClient - Viem public client for blockchain reads
 * @returns Tuple of [expirationDuration, 0n, maxKeysPerAddress] for updateLockConfig
 *
 * @example
 * const params = await getLockConfigForUpdate(lockAddress, publicClient);
 * await lockContract.write.updateLockConfig(params);
 */
export async function getLockConfigForUpdate(
  lockAddress: Address,
  publicClient: PublicClient,
): Promise<[bigint, bigint, bigint]> {
  // Read current lock configuration values in parallel
  const [expiration, maxKeysPerAddress] = await Promise.all([
    publicClient.readContract({
      address: lockAddress,
      abi: LOCK_CONFIG_VIEW_ABI,
      functionName: "expirationDuration",
    }),
    publicClient.readContract({
      address: lockAddress,
      abi: LOCK_CONFIG_VIEW_ABI,
      functionName: "maxKeysPerAddress",
    }),
  ]);

  const safeMaxKeysPerAddress = maxKeysPerAddress === 0n ? 1n : maxKeysPerAddress;

  // Return parameters for updateLockConfig with maxNumberOfKeys forced to 0
  return [expiration, 0n, safeMaxKeysPerAddress];
}
