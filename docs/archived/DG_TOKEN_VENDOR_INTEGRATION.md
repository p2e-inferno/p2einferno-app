# DGTokenVendor Integration Implementation

This document details the implementation of the `DGTokenVendor` integration into the P2E Inferno App. It includes the necessary ABIs, hooks, UI components, and verification logic.

## 1. ABI Definitions

Add the `DGTokenVendor` ABI to `lib/blockchain/shared/abi-definitions.ts` or a new file `lib/blockchain/shared/vendor-abi.ts`.

```typescript
// lib/blockchain/shared/vendor-abi.ts
// Minimal ABI subset for DGTokenVendor (Base Sepolia deployment)

export const DG_TOKEN_VENDOR_ABI = [
  // Core Read Functions
  {
    inputs: [],
    name: "getExchangeRate",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getFeeConfig",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "maxFeeBps", type: "uint256" },
          { internalType: "uint256", name: "buyFeeBps", type: "uint256" },
          { internalType: "uint256", name: "sellFeeBps", type: "uint256" },
          { internalType: "uint256", name: "rateChangeCooldown", type: "uint256" },
          { internalType: "uint256", name: "appChangeCooldown", type: "uint256" },
        ],
        internalType: "struct IDGTokenVendor.FeeConfig",
        name: "_feeConfig",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTokenConfig",
    outputs: [
      {
        components: [
          { internalType: "contract IERC20", name: "baseToken", type: "address" },
          { internalType: "contract IERC20", name: "swapToken", type: "address" },
          { internalType: "uint256", name: "exchangeRate", type: "uint256" },
        ],
        internalType: "struct IDGTokenVendor.TokenConfig",
        name: "_tokenConfig",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserState",
    outputs: [
      {
        components: [
          { internalType: "enum IDGTokenVendor.UserStage", name: "stage", type: "uint8" },
          { internalType: "uint256", name: "points", type: "uint256" },
          { internalType: "uint256", name: "fuel", type: "uint256" },
          { internalType: "uint256", name: "lastStage3MaxSale", type: "uint256" },
          { internalType: "uint256", name: "dailySoldAmount", type: "uint256" },
          { internalType: "uint256", name: "dailyWindowStart", type: "uint256" },
        ],
        internalType: "struct IDGTokenVendor.UserState",
        name: "_userState",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "enum IDGTokenVendor.UserStage", name: "_stage", type: "uint8" }],
    name: "getStageConfig",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "burnAmount", type: "uint256" },
          { internalType: "uint256", name: "upgradePointsThreshold", type: "uint256" },
          { internalType: "uint256", name: "upgradeFuelThreshold", type: "uint256" },
          { internalType: "uint256", name: "fuelRate", type: "uint256" },
          { internalType: "uint256", name: "pointsAwarded", type: "uint256" },
          { internalType: "uint256", name: "qualifyingBuyThreshold", type: "uint256" },
          { internalType: "uint256", name: "maxSellBps", type: "uint256" },
          { internalType: "uint256", name: "dailyLimitMultiplier", type: "uint256" },
        ],
        internalType: "struct IDGTokenVendor.StageConfig",
        name: "_stageConfig",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getStageConstants",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "maxSellCooldown", type: "uint256" },
          { internalType: "uint256", name: "dailyWindow", type: "uint256" },
          { internalType: "uint256", name: "minBuyAmount", type: "uint256" },
          { internalType: "uint256", name: "minSellAmount", type: "uint256" },
        ],
        internalType: "struct IDGTokenVendor.StageConstants",
        name: "_stageConstants",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "hasValidKey",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Core User Actions (Write Functions)
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "buyTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "amount", type: "uint256" }],
    name: "sellTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "lightUp",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "upgradeStage",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
```

## 2. Hooks Implementation

### `hooks/vendor/useDGMarket.ts`

```typescript
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { DG_TOKEN_VENDOR_ABI } from '@/lib/blockchain/shared/vendor-abi';

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGMarket() {
  const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { data: exchangeRate } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: 'getExchangeRate',
  });

  const { data: feeConfig } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: 'getFeeConfig',
  });

  const buyTokens = (amount: string) => {
    // Interpret `amount` as an integer amount in base token units.
    // In a production implementation you should use token decimals +
    // a helper like parseUnits to convert human-readable values.
    const parsedAmount = BigInt(amount);
    // The caller is responsible for ensuring the user has approved the vendor
    // contract to spend at least this much base token.
    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: 'buyTokens',
      args: [parsedAmount],
    });
  };

  const sellTokens = (amount: string) => {
    // Interpret `amount` as an integer DG token amount.
    const parsedAmount = BigInt(amount);
    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: 'sellTokens',
      args: [parsedAmount],
    });
  };

  return {
    exchangeRate,
    feeConfig,
    buyTokens,
    sellTokens,
    isPending: isWritePending || isConfirming,
    isSuccess: isConfirmed,
    hash
  };
}
```

