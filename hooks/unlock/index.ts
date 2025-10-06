// Individual read hooks
export { useHasValidKey } from "./useHasValidKey";
export { useIsLockManager } from "./useIsLockManager";
export { useKeyPrice } from "./useKeyPrice";
export { useLockTokenAddress } from "./useLockTokenAddress";
export { useKeyExpirationTimestamp } from "./useKeyExpirationTimestamp";

// Individual write hooks
export { useKeyPurchase } from "./useKeyPurchase";
export { useDeployLock } from "./useDeployLock";
export { useDeployAdminLock } from "./useDeployAdminLock";
export { useLockManagerKeyGrant } from "./useLockManagerKeyGrant";
export { useAddLockManager } from "./useAddLockManager";
export type { AddLockManagerParams, AddLockManagerResult } from "./useAddLockManager";

// Test/debug hooks
export { useDeployLockEthers } from "./useDeployLockEthers";

// Types
export type {
  UnlockHookOptions,
  KeyInfo,
  LockInfo,
  KeyPurchaseParams,
  KeyPurchaseResult,
  LockDeploymentParams,
  LockDeploymentResult,
  AdminLockDeploymentParams,
  AdminLockDeploymentResult,
  KeyGrantParams,
  KeyGrantResult,
  OperationState,
} from "./types";

// Import hooks for composite
import { useHasValidKey } from "./useHasValidKey";
import { useIsLockManager } from "./useIsLockManager";
import { useKeyPrice } from "./useKeyPrice";
import { useLockTokenAddress } from "./useLockTokenAddress";
import { useKeyExpirationTimestamp } from "./useKeyExpirationTimestamp";
import { useKeyPurchase } from "./useKeyPurchase";
import { useDeployLock } from "./useDeployLock";
import { useDeployAdminLock } from "./useDeployAdminLock";
import { useLockManagerKeyGrant } from "./useLockManagerKeyGrant";
import type { UnlockHookOptions } from "./types";

// Convenience composite hook for read operations
export const useUnlockOperations = (options: UnlockHookOptions = {}) => {
  const hasValidKey = useHasValidKey(options);
  const isLockManager = useIsLockManager(options);
  const keyPrice = useKeyPrice(options);
  const tokenAddress = useLockTokenAddress(options);
  const keyExpiration = useKeyExpirationTimestamp(options);

  return {
    hasValidKey,
    isLockManager,
    keyPrice,
    tokenAddress,
    keyExpiration,
  };
};

// Composite hook for all write operations
export const useUnlockWriteOperations = () => ({
  keyPurchase: useKeyPurchase(),
  deployLock: useDeployLock(),
  keyGrant: useLockManagerKeyGrant(),
});

// Admin-specific operations (requires isAdmin prop)
export const useUnlockAdminOperations = ({
  isAdmin,
}: {
  isAdmin: boolean;
}) => ({
  deployAdminLock: useDeployAdminLock({ isAdmin }),
});
