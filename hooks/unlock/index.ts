// Individual hooks
export { useHasValidKey } from "./useHasValidKey";
export { useIsLockManager } from "./useIsLockManager";
export { useKeyPrice } from "./useKeyPrice";
export { useLockTokenAddress } from "./useLockTokenAddress";
export { useKeyExpirationTimestamp } from "./useKeyExpirationTimestamp";

// Types
export type { UnlockHookOptions, KeyInfo, LockInfo } from "./types";

// Import hooks for composite
import { useHasValidKey } from "./useHasValidKey";
import { useIsLockManager } from "./useIsLockManager";
import { useKeyPrice } from "./useKeyPrice";
import { useLockTokenAddress } from "./useLockTokenAddress";
import { useKeyExpirationTimestamp } from "./useKeyExpirationTimestamp";
import type { UnlockHookOptions } from "./types";

// Convenience composite hook
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
