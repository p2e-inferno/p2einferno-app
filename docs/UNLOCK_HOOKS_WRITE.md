# Unlock Write Operations Hook Refactoring Plan

## Overview
Refactor the 1277-line `/lib/unlock/lockUtils.ts` file into clean, efficient React hooks for write operations. This follows the successful pattern established with read operation hooks and prevents RPC hammering by using fresh client instances.

## Key Design Principles
1. **Follow Established Patterns**: Mirror the structure of `/hooks/unlock/useHasValidKey.ts`
2. **Use Viem**: Convert from ethers to viem using `createViemFromPrivyWallet()`
3. **Leverage Existing ABIs**: Use `/lib/blockchain/shared/abi-definitions.ts`
4. **Prevent RPC Hammering**: Fresh client instances per operation + prop-based patterns
5. **Error Handling**: Comprehensive error states and retry logic
6. **Testing UI**: Add controls to `/pages/test/admin-auth-debug.tsx`
7. **Admin Separation**: Distinct deployment patterns for users vs admin-managed locks
8. **Prop-Based Security**: Use `isAdmin` props instead of internal RPC calls

## Implementation Plan

### Step 1: Extract and Update Types
**File**: `/hooks/unlock/types.ts`

Add new interfaces for write operations:

```typescript
// Key Purchase Types
export interface KeyPurchaseParams {
  lockAddress: Address;
  recipient?: Address; // defaults to connected wallet
  keyManager?: Address;
  referrer?: Address;
  data?: `0x${string}`;
}

export interface KeyPurchaseResult {
  success: boolean;
  transactionHash?: string;
  tokenIds?: bigint[];
  error?: string;
}

// Lock Deployment Types (User Deployment)
export interface LockDeploymentParams {
  name: string;
  expirationDuration: bigint;
  tokenAddress: Address; // Use Address(0) for ETH
  keyPrice: bigint;
  maxNumberOfKeys: bigint;
  lockVersion?: number; // defaults to latest
}

export interface LockDeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: Address;
  error?: string;
}

// Admin Lock Deployment Types (Factory Pattern with Server Manager)
export interface AdminLockDeploymentParams {
  name: string;
  expirationDuration: bigint;
  tokenAddress: Address; // Use Address(0) for ETH
  keyPrice: bigint;
  maxNumberOfKeys: bigint;
  lockVersion?: number; // defaults to latest
  isAdmin: boolean; // Must be true to proceed
}

export interface AdminLockDeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: Address;
  serverWalletAddress?: string; // Server wallet added as manager
  error?: string;
}

// Key Grant Types
export interface KeyGrantParams {
  lockAddress: Address;
  recipientAddress: Address;
  keyManagers: Address[];
  expirationDuration?: bigint;
}

export interface KeyGrantResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Shared Operation State
export interface OperationState {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
}
```

### Step 2: Create useKeyPurchase Hook
**File**: `/hooks/unlock/useKeyPurchase.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI, ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
import type { KeyPurchaseParams, KeyPurchaseResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:key-purchase");

export const useKeyPurchase = () => {
  const { user } = usePrivy();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const purchaseKey = useCallback(
    async (params: KeyPurchaseParams): Promise<KeyPurchaseResult> => {
      if (!user?.wallet) {
        const error = "Wallet not connected";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem client per operation
        const walletClient = await createViemFromPrivyWallet(user.wallet);
        const publicClient = walletClient.extend(() => ({})); // Get public client

        const userAddress = user.wallet.address as Address;
        const recipient = params.recipient || userAddress;

        // Get key price and token address
        const [keyPrice, tokenAddress] = await Promise.all([
          publicClient.readContract({
            address: params.lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "keyPrice",
          }) as Promise<bigint>,
          publicClient.readContract({
            address: params.lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "tokenAddress",
          }) as Promise<Address>,
        ]);

        // Handle token approval if needed (ERC20)
        const isETH = tokenAddress === "0x0000000000000000000000000000000000000000";

        if (!isETH) {
          const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [userAddress, params.lockAddress],
          }) as bigint;

          if (allowance < keyPrice) {
            log.info("Approving token spend", { tokenAddress, keyPrice });
            const approveTx = await walletClient.writeContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [params.lockAddress, keyPrice],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        // Purchase key
        const purchaseTx = await walletClient.writeContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [keyPrice], // values
            [recipient], // recipients
            [params.referrer || "0x0000000000000000000000000000000000000000"], // referrers
            [params.keyManager || recipient], // keyManagers
            [params.data || "0x"], // data
          ],
          value: isETH ? keyPrice : 0n,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: purchaseTx
        });

        log.info("Key purchase successful", {
          transactionHash: purchaseTx,
          recipient,
          lockAddress: params.lockAddress
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: purchaseTx,
          tokenIds: [], // Extract from logs if needed
        };

      } catch (error: any) {
        const errorMsg = error.message || "Key purchase failed";
        log.error("Key purchase error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [user?.wallet]
  );

  return {
    purchaseKey,
    ...state,
  };
};
```

