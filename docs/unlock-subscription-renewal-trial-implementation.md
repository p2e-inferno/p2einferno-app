# Unlock Protocol: Subscription Renewal & Trial Granting Implementation Guide

This document provides ABIs, code snippets, and implementation plans for implementing subscription renewal and trial granting functionality in Unlock Protocol locks. It is designed as a prompt for an LLM to implement these features in a different codebase.

## Table of Contents

1. [Overview](#overview)
2. [Relevant ABI Definitions](#relevant-abi-definitions)
3. [Implemented Hooks (Code Snippets)](#implemented-hooks-code-snippets)
4. [Missing Implementations (Implementation Plans)](#missing-implementations-implementation-plans)
5. [Implementation Instructions for LLM](#implementation-instructions-for-llm)

---

## Overview

This guide covers two main use cases:

1. **Subscription Renewal**: Extending existing key subscriptions (paid or free)
2. **Trial Granting**: Granting users trial access to locks

### ⚠️ Important: Understanding Free Trials vs Refund Grace Period

**Key Distinction:**

1. **Granting Free Trials**: Use `grantKeys()` to grant keys with short expiration timestamps. This is how you actually give users free trial access.

2. **Refund Grace Period (`freeTrialLength`)**: This is a **refund policy setting**, not a trial granting mechanism. It defines how long after purchase a user can cancel and get a full refund.

**How They Work Together:**

```typescript
// Scenario 1: Grant a free trial (no payment required)
await grantKeys({
  recipients: ["0xUser..."],
  expirationTimestamps: [
    BigInt(Math.floor(Date.now() / 1000)) + 604800n // 7 days from now
  ],
  keyManagers: ["0xManager..."]
});

// Scenario 2: User purchases a key with refund grace period
await purchase({ ... });

// If freeTrialLength is set to 7 days:
// - User can cancel within 7 days for FULL refund
// - After 7 days, cancellation incurs refundPenaltyBasisPoints penalty
```

**The Protocol Does NOT Distinguish Between Granted and Purchased Keys:**

- Both `grantKeys()` and `purchase()` create the same type of NFT key
- Both have expiration timestamps
- The protocol treats them identically
- To track which keys were granted vs purchased, you need to:
  - Use hooks (`onGrantKeyHook`, `onKeyPurchaseHook`) to log events
  - Maintain off-chain records
  - Check transaction history (granted keys have $0 value transactions)

### 🔒 Security: Refunds on Granted Keys

**Important**: Users cannot get paid for keys they received for free.

- **Refund Calculation**: `cancelAndRefund()` calculates refunds based on the **actual amount paid** for the key, not the lock's `keyPrice`
- **Granted Keys**: If a key was granted via `grantKeys()` (no payment made), the refund amount is **$0**
- **Purchased Keys**: If a key was purchased, the refund is based on what was actually paid, minus any penalties

**Example**:

```typescript
// Lock price: 10 USDC
// Scenario 1: User purchases key for 10 USDC
await purchase({ value: parseUnits("10", 6) }); // Paid 10 USDC
await cancelAndRefund({ tokenId: 123n }); // Refund: ~10 USDC (minus penalty if applicable)

// Scenario 2: Manager grants key for free
await grantKeys({ recipients: ["0xUser..."], ... }); // Paid 0 USDC
await cancelAndRefund({ tokenId: 124n }); // Refund: 0 USDC (nothing was paid)
```

**Best Practice**: When granting free trial keys, consider:

1. Set the key manager to a trusted address (lock manager) to control refunds
2. Use `getCancelAndRefundValue(tokenId)` to check refund amount before allowing cancellation
3. Monitor granted keys separately from purchased keys using hooks

### Key Functions

**For Renewals:**

- `extend` - Paid extension (✅ Implemented)
- `renewMembershipFor` - Renewal for specific token (❌ Not implemented)
- `isRenewable` - Check if key can be renewed (❌ Not implemented)
- `grantKeyExtension` - Free extension by lock manager (✅ Implemented)

**For Trials:**

- `grantKeys` - Bulk grant keys with custom expiration (✅ Implemented) - **This is how you actually grant free trials**
- `freeTrialLength` - Read refund grace period configuration (❌ Not implemented) - **Used for refund logic, not granting trials**
- `updateRefundPenalty` - Configure refund grace period and penalty (❌ Not implemented) - **Sets refund policy, not trial granting**

**For Refunds (Security):**

- `getCancelAndRefundValue` - Check refund amount before cancellation (❌ Not implemented) - **Security: Returns $0 for granted keys**
- `cancelAndRefund` - Cancel key and get refund (❌ Not implemented) - **Refund based on actual payment, not key price**

---

## Relevant ABI Definitions

### Extracted from PublicLockV15.json

#### 1. `extend` - Extend Key Expiration (Paid)

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_value",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_referrer",
      "type": "address"
    },
    {
      "internalType": "bytes",
      "name": "_data",
      "type": "bytes"
    }
  ],
  "name": "extend",
  "outputs": [],
  "stateMutability": "payable",
  "type": "function"
}
```

#### 2. `grantKeyExtension` - Grant Key Extension (Free, Lock Manager Only)

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_duration",
      "type": "uint256"
    }
  ],
  "name": "grantKeyExtension",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 3. `grantKeys` - Bulk Grant Keys (Lock Manager Only)

```json
{
  "inputs": [
    {
      "internalType": "address[]",
      "name": "_recipients",
      "type": "address[]"
    },
    {
      "internalType": "uint256[]",
      "name": "_expirationTimestamps",
      "type": "uint256[]"
    },
    {
      "internalType": "address[]",
      "name": "_keyManagers",
      "type": "address[]"
    }
  ],
  "name": "grantKeys",
  "outputs": [
    {
      "internalType": "uint256[]",
      "name": "",
      "type": "uint256[]"
    }
  ],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 4. `renewMembershipFor` - Renew Membership (Not Implemented)

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_referrer",
      "type": "address"
    }
  ],
  "name": "renewMembershipFor",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 5. `isRenewable` - Check if Key is Renewable (Not Implemented)

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_referrer",
      "type": "address"
    }
  ],
  "name": "isRenewable",
  "outputs": [
    {
      "internalType": "bool",
      "name": "",
      "type": "bool"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

#### 6. `freeTrialLength` - Get Refund Grace Period (Not Implemented)

**Note**: This is NOT for granting trials. It defines the grace period during which users can cancel for a full refund. See the implementation plan section for details.

```json
{
  "inputs": [],
  "name": "freeTrialLength",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

#### 7. `updateRefundPenalty` - Update Refund Policy Configuration (Not Implemented)

**Note**: This configures the refund grace period and penalty, NOT trial granting. To grant free trials, use `grantKeys()` with short expiration timestamps.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_freeTrialLength",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_refundPenaltyBasisPoints",
      "type": "uint256"
    }
  ],
  "name": "updateRefundPenalty",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 8. `isLockManager` - Check Lock Manager Status (Helper)

```json
{
  "inputs": [
    {
      "internalType": "address",
      "name": "account",
      "type": "address"
    }
  ],
  "name": "isLockManager",
  "outputs": [
    {
      "internalType": "bool",
      "name": "",
      "type": "bool"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

#### 9. `getCancelAndRefundValue` - Get Refund Amount (Security Helper)

**Purpose**: Check the refund amount before allowing cancellation. Returns $0 for granted keys.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    }
  ],
  "name": "getCancelAndRefundValue",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "refund",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

#### 10. `cancelAndRefund` - Cancel Key and Get Refund

**Note**: Refund is based on actual payment amount, not key price. Granted keys refund $0.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    }
  ],
  "name": "cancelAndRefund",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

---

## Lock Configuration Update Functions

This section covers all functions available for updating lock configuration. Most of these functions require lock manager permissions.

### View Functions

#### 11. `expirationDuration` - Get Expiration Duration (View)

**Purpose**: Read-only function to get the current expiration duration for keys in the lock.

```json
{
  "inputs": [],
  "name": "expirationDuration",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}
```

### Core Configuration Update Functions

#### 12. `updateLockConfig` - Update Core Lock Configuration (Lock Manager Only)

**Purpose**: Update the core lock settings: expiration duration, maximum number of keys, and maximum keys per account.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_newExpirationDuration",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_maxNumberOfKeys",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_maxKeysPerAcccount",
      "type": "uint256"
    }
  ],
  "name": "updateLockConfig",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 13. `updateKeyPricing` - Update Key Price and Payment Token (Lock Manager Only)

