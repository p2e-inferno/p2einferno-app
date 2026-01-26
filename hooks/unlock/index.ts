// Individual read hooks
export { useHasValidKey } from "./useHasValidKey";
export { useIsLockManager } from "./useIsLockManager";
export { useKeyPrice } from "./useKeyPrice";
export { useLockTokenAddress } from "./useLockTokenAddress";
export { useKeyExpirationTimestamp } from "./useKeyExpirationTimestamp";
export { useTransferFeeBasisPoints } from "./useTransferFeeBasisPoints";
// Add new read hooks
export { useIsRenewable } from "./useIsRenewable";
export { useFreeTrialLength } from "./useFreeTrialLength";
export { useGetCancelAndRefundValue } from "./useGetCancelAndRefundValue";

// Individual write hooks
export { useKeyPurchase } from "./useKeyPurchase";
export { useDeployLock } from "./useDeployLock";
export { useDeployAdminLock } from "./useDeployAdminLock";
export { useLockManagerKeyGrant } from "./useLockManagerKeyGrant";
export { useAddLockManager } from "./useAddLockManager";
export { useUpdateTransferFee } from "./useUpdateTransferFee";
// Add new write hooks
export { useExtendKey } from "./useExtendKey";
export { useGrantKeyExtension } from "./useGrantKeyExtension";
export { useRenewMembershipFor } from "./useRenewMembershipFor";
export { useUpdateRefundPenalty } from "./useUpdateRefundPenalty";
export { useCancelAndRefund } from "./useCancelAndRefund";

export type {
  AddLockManagerParams,
  AddLockManagerResult,
} from "./useAddLockManager";

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
  // Add renewal types
  ExtendKeyParams,
  ExtendKeyResult,
  GrantKeyExtensionParams,
  GrantKeyExtensionResult,
  RenewMembershipParams,
  RenewMembershipResult,
  UpdateRefundPenaltyParams,
  UpdateRefundPenaltyResult,
  CancelAndRefundParams,
  CancelAndRefundResult,
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
// Add new hooks for composite
import { useIsRenewable } from "./useIsRenewable";
import { useFreeTrialLength } from "./useFreeTrialLength";
import { useGetCancelAndRefundValue } from "./useGetCancelAndRefundValue";
import { useExtendKey } from "./useExtendKey";
import { useGrantKeyExtension } from "./useGrantKeyExtension";
import { useRenewMembershipFor } from "./useRenewMembershipFor";
import { useUpdateRefundPenalty } from "./useUpdateRefundPenalty";
import { useCancelAndRefund } from "./useCancelAndRefund";
import type { UnlockHookOptions } from "./types";

// Convenience composite hook for read operations
export const useUnlockReadOperations = (options: UnlockHookOptions = {}) => {
  const hasValidKey = useHasValidKey(options);
  const isLockManager = useIsLockManager(options);
  const keyPrice = useKeyPrice(options);
  const tokenAddress = useLockTokenAddress(options);
  const keyExpiration = useKeyExpirationTimestamp(options);
  // Add new read operations
  const isRenewable = useIsRenewable(options);
  const freeTrialLength = useFreeTrialLength(options);
  const cancelAndRefundValue = useGetCancelAndRefundValue(options);

  return {
    hasValidKey,
    isLockManager,
    keyPrice,
    tokenAddress,
    keyExpiration,
    isRenewable,
    freeTrialLength,
    cancelAndRefundValue,
  };
};

// Composite hook for all write operations
export const useUnlockWriteOperations = () => ({
  keyPurchase: useKeyPurchase(),
  deployLock: useDeployLock(),
  keyGrant: useLockManagerKeyGrant(),
  // Add new write operations
  extendKey: useExtendKey(),
  grantKeyExtension: useGrantKeyExtension(),
  renewMembership: useRenewMembershipFor(),
  updateRefundPenalty: useUpdateRefundPenalty(),
  cancelAndRefund: useCancelAndRefund(),
});

// Admin-specific operations (requires isAdmin prop)
export const useUnlockAdminOperations = ({
  isAdmin,
}: {
  isAdmin: boolean;
}) => ({
  deployAdminLock: useDeployAdminLock({ isAdmin }),
});