### Step 3: Create useDeployLock Hook
**File**: `/hooks/unlock/useDeployLock.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/config";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI
} from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { encodeFunctionData, type Address } from "viem";
import type { LockDeploymentParams, LockDeploymentResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:deploy-lock");

export const useDeployLock = () => {
  const { user } = usePrivy();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const deployLock = useCallback(
    async (params: LockDeploymentParams): Promise<LockDeploymentResult> => {
      if (!user?.wallet) {
        const error = "Wallet not connected";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem client per operation
        const walletClient = await createViemFromPrivyWallet(user.wallet);
        const publicClient = walletClient.extend(() => ({}));

        const userAddress = user.wallet.address as Address;
        const chainId = await publicClient.getChainId();

        // Get factory address for current chain
        const factoryAddress = UNLOCK_FACTORY_ADDRESSES[chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES];
        if (!factoryAddress) {
          throw new Error(`Unlock factory not available on chain ${chainId}`);
        }

        // Encode initialization data
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            userAddress, // _lockCreator
            params.expirationDuration, // _expirationDuration
            params.tokenAddress, // _tokenAddress
            params.keyPrice, // _keyPrice
            params.maxNumberOfKeys, // _maxNumberOfKeys
            params.name, // _lockName
          ],
        });

        // Deploy lock
        const deployTx = await walletClient.writeContract({
          address: factoryAddress as Address,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14, // Default to latest version
            [], // No additional transactions
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: deployTx
        });

        // Extract lock address from logs
        const newLockLog = receipt.logs.find(log =>
          log.topics[0] === "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7" // NewLock event
        );

        const lockAddress = newLockLog?.topics[2] as Address;

        log.info("Lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Lock deployment failed";
        log.error("Lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [user?.wallet]
  );

  return {
    deployLock,
    ...state,
  };
};
```

### Step 4: Create useDeployAdminLock Hook
**File**: `/hooks/unlock/useDeployAdminLock.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/config";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI
} from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { encodeFunctionData, type Address } from "viem";
import type { AdminLockDeploymentParams, AdminLockDeploymentResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:deploy-admin-lock");

export const useDeployAdminLock = ({ isAdmin }: { isAdmin: boolean }) => {
  const { user } = usePrivy();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const deployAdminLock = useCallback(
    async (params: AdminLockDeploymentParams): Promise<AdminLockDeploymentResult> => {
      // Security check - must be admin
      if (!isAdmin || !params.isAdmin) {
        const error = "Admin access required for admin lock deployment";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      if (!user?.wallet) {
        const error = "Wallet not connected";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem client per operation
        const walletClient = await createViemFromPrivyWallet(user.wallet);
        const publicClient = walletClient.extend(() => ({}));

        const userAddress = user.wallet.address as Address;
        const chainId = await publicClient.getChainId();

        // Get factory address for current chain
        const factoryAddress = UNLOCK_FACTORY_ADDRESSES[chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES];
        if (!factoryAddress) {
          throw new Error(`Unlock factory not available on chain ${chainId}`);
        }

        // Fetch server wallet address from API
        const serverResponse = await fetch('/api/admin/server-wallet');
        if (!serverResponse.ok) {
          throw new Error('Failed to fetch server wallet address');
        }
        const { serverWalletAddress } = await serverResponse.json();

        // Encode initialization data (factory as initial owner)
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            factoryAddress, // Factory as initial lock creator
            params.expirationDuration,
            params.tokenAddress,
            params.keyPrice,
            params.maxNumberOfKeys,
            params.name,
          ],
        });

        // Prepare additional transactions (manager setup + renounce)
        const addUserManagerTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [userAddress],
        });

        const addServerManagerTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [serverWalletAddress],
        });

        const renounceFactoryTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "renounceLockManager",
          args: [],
        });

        const additionalTransactions = [
          addUserManagerTx,
          addServerManagerTx,
          renounceFactoryTx,
        ];

        // Deploy lock with factory pattern
        const deployTx = await walletClient.writeContract({
          address: factoryAddress as Address,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14,
            additionalTransactions,
          ],
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: deployTx
        });

        // Extract lock address from logs
        const newLockLog = receipt.logs.find(log =>
          log.topics[0] === "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7" // NewLock event
        );

        const lockAddress = newLockLog?.topics[2] as Address;

        log.info("Admin lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Admin lock deployment failed";
        log.error("Admin lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [user?.wallet, isAdmin]
  );

  return {
    deployAdminLock,
    ...state,
  };
};
```