**Purpose**: Update the key price and the payment token address.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_keyPrice",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_tokenAddress",
      "type": "address"
    }
  ],
  "name": "updateKeyPricing",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 14. `updateRefundPenalty` - Update Refund Policy Configuration (Lock Manager Only)

**Purpose**: Configure the refund grace period (`freeTrialLength`) and refund penalty. This sets the refund policy, not trial granting. To grant free trials, use `grantKeys()` instead.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_freeTrialLength",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_refundPenaltyBasisPoints",
      "type": "uint256"
    }
  ],
  "name": "updateRefundPenalty",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 15. `updateTransferFee` - Update Transfer Fee (Lock Manager Only)

**Purpose**: Update the transfer fee for key transfers.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_transferFeeBasisPoints",
      "type": "uint256"
    }
  ],
  "name": "updateTransferFee",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### Metadata & Identity Functions

#### 16. `setLockMetadata` - Update Lock Metadata (Lock Manager Only)

**Purpose**: Update the lock's name, symbol, and base token URI.

```json
{
  "inputs": [
    {
      "internalType": "string",
      "name": "_lockName",
      "type": "string"
    },
    {
      "internalType": "string",
      "name": "_lockSymbol",
      "type": "string"
    },
    {
      "internalType": "string",
      "name": "_baseTokenURI",
      "type": "string"
    }
  ],
  "name": "setLockMetadata",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 17. `setOwner` - Update Lock Owner (Lock Manager Only)

**Purpose**: Transfer ownership of the lock to a new address.

```json
{
  "inputs": [
    {
      "internalType": "address",
      "name": "account",
      "type": "address"
    }
  ],
  "name": "setOwner",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### Event Hooks Configuration

#### 18. `setEventHooks` - Configure Event Hooks (Lock Manager Only)

**Purpose**: Set custom hook addresses for various lock events. Hooks allow custom logic to be executed at specific points in the lock lifecycle.

```json
{
  "inputs": [
    {
      "internalType": "address",
      "name": "_onKeyPurchaseHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onKeyCancelHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onValidKeyHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onTokenURIHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onKeyTransferHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onKeyExtendHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onKeyGrantHook",
      "type": "address"
    },
    {
      "internalType": "address",
      "name": "_onHasRoleHook",
      "type": "address"
    }
  ],
  "name": "setEventHooks",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### Additional Configuration Functions

#### 19. `setGasRefundValue` - Update Gas Refund Value (Lock Manager Only)

**Purpose**: Set the gas refund value for key cancellations.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_refundValue",
      "type": "uint256"
    }
  ],
  "name": "setGasRefundValue",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 20. `setReferrerFee` - Update Referrer Fee (Lock Manager Only)

**Purpose**: Set the referrer fee for a specific referrer address.

```json
{
  "inputs": [
    {
      "internalType": "address",
      "name": "_referrer",
      "type": "address"
    },
    {
      "internalType": "uint256",
      "name": "_feeBasisPoint",
      "type": "uint256"
    }
  ],
  "name": "setReferrerFee",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### Individual Key Management Functions

#### 21. `setKeyExpiration` - Update Individual Key Expiration (Key Manager or Lock Manager)

**Purpose**: Update the expiration timestamp for a specific key.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "uint256",
      "name": "_newExpiration",
      "type": "uint256"
    }
  ],
  "name": "setKeyExpiration",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