### `hooks/vendor/useDGProfile.ts`

```typescript
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { DG_TOKEN_VENDOR_ABI } from '@/lib/blockchain/shared/vendor-abi';
import { useAccount } from 'wagmi';

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGProfile() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();

  const { data: userStateRaw, refetch: refetchState } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: 'getUserState',
    args: [address!],
    query: { enabled: !!address }
  });

  // Map the tuple result into a friendlier shape
  const userState = userStateRaw
    ? {
        stage: userStateRaw[0],
        points: userStateRaw[1],
        fuel: userStateRaw[2],
        lastStage3MaxSale: userStateRaw[3],
        dailySoldAmount: userStateRaw[4],
        dailyWindowStart: userStateRaw[5],
      }
    : undefined;

  const upgradeStage = () => {
    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: 'upgradeStage',
    });
  };

  return {
    userState,
    upgradeStage,
    refetchState,
    isPending,
    hash
  };
}
```

### `hooks/vendor/useDGLightUp.ts`

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { DG_TOKEN_VENDOR_ABI } from '@/lib/blockchain/shared/vendor-abi';

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGLightUp() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  const lightUp = () => {
    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: 'lightUp',
    });
  };

  return {
    lightUp,
    isPending,
    isSuccess,
    hash
  };
}
```

## 3. Quest System Extension (Strategy Pattern)

### `lib/quests/verification/types.ts`

```typescript
import { TaskType } from "@/lib/supabase/types";

export interface VerificationResult {
  success: boolean;
  error?: string;
  metadata?: any;
}