### Step 5: Create useLockManagerKeyGrant Hook
**File**: `/hooks/unlock/useLockManagerKeyGrant.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
import type { KeyGrantParams, KeyGrantResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:key-grant");

export const useLockManagerKeyGrant = () => {
  const { user } = usePrivy();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const grantKey = useCallback(
    async (params: KeyGrantParams): Promise<KeyGrantResult> => {
      if (!user?.wallet) {
        const error = "Wallet not connected";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem client per operation
        const walletClient = await createViemFromPrivyWallet(user.wallet);
        const publicClient = walletClient.extend(() => ({}));

        const userAddress = user.wallet.address as Address;

        // Check if user is lock manager
        const isLockManager = await publicClient.readContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        }) as boolean;

        if (!isLockManager) {
          throw new Error("User is not a lock manager");
        }

        // Grant key using the same purchase function but with special manager privileges
        const grantTx = await walletClient.writeContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [0n], // values (0 for free grant)
            [params.recipientAddress], // recipients
            [userAddress], // referrers (lock manager)
            params.keyManagers, // keyManagers
            ["0x"], // data
          ],
          value: 0n, // No payment required for manager grants
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: grantTx
        });

        log.info("Key grant successful", {
          transactionHash: grantTx,
          recipient: params.recipientAddress,
          lockAddress: params.lockAddress
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: grantTx,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Key grant failed";
        log.error("Key grant error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [user?.wallet]
  );

  return {
    grantKey,
    ...state,
  };
};
```

### Step 6: Update Main Hook Export
**File**: `/hooks/unlock/index.ts`

Add exports for new write operation hooks:

```typescript
// Add to existing exports
export { useKeyPurchase } from "./useKeyPurchase";
export { useDeployLock } from "./useDeployLock";
export { useDeployAdminLock } from "./useDeployAdminLock";
export { useLockManagerKeyGrant } from "./useLockManagerKeyGrant";

// Add composite hook for all write operations
export const useUnlockWriteOperations = () => ({
  keyPurchase: useKeyPurchase(),
  deployLock: useDeployLock(),
  keyGrant: useLockManagerKeyGrant(),
});

// Admin-specific operations (requires isAdmin prop)
export const useUnlockAdminOperations = ({ isAdmin }: { isAdmin: boolean }) => ({
  deployAdminLock: useDeployAdminLock({ isAdmin }),
});
```

### Step 7: Add Testing UI to Admin Debug Page
**File**: `/pages/test/admin-auth-debug.tsx`

Add comprehensive testing section:

```typescript
// Add after existing useUnlockOperations hook usage

// Admin detection using clean unlock hooks (prevents RPC hammering)
const { checkHasValidKey } = useHasValidKey();
const [isAdmin, setIsAdmin] = useState(false);
const { user } = usePrivy();

// Derive admin status externally
useEffect(() => {
  const checkAdmin = async () => {
    if (user?.wallet?.address && adminLockAddress) {
      const result = await checkHasValidKey(
        user.wallet.address as Address,
        adminLockAddress as Address
      );
      setIsAdmin(!!result?.isValid);
    }
  };
  checkAdmin();
}, [user?.wallet?.address, adminLockAddress, checkHasValidKey]);

// Hook usage with prop pattern
const writeOps = useUnlockWriteOperations();
const adminOps = useUnlockAdminOperations({ isAdmin });

const [testParams, setTestParams] = useState({
  lockAddress: '',
  recipientAddress: '',
  lockName: 'Test Lock',
  keyPrice: '0.01',
  expirationDuration: '365', // days
});

// Add to existing JSX, after read operations section:

{/* Write Operations Testing */}
<div className="border-t pt-6">
  <h3 className="text-lg font-semibold mb-4">Write Operations Testing</h3>

  {/* Test Parameters */}
  <div className="grid grid-cols-2 gap-4 mb-6">
    <input
      placeholder="Lock Address (for purchase/grant)"
      value={testParams.lockAddress}
      onChange={(e) => setTestParams(prev => ({ ...prev, lockAddress: e.target.value }))}
      className="border rounded px-3 py-2"
    />
    <input
      placeholder="Recipient Address (for grant)"
      value={testParams.recipientAddress}
      onChange={(e) => setTestParams(prev => ({ ...prev, recipientAddress: e.target.value }))}
      className="border rounded px-3 py-2"
    />
    <input
      placeholder="Lock Name"
      value={testParams.lockName}
      onChange={(e) => setTestParams(prev => ({ ...prev, lockName: e.target.value }))}
      className="border rounded px-3 py-2"
    />
    <input
      placeholder="Key Price (ETH)"
      value={testParams.keyPrice}
      onChange={(e) => setTestParams(prev => ({ ...prev, keyPrice: e.target.value }))}
      className="border rounded px-3 py-2"
    />
  </div>

  {/* Admin Status Display */}
  <div className="mb-4 p-3 bg-gray-50 rounded">
    <p className="text-sm">
      <strong>Admin Status:</strong> {isAdmin ? '✅ Admin Access' : '❌ Regular User'}
      {isAdmin && <span className="text-green-600 ml-2">(Can deploy admin-managed locks)</span>}
    </p>
  </div>

  {/* Operation Buttons */}
  <div className="flex gap-3 mb-4 flex-wrap">
    <button
      onClick={() => writeOps.deployLock.deployLock({
        name: testParams.lockName,
        expirationDuration: BigInt(Number(testParams.expirationDuration) * 24 * 60 * 60),
        tokenAddress: "0x0000000000000000000000000000000000000000", // ETH
        keyPrice: parseEther(testParams.keyPrice),
        maxNumberOfKeys: 1000n,
      })}
      disabled={writeOps.deployLock.isLoading}
      className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
    >
      {writeOps.deployLock.isLoading ? 'Deploying...' : 'Deploy User Lock'}
    </button>

    {isAdmin && (
      <button
        onClick={() => adminOps.deployAdminLock.deployAdminLock({
          name: testParams.lockName + ' (Admin)',
          expirationDuration: BigInt(Number(testParams.expirationDuration) * 24 * 60 * 60),
          tokenAddress: "0x0000000000000000000000000000000000000000", // ETH
          keyPrice: parseEther(testParams.keyPrice),
          maxNumberOfKeys: 1000n,
          isAdmin: true,
        })}
        disabled={adminOps.deployAdminLock.isLoading}
        className="bg-orange-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {adminOps.deployAdminLock.isLoading ? 'Deploying...' : 'Deploy Admin Lock'}
      </button>
    )}

    <button
      onClick={() => writeOps.keyPurchase.purchaseKey({
        lockAddress: testParams.lockAddress as Address,
      })}
      disabled={writeOps.keyPurchase.isLoading || !testParams.lockAddress}
      className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
    >
      {writeOps.keyPurchase.isLoading ? 'Purchasing...' : 'Purchase Key'}
    </button>

    <button
      onClick={() => writeOps.keyGrant.grantKey({
        lockAddress: testParams.lockAddress as Address,
        recipientAddress: testParams.recipientAddress as Address,
        keyManagers: [testParams.recipientAddress as Address],
      })}
      disabled={writeOps.keyGrant.isLoading || !testParams.lockAddress || !testParams.recipientAddress}
      className="bg-purple-500 text-white px-4 py-2 rounded disabled:opacity-50"
    >
      {writeOps.keyGrant.isLoading ? 'Granting...' : 'Grant Key'}
    </button>
  </div>

  {/* Operation Results */}
  <div className="space-y-3">
    {/* Error States */}
    {writeOps.deployLock.error && (
      <div className="bg-red-50 border border-red-200 rounded p-3">
        <strong>User Deploy Error:</strong> {writeOps.deployLock.error}
      </div>
    )}
    {isAdmin && adminOps.deployAdminLock.error && (
      <div className="bg-red-50 border border-red-200 rounded p-3">
        <strong>Admin Deploy Error:</strong> {adminOps.deployAdminLock.error}
      </div>
    )}
    {writeOps.keyPurchase.error && (
      <div className="bg-red-50 border border-red-200 rounded p-3">
        <strong>Purchase Error:</strong> {writeOps.keyPurchase.error}
      </div>
    )}
    {writeOps.keyGrant.error && (
      <div className="bg-red-50 border border-red-200 rounded p-3">
        <strong>Grant Error:</strong> {writeOps.keyGrant.error}
      </div>
    )}

    {/* Success States */}
    {writeOps.deployLock.isSuccess && (
      <div className="bg-green-50 border border-green-200 rounded p-3">
        <strong>✅ User Lock Deployed Successfully!</strong>
        <p className="text-sm text-gray-600 mt-1">You are the lock owner and manager</p>
      </div>
    )}
    {isAdmin && adminOps.deployAdminLock.isSuccess && (
      <div className="bg-green-50 border border-green-200 rounded p-3">
        <strong>✅ Admin Lock Deployed Successfully!</strong>
        <p className="text-sm text-gray-600 mt-1">Server wallet added as lock manager</p>
      </div>
    )}
    {writeOps.keyPurchase.isSuccess && (
      <div className="bg-green-50 border border-green-200 rounded p-3">
        <strong>✅ Key Purchased Successfully!</strong>
      </div>
    )}
    {writeOps.keyGrant.isSuccess && (
      <div className="bg-green-50 border border-green-200 rounded p-3">
        <strong>✅ Key Granted Successfully!</strong>
      </div>
    )}
  </div>
</div>
```