#### 22. `setKeyManagerOf` - Update Key Manager (Key Manager or Lock Manager)

**Purpose**: Set or update the key manager for a specific key. The key manager has permissions to manage that specific key.

```json
{
  "inputs": [
    {
      "internalType": "uint256",
      "name": "_tokenId",
      "type": "uint256"
    },
    {
      "internalType": "address",
      "name": "_keyManager",
      "type": "address"
    }
  ],
  "name": "setKeyManagerOf",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}
```

### Summary of Lock Configuration Functions

| Function              | Purpose                          | Permission Required         |
| --------------------- | -------------------------------- | --------------------------- |
| `expirationDuration`  | View expiration duration         | None (view function)        |
| `updateLockConfig`    | Update core lock settings        | Lock Manager                |
| `updateKeyPricing`    | Update key price and token       | Lock Manager                |
| `updateRefundPenalty` | Configure refund policy          | Lock Manager                |
| `updateTransferFee`   | Update transfer fee              | Lock Manager                |
| `setLockMetadata`     | Update lock metadata             | Lock Manager                |
| `setOwner`            | Transfer lock ownership          | Lock Manager                |
| `setEventHooks`       | Configure event hooks            | Lock Manager                |
| `setGasRefundValue`   | Set gas refund value             | Lock Manager                |
| `setReferrerFee`      | Set referrer fee                 | Lock Manager                |
| `setKeyExpiration`    | Update individual key expiration | Key Manager or Lock Manager |
| `setKeyManagerOf`     | Update key manager               | Key Manager or Lock Manager |

**Note**: All write operations (non-view functions) require appropriate permissions. Lock managers can perform all configuration updates, while key managers can only manage their specific keys.

---

## Implemented Hooks (Code Snippets)

### 1. `useExtendKey` - Paid Key Extension

**File**: `hooks/unlock/useExtendKey.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ADDITIONAL_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import type { ExtendKeyParams, ExtendKeyResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:extend-key");

/**
 * Hook to extend a key's expiration by paying
 * This is a payable function - requires ETH or ERC20 tokens
 */
export const useExtendKey = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const extendKey = useCallback(
    async (params: ExtendKeyParams): Promise<ExtendKeyResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Create fresh viem clients
        const { walletClient, publicClient } = await createViemFromPrivyWallet(
          wallet
        );

        const userAddress = getAddress(wallet.address as Address);
        const walletAccount = walletClient.account ?? userAddress;
        const walletChain = walletClient.chain;

        let lockAddress: Address;

        try {
          lockAddress = getAddress(params.lockAddress);
        } catch (addressError) {
          throw new Error("Invalid lock address provided");
        }

        const referrer = params.referrer
          ? getAddress(params.referrer)
          : zeroAddress;
        const data = (params.data || "0x") as Hex;

        // Extend key
        const extendTx = await walletClient.writeContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "extend",
          args: [params.value, params.tokenId, referrer, data],
          value: params.value, // Send ETH value
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: extendTx,
        });

        log.info("Key extended successfully", {
          transactionHash: extendTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
          value: params.value.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: extendTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to extend key";
        log.error("Extend key error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    extendKey,
    ...state,
  };
};
```

**TypeScript Types**:

```typescript
export interface ExtendKeyParams {
  lockAddress: Address;
  value: bigint;
  tokenId: bigint;
  referrer?: Address;
  data?: `0x${string}`;
}

export interface ExtendKeyResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}
```

### 2. `useGrantKeyExtension` - Free Key Extension (Lock Manager)