export interface VerificationStrategy {
  verify(
    taskType: TaskType,
    verificationData: any,
    userId: string,
    userAddress: string
  ): Promise<VerificationResult>;
}
```

### `lib/quests/verification/vendor-verification.ts`

```typescript
import { VerificationStrategy, VerificationResult } from "./types";
import { TaskType } from "@/lib/supabase/types";
import type { Address, PublicClient } from "viem";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export class VendorVerificationStrategy implements VerificationStrategy {
  constructor(private readonly client: PublicClient) {}

  async verify(
    taskType: TaskType,
    verificationData: any,
    userId: string,
    userAddress: string
  ): Promise<VerificationResult> {
    const { transactionHash, targetAmount, targetStage } = verificationData;

    if (!transactionHash && taskType !== 'vendor_level_up') {
      return { success: false, error: "Transaction hash required" };
    }

    try {
      switch (taskType) {
        case "vendor_buy":
        case "vendor_sell":
        case "vendor_light_up":
          return await this.verifyTransaction(transactionHash, taskType, userAddress);
        
        case "vendor_level_up":
          return await this.verifyLevel(userAddress, targetStage);
          
        default:
          return { success: false, error: "Unsupported vendor task type" };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async verifyTransaction(
    txHash: `0x${string}`,
    type: TaskType,
    user: string,
  ): Promise<VerificationResult> {
    const receipt = await this.client.getTransactionReceipt({ hash: txHash });
    
    // Verify interaction with Vendor contract
    if (receipt.to?.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()) {
      return { success: false, error: "Transaction not with Vendor contract" };
    }

    // Verify sender
    if (receipt.from.toLowerCase() !== user.toLowerCase()) {
      return { success: false, error: "Transaction sender mismatch" };
    }

    // Ideally, check for specific events or function selectors here
    // For MVP, successful execution on the contract is a strong signal
    if (receipt.status !== 'success') {
      return { success: false, error: "Transaction failed" };
    }

    return { success: true };
  }

  private async verifyLevel(
    user: string,
    targetStage: number,
  ): Promise<VerificationResult> {
    const userState = await this.client.readContract({
      address: VENDOR_ADDRESS as Address,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "getUserState",
      args: [user as `0x${string}`],
    });

    // userState follows the tuple layout defined in the ABI:
    // [stage, points, fuel, lastStage3MaxSale, dailySoldAmount, dailyWindowStart]
    const stage = (userState as any)[0] as number;

    if (stage >= targetStage) {
      return { success: true };
    }
    
    return { success: false, error: `Current stage ${stage} < Target ${targetStage}` };
  }
}
```

### `lib/quests/verification/registry.ts`

```typescript
import { TaskType } from "@/lib/supabase/types";
import { VerificationStrategy } from "./types";
import { VendorVerificationStrategy } from "./vendor-verification";
import { createPublicClient } from "@/lib/blockchain/shared/client-utils";

// Create a shared public client instance using the unified blockchain config
const publicClient = createPublicClient();

const strategies: Partial<Record<TaskType, VerificationStrategy>> = {
  vendor_buy: new VendorVerificationStrategy(publicClient),
  vendor_sell: new VendorVerificationStrategy(publicClient),
  vendor_light_up: new VendorVerificationStrategy(publicClient),
  vendor_level_up: new VendorVerificationStrategy(publicClient),
};

export function getVerificationStrategy(type: TaskType): VerificationStrategy | undefined {
  return strategies[type];
}
```

### `pages/api/quests/complete-task.ts` (Update Snippet)

```typescript
// ... imports
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import { checkWhitelistStatus } from "@/lib/gooddollar/identity-sdk";

// Inside handler...
    
    // Optional GoodDollar verification when quest requires it
    if (quest.requires_gooddollar_verification) {
      const userWallet = await getUserPrimaryWallet(supabase, effectiveUserId);
      if (!userWallet) {
        return res.status(400).json({ error: "Wallet not linked" });
      }

      const { isWhitelisted } = await checkWhitelistStatus(
        userWallet as `0x${string}`,
      );
      if (!isWhitelisted) {
        return res
          .status(400)
          .json({ error: "Quest requires identity-verified wallet" });
      }
    }

    // Strategy Pattern Verification for vendor-related tasks
    const strategy = getVerificationStrategy(task.task_type);
    if (strategy) {
      const userWallet = await getUserPrimaryWallet(supabase, effectiveUserId);
      if (!userWallet) return res.status(400).json({ error: "Wallet not linked" });

      const result = await strategy.verify(
        task.task_type,
        clientVerificationData,
        effectiveUserId,
        userWallet
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error || "Verification failed" });
      }
      
      // If successful, proceed to complete task...
    }
```

## 4. UI Components

### `components/vendor/VendorSwap.tsx`

```typescript
import { useState } from "react";
import { useDGMarket } from "@/hooks/vendor/useDGMarket";
import { useGoodDollarVerification } from "@/hooks/useGoodDollarVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function VendorSwap() {
  const { isWhitelisted } = useGoodDollarVerification();
  const { buyTokens, sellTokens, isPending } = useDGMarket();
  const [amount, setAmount] = useState("");

  if (!isWhitelisted) {
    return <div className="text-red-500">Verified users only</div>;
  }

  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-xl font-bold mb-4">DG Token Market</h3>
      <Input 
        value={amount} 
        onChange={(e) => setAmount(e.target.value)} 
        placeholder="Amount" 
        className="mb-4"
      />
      <div className="flex gap-4">
        <Button onClick={() => buyTokens(amount)} disabled={isPending}>
          Buy DG
        </Button>
        <Button onClick={() => sellTokens(amount)} disabled={isPending} variant="secondary">
          Sell DG
        </Button>
      </div>
    </div>
  );
}
```

### `pages/lobby/vendor.tsx`

```typescript
import Layout from "@/components/layout/Layout";
import VendorSwap from "@/components/vendor/VendorSwap";
import LevelUpCard from "@/components/vendor/LevelUpCard";
import LightUpButton from "@/components/vendor/LightUpButton";
import { useDGProfile } from "@/hooks/vendor/useDGProfile";

export default function VendorPage() {
  const { userState } = useDGProfile();

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-8">
        <header className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">DG Token Vendor</h1>
          <div className="text-right">
            <p className="text-gray-400">Current Stage</p>
            <p className="text-2xl text-flame-yellow">{userState?.stage || "Unknown"}</p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <VendorSwap />
          </div>
          <div className="space-y-6">
            <LightUpButton />
            <LevelUpCard />
          </div>
        </div>
      </div>
    </Layout>
  );
}
```

## 5. Admin UI Updates

### `components/admin/QuestForm.tsx` (Snippet)

```typescript
// Add to formData state
const [formData, setFormData] = useState({
  // ... existing fields
  requires_gooddollar_verification: quest?.requires_gooddollar_verification || false,
});

// Add Toggle in UI
<div className="flex items-center space-x-2">
  <Switch 
    checked={formData.requires_gooddollar_verification}
    onCheckedChange={(checked) => setFormData({...formData, requires_gooddollar_verification: checked})}
  />
  <Label>Requires verification</Label>
</div>
```

### `components/admin/QuestTaskForm.tsx` (Snippet)

```typescript
// Add to taskTypeOptions
{
  value: "vendor_buy",
  label: "Buy DG Tokens",
  icon: <Coins className="w-4 h-4" />,
  description: "User must buy DG tokens",
}
// ... add other vendor types
```