### Step 8: Migration Steps

1. **Create new hook files** following the patterns above
2. **Update type definitions** in `/hooks/unlock/types.ts`
3. **Add exports** to `/hooks/unlock/index.ts`
4. **Add testing UI** to admin debug page
5. **Test thoroughly** with different scenarios
6. **Gradual migration**: Replace `lockUtils.ts` usage throughout codebase
7. **Remove old file** once all references are updated

### Step 9: Testing Checklist

**User Lock Deployment:**
- [ ] Deploy user lock with ETH and ERC20 tokens
- [ ] Verify user is lock owner and manager
- [ ] Test simple deployment flow without additional transactions

**Admin Lock Deployment:**
- [ ] Test admin detection using `useHasValidKey` hook
- [ ] Deploy admin lock with server wallet as manager
- [ ] Verify server wallet can grant keys via API
- [ ] Test admin-only button visibility

**General Operations:**
- [ ] Purchase keys for self and others
- [ ] Grant keys as lock manager
- [ ] Handle error cases (insufficient funds, not manager, etc.)
- [ ] Verify no RPC hammering in browser tools
- [ ] Test on both testnet and mainnet
- [ ] Verify transaction receipts and event logs
- [ ] Test wallet disconnection scenarios

**Prop-Based Security:**
- [ ] Verify `isAdmin` prop prevents unauthorized admin operations
- [ ] Test admin status changes when wallet switches
- [ ] Confirm no internal RPC calls within hooks

## Server Wallet Integration Pattern

### API Endpoint Usage
The `useDeployAdminLock` hook integrates with the existing `/api/admin/server-wallet` endpoint:

```typescript
// Fetch server wallet address from API
const serverResponse = await fetch('/api/admin/server-wallet');
if (!serverResponse.ok) {
  throw new Error('Failed to fetch server wallet address');
}
const { serverWalletAddress } = await serverResponse.json();
```

### Factory Pattern Implementation
Following the existing `lockUtils.ts` pattern (lines 924-936):
1. **Factory as Initial Owner**: Factory address set as lock creator
2. **Add User Manager**: User deploying the lock becomes a manager
3. **Add Server Manager**: Server wallet becomes a manager for backend operations
4. **Factory Renounces**: Factory removes itself as manager

### Security Considerations
- Server wallet address not exposed to frontend
- Admin verification via `isAdmin` prop (derived from clean unlock hooks)
- Proper API endpoint protection with admin auth
- No internal RPC calls within hooks to prevent hammering

## Benefits of This Approach

1. **Clean Separation**: Each operation is a focused, testable hook
2. **Admin Distinction**: Clear separation between user and admin deployment patterns
3. **Type Safety**: Comprehensive TypeScript interfaces for both patterns
4. **Error Handling**: Consistent error states across operations
5. **Fresh Clients**: No persistence issues that caused RPC hammering
6. **Prop-Based Security**: Admin verification through props, not internal calls
7. **Testing**: Integrated UI for manual testing and validation
8. **Viem Integration**: Modern, efficient blockchain client
9. **Server Integration**: Seamless backend wallet management for admin locks
10. **Reusability**: Hooks can be used anywhere in the application
11. **Maintainability**: Clear, focused code that's easy to debug

This plan transforms the monolithic `lockUtils.ts` into a clean, hook-based architecture that prevents RPC hammering while providing powerful write operation capabilities for both user and admin-managed lock deployments.