**File**: `hooks/unlock/useGrantKeyExtension.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ADDITIONAL_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type {
  GrantKeyExtensionParams,
  GrantKeyExtensionResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:grant-key-extension");

/**
 * Hook for lock managers to grant key extensions for free
 * Requires the connected wallet to be a lock manager
 * Different from extendKey which requires payment
 */
export const useGrantKeyExtension = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const grantKeyExtension = useCallback(
    async (
      params: GrantKeyExtensionParams
    ): Promise<GrantKeyExtensionResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Create fresh viem clients
        const { walletClient, publicClient } = await createViemFromPrivyWallet(
          wallet
        );

        const userAddress = getAddress(wallet.address as Address);
        const walletAccount = walletClient.account ?? userAddress;
        const walletChain = walletClient.chain;

        let lockAddress: Address;

        try {
          lockAddress = getAddress(params.lockAddress);
        } catch (addressError) {
          throw new Error("Invalid lock address provided");
        }

        // Check if user is lock manager
        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as unknown as boolean;

        if (!isLockManager) {
          throw new Error("You must be a lock manager to grant key extensions");
        }

        // Grant key extension
        const grantTx = await walletClient.writeContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "grantKeyExtension",
          args: [params.tokenId, params.duration],
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: grantTx,
        });

        log.info("Key extension granted successfully", {
          transactionHash: grantTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
          duration: params.duration.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: grantTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to grant key extension";
        log.error("Grant key extension error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    grantKeyExtension,
    ...state,
  };
};
```

**TypeScript Types**:

```typescript
export interface GrantKeyExtensionParams {
  lockAddress: Address;
  tokenId: bigint;
  duration: bigint;
}

export interface GrantKeyExtensionResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}
```

### 3. `useGrantKeys` - Bulk Grant Keys (Lock Manager)

**File**: `hooks/unlock/useGrantKeys.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ADDITIONAL_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type { GrantKeysParams, GrantKeysResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:grant-keys");

/**
 * Hook for bulk granting keys to multiple recipients
 * Requires the connected wallet to be a lock manager
 * Different from useLockManagerKeyGrant which uses purchase mechanism for single keys
 */
export const useGrantKeys = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const grantKeys = useCallback(
    async (params: GrantKeysParams): Promise<GrantKeysResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Create fresh viem clients
        const { walletClient, publicClient } = await createViemFromPrivyWallet(
          wallet
        );

        const userAddress = getAddress(wallet.address as Address);
        const walletAccount = walletClient.account ?? userAddress;
        const walletChain = walletClient.chain;

        let lockAddress: Address;

        try {
          lockAddress = getAddress(params.lockAddress);
        } catch (addressError) {
          throw new Error("Invalid lock address provided");
        }

        // Validate arrays have same length
        if (
          params.recipients.length !== params.expirationTimestamps.length ||
          params.recipients.length !== params.keyManagers.length
        ) {
          throw new Error(
            "Recipients, expiration timestamps, and key managers arrays must have the same length"
          );
        }

        // Check if user is lock manager
        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as unknown as boolean;

        if (!isLockManager) {
          throw new Error("You must be a lock manager to grant keys");
        }

        // Grant keys
        const grantTx = await walletClient.writeContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "grantKeys",
          args: [
            params.recipients,
            params.expirationTimestamps,
            params.keyManagers,
          ],
          account: walletAccount,
          chain: walletChain,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: grantTx,
        });

        // Extract token IDs from logs if available
        const tokenIds: bigint[] = [];
        for (const log of receipt.logs) {
          if (log.topics[0] && log.topics.length >= 3) {
            try {
              const tokenId = BigInt(log.topics[3] || "0");
              if (tokenId > 0n) {
                tokenIds.push(tokenId);
              }
            } catch (e) {
              // Skip invalid logs
            }
          }
        }

        log.info("Keys granted successfully", {
          transactionHash: grantTx,
          lockAddress,
          recipientsCount: params.recipients.length,
          tokenIds: tokenIds.map((id) => id.toString()),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: grantTx,
          tokenIds: tokenIds.length > 0 ? tokenIds : undefined,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to grant keys";
        log.error("Grant keys error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    grantKeys,
    ...state,
  };
};
```

**TypeScript Types**:

```typescript
export interface GrantKeysParams {
  lockAddress: Address;
  recipients: Address[];
  expirationTimestamps: bigint[];
  keyManagers: Address[];
}

export interface GrantKeysResult {
  success: boolean;
  transactionHash?: string;
  tokenIds?: bigint[];
  error?: string;
}
```

### Shared Types

```typescript
export interface OperationState {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
}
```

---

## Missing Implementations (Implementation Plans)

### 1. `useRenewMembershipFor` - Renew Membership Hook

**Purpose**: Renew a membership for a specific tokenId. This is different from `extend` as it uses the lock's renewal mechanism.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useRenewMembershipFor.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface RenewMembershipParams {
  lockAddress: Address;
  tokenId: bigint;
  referrer?: Address;
}

export interface RenewMembershipResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}
```

3. **Hook Structure**:

   - Use same pattern as `useExtendKey` but without `value` parameter
   - Call `renewMembershipFor(tokenId, referrer)` instead of `extend`
   - No payment required (nonpayable function)
   - Should check if key is renewable first (optional but recommended)

4. **Key Differences from `extend`**:

   - No `value` parameter (nonpayable)
   - Uses `renewMembershipFor` function name
   - May require lock to be configured as renewable
   - Referrer is optional but should default to zero address

5. **Error Handling**:
   - Check for `NON_RENEWABLE_LOCK` error
   - Check for `NOT_READY_FOR_RENEWAL` error
   - Check for `NO_SUCH_KEY` error

**Example Usage**:

```typescript
const { renewMembership, isLoading, error } = useRenewMembershipFor();

