/**
 * Utility functions for lock purchase security verification and updates
 * Used to check and fix grant-based locks (milestones, quests, bootcamps)
 */

import type { Address, PublicClient } from "viem";
import { LOCK_CONFIG_VIEW_ABI } from "../shared/abi-definitions";

/**
 * Determine whether a lock's `maxNumberOfKeys` is zero (disables purchases for grant-based locks).
 *
 * @param lockAddress - The address of the lock contract to check
 * @param publicClient - Viem public client used to read contract state
 * @returns `isSecure` is `true` if `currentValue` equals `0n`, `false` otherwise. `currentValue` is the lock's `maxNumberOfKeys` as a `bigint`.
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
 * Prepare arguments for updateLockConfig that disable purchases by forcing maxNumberOfKeys to 0 while preserving expiration and per-address limits.
 *
 * Reads `expirationDuration` and `maxKeysPerAddress` from the lock contract. If `maxKeysPerAddress` is `0n`, it is replaced with `1n` to avoid a zero-per-address value.
 *
 * @param lockAddress - The address of the lock contract
 * @param publicClient - Viem public client for blockchain reads
 * @returns A tuple `[expirationDuration, 0n, maxKeysPerAddress]` where the second element is forced to `0n` and the third is clamped to `1n` if the contract returned `0n`
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