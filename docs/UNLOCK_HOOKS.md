# Comprehensive Implementation Plan: Unlock Hook Directory

## Overview
Replace all lock manager service dependencies in AdminAuth context with React hooks that follow the exact `useWalletBalances` pattern, using fresh `createPublicClientUnified()` calls and proper lifecycle management.

## File Structure (Following Codebase Conventions)

```
hooks/unlock/
├── index.ts                    // Export all hooks + convenience functions
├── types.ts                    // Shared TypeScript interfaces
├── useHasValidKey.ts           // getHasValidKey operation
├── useIsLockManager.ts         // isLockManager operation
├── useKeyPrice.ts              // keyPrice operation
├── useLockTokenAddress.ts      // tokenAddress operation
└── useKeyExpirationTimestamp.ts // keyExpirationTimestampFor operation
```

## Implementation Details

### 1. Core Hook Pattern (Exactly Following `useWalletBalances`)

Each hook follows this exact pattern:
```typescript
// hooks/unlock/useHasValidKey.ts
import { useCallback, useState } from 'react';
import { createPublicClientUnified } from '@/lib/blockchain/config';
import { COMPLETE_LOCK_ABI } from '@/lib/blockchain/shared/abi-definitions';
import { getLogger } from '@/lib/utils/logger';
import type { Address } from 'viem';

const log = getLogger('hooks:unlock:has-valid-key');

interface UseHasValidKeyOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

export const useHasValidKey = (options: UseHasValidKeyOptions = {}) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkHasValidKey = useCallback(async (
    userAddress: Address,
    lockAddress: Address
  ): Promise<boolean | null> => {
    if (!enabled) return null;

    try {
      setError(null);

      // Fresh client per call - no persistence
      const client = createPublicClientUnified();

      const result = await client.readContract({
        address: lockAddress,
        abi: COMPLETE_LOCK_ABI,
        functionName: 'getHasValidKey',
        args: [userAddress],
      }) as boolean;

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      log.error('Error checking hasValidKey:', { error: err, userAddress, lockAddress });
      setError(errorMsg);
      return null;
    }
  }, [enabled]);

  return {
    checkHasValidKey,
    error,
  };
};
```

### 2. All Hook Files (Following Same Pattern)

**hooks/unlock/useIsLockManager.ts**:
- `checkIsLockManager(userAddress, lockAddress)` → calls `isLockManager`

**hooks/unlock/useKeyPrice.ts**:
- `getKeyPrice(lockAddress)` → calls `keyPrice`

**hooks/unlock/useLockTokenAddress.ts**:
- `getLockTokenAddress(lockAddress)` → calls `tokenAddress`

**hooks/unlock/useKeyExpirationTimestamp.ts**:
- `getKeyExpirationTimestamp(lockAddress, tokenId)` → calls `keyExpirationTimestampFor`

### 3. Types File (hooks/unlock/types.ts)

```typescript
import type { Address } from 'viem';

export interface UnlockHookOptions {
  enabled?: boolean;
}

export interface KeyInfo {
  tokenId: bigint;
  owner: Address;
  expirationTimestamp: bigint;
  isValid: boolean;
}

export interface LockInfo {
  tokenAddress: Address;
  keyPrice: bigint;
  isValid: boolean;
}
```

### 4. Index File (hooks/unlock/index.ts)

```typescript
// Individual hooks
export { useHasValidKey } from './useHasValidKey';
export { useIsLockManager } from './useIsLockManager';
export { useKeyPrice } from './useKeyPrice';
export { useLockTokenAddress } from './useLockTokenAddress';
export { useKeyExpirationTimestamp } from './useKeyExpirationTimestamp';

// Types
export type { UnlockHookOptions, KeyInfo, LockInfo } from './types';

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
```

### 5. AdminAuth Context Integration

**In `contexts/admin-context/hooks/useAdminAuthContextActions.ts`**:

```typescript
// Replace this import
// import { useLockManagerClient } from '@/hooks/useLockManagerClient';

// With this import
import { useHasValidKey } from '@/hooks/unlock';

// In the hook function:
export const useAdminAuthContextActions = (
  state: AdminAuthContextState,
  sessionHandlers: AdminSessionHandlers
) => {
  // ... existing code ...

  // Add the unlock hook with proper gating
  const { checkHasValidKey } = useHasValidKey({
    enabled: authenticated && !!walletAddress
  });

  // Replace the checkUserHasValidKey calls:
  // OLD: const keyInfo = await checkUserHasValidKey(currentWalletAddress, adminLockAddress);
  // NEW: const hasValidKey = await checkHasValidKey(currentWalletAddress, adminLockAddress);

  const checkAdminAccess = useCallback(async (forceRefresh = false) => {
    // ... existing validation code ...

    try {
      const hasValidKey = await checkHasValidKey(
        currentWalletAddress as Address,
        adminLockAddress as Address
      );

      if (hasValidKey === true) {
        log.info(`✅ Admin access GRANTED for ${currentWalletAddress}`);
      } else {
        log.info(`❌ Admin access DENIED for ${currentWalletAddress}`);
      }

      // ... rest of the logic ...
    } catch (error) {
      // ... error handling ...
    }
  }, [checkHasValidKey, /* ... other deps ... */]);
};
```

## Key Design Principles

### 1. **Zero Dependencies on Services/Managers**
- No imports from `lib/blockchain/services/*`
- No service singletons or persistent state
- Direct viem client creation only

### 2. **Exact `useWalletBalances` Pattern**
- Fresh `createPublicClientUnified()` per call
- `enabled` gating flag for RPC control
- Same error handling and logging patterns
- Same function naming conventions

### 3. **Request Coalescing (Optional Enhancement)**
Add to each hook if needed:
```typescript
const pendingChecksRef = useRef(new Map());

const checkWithCoalescing = useCallback(async (key: string, operation: () => Promise<any>) => {
  if (pendingChecksRef.current.has(key)) {
    return pendingChecksRef.current.get(key);
  }

  const promise = operation();
  pendingChecksRef.current.set(key, promise);

  promise.finally(() => pendingChecksRef.current.delete(key));
  return promise;
}, []);
```

### 4. **ABI Source**
- Use `COMPLETE_LOCK_ABI` from `@/lib/blockchain/shared/abi-definitions`
- No custom ABI definitions needed
- All required functions already available

## Implementation Sequence

1. **Create Directory Structure**: `hooks/unlock/` with all files
2. **Implement Core Hooks**: Start with `useHasValidKey` (most critical)
3. **Add Remaining Hooks**: Following exact same pattern
4. **Update AdminAuth Context**: Replace service calls with hook calls
5. **Test RPC Behavior**: Verify no persistent calls after page close

## Expected Outcome

- **No RPC hammering**: Fresh clients created per call, no persistence
- **Proper lifecycle**: React manages cleanup automatically
- **Same functionality**: All admin auth checks work identically
- **Better debugging**: Can isolate which specific unlock operation causes issues
- **Maintainable**: Follows established codebase patterns

This approach completely eliminates any service/manager dependencies while maintaining identical functionality through proven React patterns.