await renewMembership({
  lockAddress: "0x...",
  tokenId: 123n,
  referrer: "0x...", // optional
});
```

### 2. `useIsRenewable` - Check Renewability Hook

**Purpose**: Read-only hook to check if a key can be renewed.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useIsRenewable.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface IsRenewableParams {
  lockAddress: Address;
  tokenId: bigint;
  referrer?: Address;
}

export interface IsRenewableResult {
  isRenewable: boolean;
  error?: string;
}
```

3. **Hook Structure**:

   - Use React Query or similar for caching
   - Read-only operation (view function)
   - Should handle errors gracefully
   - Can be used as a pre-check before calling `renewMembershipFor`

4. **Implementation Pattern**:
   - Use `useQuery` or `useEffect` for reactive updates
   - Call `isRenewable(tokenId, referrer)` on the contract
   - Return boolean result

**Example Usage**:

```typescript
const { data: isRenewable, isLoading } = useIsRenewable({
  lockAddress: "0x...",
  tokenId: 123n,
  referrer: "0x...", // optional
});
```

### 3. `useFreeTrialLength` - Get Free Trial Length Hook

**⚠️ IMPORTANT CLARIFICATION: How `freeTrialLength` Actually Works**

**`freeTrialLength` is NOT used to grant free trials.** It's used in the **refund/cancellation logic**:

1. **Purpose**: `freeTrialLength` defines a grace period during which users can cancel their membership and receive a **full refund** (no penalty). This is useful for offering risk-free trial periods.

2. **How It Works**:

   - When a user calls `cancelAndRefund()` within the `freeTrialLength` period, they get a full refund **of what they paid**
   - After the `freeTrialLength` period expires, cancellations are subject to `refundPenaltyBasisPoints`
   - **Important**: Refunds are based on actual payment amount, not the lock's `keyPrice`
   - If a key was granted for free (via `grantKeys()`), the refund is **$0** (nothing was paid)
   - This applies to **all keys** (both purchased and granted), but granted keys have $0 refund value

3. **Granting Actual Free Trials**:

   - Free trials are granted using `grantKeys()` with a short expiration timestamp
   - There is **no built-in distinction** between granted keys (trials) and purchased keys
   - Both result in the same NFT key with an expiration timestamp
   - To track which keys were granted vs purchased, you'd need to use hooks like `onGrantKeyHook` and `onKeyPurchaseHook`

4. **Typical Workflow**:

   ```typescript
   // 1. Lock manager sets freeTrialLength (e.g., 7 days)
   await updateRefundPenalty({
     freeTrialLength: 604800n, // 7 days in seconds
     refundPenaltyBasisPoints: 1000n, // 10% penalty after trial
   });

   // 2. User purchases a key (or manager grants one)
   await purchase({ ... }); // or grantKeys({ ... })

   // 3. Within freeTrialLength period, user can cancel for full refund
   await cancelAndRefund({ tokenId: 123n }); // Full refund if within trial period
   ```

**Purpose**: Read-only hook to get the configured free trial length (refund grace period) for a lock.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useFreeTrialLength.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface FreeTrialLengthParams {
  lockAddress: Address;
}

export interface FreeTrialLengthResult {
  freeTrialLength: bigint; // in seconds - grace period for full refunds
  error?: string;
}
```

3. **Hook Structure**:

   - Read-only operation (view function)
   - Returns trial length in seconds (refund grace period)
   - Useful for displaying refund policy to users
   - Can be used to calculate if a key is still within the refund grace period

4. **Implementation Pattern**:
   - Use `useQuery` or `useEffect` for reactive updates
   - Call `freeTrialLength()` on the contract
   - Return bigint value

**Example Usage**:

```typescript
const { data: trialLength, isLoading } = useFreeTrialLength({
  lockAddress: "0x...",
});

// Check if a key is still within the refund grace period
const keyPurchaseTime = await getKeyPurchaseTime(tokenId);
const currentTime = BigInt(Math.floor(Date.now() / 1000));
const timeSincePurchase = currentTime - keyPurchaseTime;
const isWithinTrialPeriod = timeSincePurchase <= (trialLength || 0n);

if (isWithinTrialPeriod) {
  console.log("You can cancel for a full refund");
} else {
  console.log("Cancellation will incur a penalty");
}
```

### 4. `useUpdateRefundPenalty` - Update Refund Policy Configuration Hook

**Purpose**: Lock manager hook to configure the refund grace period (`freeTrialLength`) and refund penalty. This sets the refund policy, not trial granting. To grant free trials, use `grantKeys()` instead.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useUpdateRefundPenalty.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface UpdateRefundPenaltyParams {
  lockAddress: Address;
  freeTrialLength: bigint; // in seconds
  refundPenaltyBasisPoints: bigint; // e.g., 1000 = 10%
}

export interface UpdateRefundPenaltyResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}
```

3. **Hook Structure**:

   - Requires lock manager role (check with `isLockManager`)
   - Write operation (nonpayable)
   - Updates refund grace period (`freeTrialLength`) and refund penalty
   - Should validate basis points (0-10000 range)
   - **Note**: This does NOT grant trials - it only sets the refund policy

