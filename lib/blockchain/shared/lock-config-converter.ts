import { getTokenAddressForCurrency } from "../legacy/admin-lock-config";
import type { LockConfig } from "../legacy/admin-lock-config";
import type { AdminLockDeploymentParams } from "@/hooks/unlock/types";

/**
 * Convert LockConfig to AdminLockDeploymentParams for useDeployAdminLock hook
 * Handles currency conversion and bigint formatting
 *
 * @param lockConfig - The lock configuration object from legacy config generators
 * @param isAdmin - Whether the current user has admin privileges
 * @returns AdminLockDeploymentParams formatted for the useDeployAdminLock hook
 */
export const convertLockConfigToDeploymentParams = (
  lockConfig: LockConfig & { keyManagers?: string[] },
  isAdmin: boolean,
): AdminLockDeploymentParams => {
  // Convert string keyPrice to bigint (USDC has 6 decimals)
  const keyPriceInWei =
    lockConfig.currency === "FREE" || lockConfig.price === 0
      ? BigInt(0)
      : BigInt(Math.floor(parseFloat(lockConfig.keyPrice) * 1e6));

  return {
    name: lockConfig.name,
    expirationDuration: BigInt(lockConfig.expirationDuration),
    tokenAddress: getTokenAddressForCurrency(lockConfig.currency),
    keyPrice: keyPriceInWei,
    maxNumberOfKeys: BigInt(lockConfig.maxNumberOfKeys),
    lockVersion: 14,
    isAdmin,
  };
};