4. **Implementation Pattern**:

   - Follow same pattern as `useGrantKeyExtension`
   - Check lock manager status before proceeding
   - Call `updateRefundPenalty(freeTrialLength, refundPenaltyBasisPoints)`
   - Wait for transaction receipt

5. **Validation**:
   - `refundPenaltyBasisPoints` should be between 0 and 10000 (0% to 100%)
   - `freeTrialLength` should be non-negative

**Example Usage**:

```typescript
const { updateRefundPenalty, isLoading, error } = useUpdateRefundPenalty();

await updateRefundPenalty({
  lockAddress: "0x...",
  freeTrialLength: 2592000n, // 30 days in seconds
  refundPenaltyBasisPoints: 1000n, // 10%
});
```

### 5. `useGetCancelAndRefundValue` - Get Refund Amount Hook

**Purpose**: Read-only hook to check the refund amount for a key before allowing cancellation. Essential for security to prevent refunding granted keys.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useGetCancelAndRefundValue.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface GetCancelAndRefundValueParams {
  lockAddress: Address;
  tokenId: bigint;
}

export interface GetCancelAndRefundValueResult {
  refundAmount: bigint; // Refund amount in wei/token units
  error?: string;
}
```

3. **Hook Structure**:

   - Read-only operation (view function)
   - Returns refund amount (will be 0 for granted keys)
   - Should be called before allowing cancellation in UI
   - Use React Query or similar for caching

4. **Implementation Pattern**:
   - Use `useQuery` or `useEffect` + `useState` for reactive updates
   - Call `getCancelAndRefundValue(tokenId)` on the contract
   - Return bigint value
   - Handle errors gracefully

**Example Usage**:

```typescript
const { data: refundAmount, isLoading } = useGetCancelAndRefundValue({
  lockAddress: "0x...",
  tokenId: 123n,
});

if (refundAmount === 0n) {
  console.log("This key was granted for free, no refund available");
} else {
  console.log(`Refund amount: ${formatUnits(refundAmount, 6)} USDC`);
}
```

### 6. `useCancelAndRefund` - Cancel Key and Get Refund Hook

**Purpose**: Hook to cancel a key and receive a refund. Should always check refund amount first using `useGetCancelAndRefundValue`.

**Implementation Plan**:

1. **Create Hook File**: `hooks/unlock/useCancelAndRefund.ts`

2. **Add Types** (to `hooks/unlock/types.ts`):

```typescript
export interface CancelAndRefundParams {
  lockAddress: Address;
  tokenId: bigint;
}

export interface CancelAndRefundResult {
  success: boolean;
  transactionHash?: string;
  refundAmount?: bigint; // Actual refund received
  error?: string;
}
```

3. **Hook Structure**:

   - Write operation (nonpayable)
   - Should validate refund amount before proceeding (optional but recommended)
   - Cancels the key and burns the NFT
   - Refunds based on actual payment, not key price
   - Returns transaction hash and refund amount

4. **Implementation Pattern**:

   - Follow same pattern as `useExtendKey`
   - Check wallet connection
   - Validate lock address
   - Call `cancelAndRefund(tokenId)`
   - Wait for transaction receipt
   - Extract refund amount from events if possible

5. **Security Considerations**:
   - Always check `getCancelAndRefundValue` first
   - Warn user if refund is $0 (granted key)
   - Consider checking if key is within `freeTrialLength` period for full refund

**Example Usage**:

```typescript
const { cancelAndRefund, isLoading, error } = useCancelAndRefund();
const { data: refundAmount } = useGetCancelAndRefundValue({
  lockAddress: "0x...",
  tokenId: 123n,
});

const handleCancel = async () => {
  // Check refund amount first
  if (refundAmount === 0n) {
    alert("This key was granted for free, no refund available");
    return;
  }

  // Proceed with cancellation
  const result = await cancelAndRefund({
    lockAddress: "0x...",
    tokenId: 123n,
  });

  if (result.success) {
    console.log(`Refunded: ${formatUnits(result.refundAmount || 0n, 6)} USDC`);
  }
};
```

**Complete Workflow Example**:

```typescript
// Complete refund workflow with security checks
const RefundKeyComponent = ({ lockAddress, tokenId }: Props) => {
  const { data: refundAmount, isLoading: checkingRefund } =
    useGetCancelAndRefundValue({ lockAddress, tokenId });
  const { cancelAndRefund, isLoading: cancelling } = useCancelAndRefund();
  const { data: trialLength } = useFreeTrialLength({ lockAddress });

  const handleRefund = async () => {
    // Step 1: Check if refund is possible
    if (!refundAmount || refundAmount === 0n) {
      alert("This key was granted for free, no refund available");
      return;
    }

    // Step 2: Check if within trial period (optional)
    const keyInfo = await getKeyInfo(tokenId);
    const timeSincePurchase = Date.now() / 1000 - Number(keyInfo.purchaseTime);
    const isWithinTrial =
      trialLength && timeSincePurchase <= Number(trialLength);

    const refundType = isWithinTrial ? "full" : "partial (with penalty)";
    const confirmed = confirm(
      `Cancel key and receive ${formatUnits(
        refundAmount,
        6
      )} USDC (${refundType} refund)?`
    );

    if (!confirmed) return;

    // Step 3: Execute cancellation
    const result = await cancelAndRefund({ lockAddress, tokenId });

    if (result.success) {
      toast.success(
        `Refunded ${formatUnits(result.refundAmount || 0n, 6)} USDC`
      );
    }
  };

  return (
    <button onClick={handleRefund} disabled={checkingRefund || cancelling}>
      {checkingRefund
        ? "Checking..."
        : refundAmount === 0n
        ? "No Refund Available"
        : `Cancel & Refund ${formatUnits(refundAmount, 6)} USDC`}
    </button>
  );
};
```

---

## Implementation Instructions for LLM

### Prerequisites

Before implementing, ensure you have:

1. **Wallet Integration**: A wallet connection system (e.g., Privy, Wagmi, Web3Modal)
2. **Viem/Ethers Setup**: Blockchain interaction library configured
3. **Type Definitions**: TypeScript types for addresses, bigints, etc.
4. **ABI Management**: System for managing contract ABIs
5. **Error Handling**: Consistent error handling patterns
6. **Logging**: Logging utility for debugging

### Step-by-Step Implementation

#### Step 1: Add ABI Definitions

Add the missing ABI functions to your ABI definitions file:

```typescript
// Add to your ABI definitions
export const RENEWAL_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "_tokenId", type: "uint256" },
      { internalType: "address", name: "_referrer", type: "address" },
    ],
    name: "renewMembershipFor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_tokenId", type: "uint256" },
      { internalType: "address", name: "_referrer", type: "address" },
    ],
    name: "isRenewable",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "freeTrialLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_freeTrialLength", type: "uint256" },
      {
        internalType: "uint256",
        name: "_refundPenaltyBasisPoints",
        type: "uint256",
      },
    ],
    name: "updateRefundPenalty",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Security: Check refund amount before cancellation
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "getCancelAndRefundValue",
    outputs: [{ internalType: "uint256", name: "refund", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Cancel key and get refund (refund based on actual payment, not key price)
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "cancelAndRefund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
```

#### Step 2: Add TypeScript Types

Add the type definitions to your types file:

```typescript
// Renewal Types
export interface RenewMembershipParams {
  lockAddress: Address;
  tokenId: bigint;
  referrer?: Address;
}

export interface RenewMembershipResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Is Renewable Types
export interface IsRenewableParams {
  lockAddress: Address;
  tokenId: bigint;
  referrer?: Address;
}

export interface IsRenewableResult {
  isRenewable: boolean;
  error?: string;
}

// Free Trial Length Types
export interface FreeTrialLengthParams {
  lockAddress: Address;
}

export interface FreeTrialLengthResult {
  freeTrialLength: bigint;
  error?: string;
}

// Update Refund Penalty Types
export interface UpdateRefundPenaltyParams {
  lockAddress: Address;
  freeTrialLength: bigint;
  refundPenaltyBasisPoints: bigint;
}

export interface UpdateRefundPenaltyResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Get Cancel And Refund Value Types
export interface GetCancelAndRefundValueParams {
  lockAddress: Address;
  tokenId: bigint;
}

export interface GetCancelAndRefundValueResult {
  refundAmount: bigint;
  error?: string;
}

// Cancel And Refund Types
export interface CancelAndRefundParams {
  lockAddress: Address;
  tokenId: bigint;
}

export interface CancelAndRefundResult {
  success: boolean;
  transactionHash?: string;
  refundAmount?: bigint;
  error?: string;
}
```

#### Step 3: Implement Hooks

Follow the patterns from the implemented hooks:

1. **For Write Operations** (`useRenewMembershipFor`, `useUpdateRefundPenalty`):

   - Use `useState` for operation state
   - Use `useCallback` for the main function
   - Check wallet connection
   - Validate inputs
   - Check permissions (for lock manager functions)
   - Execute contract call
   - Wait for transaction receipt
   - Update state and return result

2. **For Read Operations** (`useIsRenewable`, `useFreeTrialLength`):
   - Use `useQuery` (React Query) or `useEffect` + `useState`
   - Handle loading and error states
   - Cache results appropriately
   - Return data in a consistent format

#### Step 4: Error Handling

Implement consistent error handling:

```typescript
// Common error patterns
try {
  // Contract call
} catch (error: any) {
  // Check for specific contract errors
  if (error.message?.includes("NON_RENEWABLE_LOCK")) {
    return { success: false, error: "This lock does not support renewals" };
  }
  if (error.message?.includes("NOT_READY_FOR_RENEWAL")) {
    return { success: false, error: "Key is not ready for renewal yet" };
  }
  if (error.message?.includes("NO_SUCH_KEY")) {
    return { success: false, error: "Key does not exist" };
  }
  if (error.message?.includes("ONLY_LOCK_MANAGER")) {
    return {
      success: false,
      error: "Only lock managers can perform this action",
    };
  }

  // Generic error
  const errorMsg = error.message || "Operation failed";
  log.error("Operation error", { error, params });
  return { success: false, error: errorMsg };
}
```

#### Step 5: Testing Considerations

When implementing, consider:

1. **Unit Tests**: Test hook logic with mocked contract calls
2. **Integration Tests**: Test with actual contract interactions on testnet
3. **Error Cases**: Test all error scenarios
4. **Edge Cases**: Test with zero addresses, invalid token IDs, etc.
5. **Permission Checks**: Verify lock manager checks work correctly

#### Step 6: Export Hooks

Add exports to your index file:

```typescript
export { useRenewMembershipFor } from "./useRenewMembershipFor";
export { useIsRenewable } from "./useIsRenewable";
export { useFreeTrialLength } from "./useFreeTrialLength";
export { useUpdateRefundPenalty } from "./useUpdateRefundPenalty";
export { useGetCancelAndRefundValue } from "./useGetCancelAndRefundValue";
export { useCancelAndRefund } from "./useCancelAndRefund";
```

### Common Patterns to Follow

1. **Wallet Connection Check**:

```typescript
if (!wallet) {
  const error = "Wallet not connected";
  setState((prev) => ({ ...prev, error }));
  return { success: false, error };
}
```

2. **Address Validation**:

```typescript
let lockAddress: Address;
try {
  lockAddress = getAddress(params.lockAddress);
} catch (addressError) {
  throw new Error("Invalid lock address provided");
}
```

3. **Lock Manager Check**:

```typescript
const isLockManager = (await publicClient.readContract({
  address: lockAddress,
  abi: LOCK_ABI,
  functionName: "isLockManager",
  args: [userAddress],
})) as unknown as boolean;

if (!isLockManager) {
  throw new Error("You must be a lock manager to perform this action");
}
```

4. **Transaction Waiting**:

```typescript
const receipt = await publicClient.waitForTransactionReceipt({
  hash: transactionHash,
});
```

### Integration with Existing Code

When integrating into a different codebase:

1. **Adapt Wallet Integration**: Replace `usePrivyWriteWallet` with your wallet hook
2. **Adapt Client Creation**: Replace `createViemFromPrivyWallet` with your client creation function
3. **Adapt ABI Source**: Use your ABI management system
4. **Adapt Logging**: Use your logging utility
5. **Maintain Patterns**: Keep the same error handling and state management patterns

### Example: Complete `useRenewMembershipFor` Implementation

```typescript
"use client";

import { useCallback, useState } from "react";
import { useWallet } from "./useWallet"; // Your wallet hook
import { createClient } from "./client"; // Your client creation
import { LOCK_ABI } from "./abis"; // Your ABI
import { getLogger } from "./logger"; // Your logger
import { getAddress, zeroAddress, type Address } from "viem";
import type {
  RenewMembershipParams,
  RenewMembershipResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:renew-membership");

export const useRenewMembershipFor = () => {
  const wallet = useWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const renewMembership = useCallback(
    async (params: RenewMembershipParams): Promise<RenewMembershipResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        const { walletClient, publicClient } = await createClient(wallet);
        const userAddress = getAddress(wallet.address as Address);
        const lockAddress = getAddress(params.lockAddress);
        const referrer = params.referrer
          ? getAddress(params.referrer)
          : zeroAddress;

        // Optional: Check if renewable first
        const isRenewable = await publicClient.readContract({
          address: lockAddress,
          abi: LOCK_ABI,
          functionName: "isRenewable",
          args: [params.tokenId, referrer],
        });

        if (!isRenewable) {
          throw new Error("This key cannot be renewed");
        }

        const tx = await walletClient.writeContract({
          address: lockAddress,
          abi: LOCK_ABI,
          functionName: "renewMembershipFor",
          args: [params.tokenId, referrer],
          account: walletClient.account ?? userAddress,
        });

        await publicClient.waitForTransactionReceipt({ hash: tx });

        log.info("Membership renewed successfully", {
          transactionHash: tx,
          lockAddress,
          tokenId: params.tokenId.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: tx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to renew membership";
        log.error("Renew membership error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    renewMembership,
    ...state,
  };
};
```

---

## Summary

This guide provides:

1. ✅ **Complete ABI definitions** for all renewal and trial functions
2. ✅ **Working code examples** from implemented hooks
3. ✅ **Detailed implementation plans** for missing hooks
4. ✅ **Step-by-step instructions** for LLM implementation
5. ✅ **Common patterns and best practices**

### Key Takeaways

- **To Grant Free Trials**: Use `grantKeys()` with short expiration timestamps
- **`freeTrialLength` is for Refunds**: It defines the grace period for full refunds, not trial granting
- **No Built-in Distinction**: The protocol doesn't differentiate between granted and purchased keys - use hooks or off-chain tracking if needed
- **Refund Policy**: `updateRefundPenalty()` sets how long users can cancel for full refund vs penalty
- **🔒 Security**: Granted keys cannot be refunded for money - refunds are based on actual payment amount ($0 for free keys)

### Security Best Practices

1. **Check Refund Value Before Cancellation**:

   ```typescript
   const refundAmount = await getCancelAndRefundValue(tokenId);
   if (refundAmount === 0n) {
     // Key was granted for free, no refund possible
     return;
   }
   ```

2. **Set Key Manager for Granted Keys**: When granting keys, set the key manager to a trusted address to control refunds

3. **Monitor Granted vs Purchased Keys**: Use hooks to track which keys were granted vs purchased

4. **Validate Before Refund**: Always check `getCancelAndRefundValue()` before processing refunds in your UI

Use this document as a reference when implementing subscription renewal and trial granting features in your Unlock Protocol integration.
