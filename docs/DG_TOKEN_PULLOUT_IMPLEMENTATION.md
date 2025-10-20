# DG Token Withdrawal Feature - Implementation Plan

**Feature Name:** DG_TOKEN_PULLOUT_FEATURE
**Status:** Planning
**Last Updated:** 2025-10-20

## Overview

Ability for users to withdraw DG tokens earned from the app. Currently, earnings are stored in the database as XP (experience points). This feature implements a secure claim process whereby the server wallet transfers DG tokens to users at a 1:1 XP-to-DG rate.

### Security & Access Control

- **EIP712 Typed Signatures**: Users sign typed messages client-side for additional security
- **Unlock Protocol Gating**: Uses `NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS` for access control
- **Replay Attack Prevention**: Nonce-based signature validation
- **Signature Expiry**: Time-bound signatures (default: 15 minutes)

### Design Principles

- **Simple & Modular**: Core functionality with clean separation of concerns
- **Scalable**: Easy to add limits, cooldowns, gamification features
- **Additive**: Does not affect existing functionality
- **Robust**: Error handling and retry mechanisms throughout
- **Function-Based**: Pure functions that accept blockchain clients as parameters
- **RPC Efficient**: Creates clients only when needed and allows connections to close naturally
- **Testable**: Easy to mock dependencies for unit testing
- **Consistent with App**: Follows the same pattern used in other API endpoints

---

## Current State Analysis

### What Already Exists ✅

1. **XP Storage**: `user_profiles.experience_points` (INTEGER) - ready to use
2. **XP Services**: `SupabaseXPUpdater` in `lib/checkin/xp/updater.ts` with methods to get/update XP
3. **Server Wallet**: `LOCK_MANAGER_PRIVATE_KEY` infrastructure fully set up
4. **ERC20 Support**: `ERC20_ABI` ready in `lib/blockchain/shared/abi-definitions.ts`
5. **Wallet Client**: `createWalletClientUnified()` for server-side transactions
6. **Admin Auth**: `withAdminAuth` middleware (optional - may not need for this feature)
7. **Logging**: Standard logger via `getLogger(module)`
8. **Grant Pattern**: `grant-key-service.ts` shows retry logic and error handling patterns

### What Needs to Be Built 🔨

1. **EIP712 signature verification** (no existing implementation)
2. **DG token transfer service**
3. **Withdrawal orchestration service**
4. **API endpoint** `/api/token/withdraw`
5. **Database schema** for withdrawal tracking
6. **Client components** and hooks
7. **Environment variables** for DG token config

---

## Architecture

### High-Level Flow

```
┌─────────────┐    EIP712 Signature    ┌──────────────┐
│   Client    │ ──────────────────────> │  API Route   │
│             │ <────────────────────── │  /withdraw   │
└─────────────┘    Tx Hash/Error        └──────┬───────┘
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ Withdrawal       │
                                    │ Orchestrator     │
                                    │ Service          │
                                    └────────┬─────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    ▼                        ▼                        ▼
            ┌───────────────┐      ┌─────────────────┐     ┌──────────────┐
            │ EIP712        │      │ Balance         │     │ DG Transfer  │
            │ Verification  │      │ Service         │     │ Service      │
            └───────────────┘      └─────────────────┘     └──────────────┘
                    │                        │                        │
                    ▼                        ▼                        ▼
            Verify Signature        Update XP DB          Send DG Tokens
```

### Module Structure

```
lib/token-withdrawal/
├── eip712/
│   ├── domain.ts              # EIP712 domain configuration
│   ├── types.ts               # Withdrawal message type definitions
│   ├── client-signing.ts      # Client-side signing with Privy/wallet
│   └── server-verification.ts # Server-side signature recovery
│
├── functions/
│   ├── dg-transfer-service.ts # Pure functions for blockchain operations
│   └── limits-validator.ts    # Validation functions for limits
│
├── types.ts                   # TypeScript interfaces
└── config.ts                  # Constants and env config

app/api/token/withdraw/
└── route.ts                   # POST endpoint - handles client creation and orchestration

components/token-withdrawal/
├── WithdrawDGButton.tsx       # Trigger button
├── WithdrawDGModal.tsx        # Modal with amount input
└── WithdrawalHistoryTable.tsx # Past withdrawals

hooks/
└── useDGWithdrawal.ts         # Client orchestration hook
```

---

## Environment Variables

Add to `.env.local` and `.env.example`:

```bash
# DG Token Configuration
NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET=0x... # DG token on Base mainnet
NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA=0x...  # DG token on Base Sepolia

# Withdrawal Limits (in DG, not wei)
DG_WITHDRAWAL_MIN_AMOUNT=3000              # Minimum 3000 DG
DG_WITHDRAWAL_MAX_DAILY_AMOUNT=100000      # Max 100k DG per day (configurable for gamification)
DG_WITHDRAWAL_SIGNATURE_DEADLINE_SECONDS=900 # 15 min signature expiry

# Server Wallet (already exists, reuse)
LOCK_MANAGER_PRIVATE_KEY=0x...             # Server wallet with DG balance

# DG Nation Lock (for access control)
NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS=0x...   # DG Nation NFT lock
```

---

## Database Schema

### Migration: `086_dg_token_withdrawals.sql`

```sql
-- Track withdrawal nonces per user (prevent replay attacks)
CREATE TABLE IF NOT EXISTS public.user_withdrawal_nonces (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_nonce bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Track all withdrawal transactions
CREATE TABLE IF NOT EXISTS public.dg_token_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_profile_id uuid REFERENCES public.user_profiles(id),
  wallet_address text NOT NULL,

  -- Amounts
  amount_requested bigint NOT NULL,     -- DG amount user requested (in wei)
  xp_deducted bigint NOT NULL,          -- XP deducted from balance (1:1 with DG)
  xp_balance_before bigint NOT NULL,    -- Audit trail
  xp_balance_after bigint NOT NULL,

  -- Signature data
  signature text NOT NULL,
  nonce bigint NOT NULL,
  deadline bigint NOT NULL,             -- Unix timestamp when signature expires

  -- Blockchain data
  transaction_hash text,
  block_number bigint,

  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  retry_count integer DEFAULT 0,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed', 'reverted')),
  CONSTRAINT positive_amount CHECK (amount_requested > 0),
  CONSTRAINT valid_xp_deduction CHECK (xp_deducted = amount_requested) -- 1:1 rate
);

-- Indexes for performance
CREATE INDEX idx_dg_withdrawals_user_id ON public.dg_token_withdrawals(user_id);
CREATE INDEX idx_dg_withdrawals_status ON public.dg_token_withdrawals(status);
CREATE INDEX idx_dg_withdrawals_wallet ON public.dg_token_withdrawals(wallet_address);
CREATE INDEX idx_dg_withdrawals_created_at ON public.dg_token_withdrawals(created_at DESC);

-- Index for daily limit calculation
CREATE INDEX idx_dg_withdrawals_daily_limit ON public.dg_token_withdrawals(user_id, created_at)
  WHERE status = 'completed';

-- RLS Policies (users can only see their own withdrawals)
ALTER TABLE public.dg_token_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals"
  ON public.dg_token_withdrawals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Function to get next nonce for user
CREATE OR REPLACE FUNCTION public.get_next_withdrawal_nonce(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_next_nonce bigint;
BEGIN
  -- Insert or update nonce
  INSERT INTO public.user_withdrawal_nonces (user_id, current_nonce)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    current_nonce = user_withdrawal_nonces.current_nonce + 1,
    updated_at = now()
  RETURNING current_nonce INTO v_next_nonce;

  RETURN v_next_nonce;
END;
$$;

-- Function to validate nonce (ensure not already used)
CREATE OR REPLACE FUNCTION public.validate_withdrawal_nonce(
  p_user_id uuid,
  p_nonce bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current_nonce bigint;
BEGIN
  SELECT current_nonce INTO v_current_nonce
  FROM public.user_withdrawal_nonces
  WHERE user_id = p_user_id;

  -- Nonce must match current nonce (prevents replay and ensures order)
  RETURN (v_current_nonce = p_nonce);
END;
$$;

-- Function to calculate daily withdrawal total
CREATE OR REPLACE FUNCTION public.get_daily_withdrawal_total(
  p_user_id uuid,
  p_since timestamptz DEFAULT (now() - interval '24 hours')
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total bigint;
BEGIN
  SELECT COALESCE(SUM(amount_requested), 0) INTO v_total
  FROM public.dg_token_withdrawals
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND completed_at >= p_since;

  RETURN v_total;
END;
$$;
```

---

## EIP712 Implementation

### Type Definition

```typescript
// lib/token-withdrawal/eip712/types.ts

export const WITHDRAWAL_DOMAIN = {
  name: 'P2E Inferno DG Withdrawal',
  version: '1',
  chainId: 8453, // Base mainnet (or from env)
  verifyingContract: process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}`
};

export const WITHDRAWAL_TYPES = {
  Withdrawal: [
    { name: 'user', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
} as const;

export interface WithdrawalMessage {
  user: `0x${string}`;
  amount: bigint;
  nonce: bigint;
  deadline: bigint; // Unix timestamp
}
```

### Client-Side Signing

```typescript
// lib/token-withdrawal/eip712/client-signing.ts

import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES, type WithdrawalMessage } from './types';

export async function signWithdrawalMessage(
  walletAddress: `0x${string}`,
  amount: bigint,
  nonce: bigint,
  deadline: bigint,
  signerProvider: any // Privy wallet or ethers provider
): Promise<string> {
  const message: WithdrawalMessage = {
    user: walletAddress,
    amount,
    nonce,
    deadline
  };

  // Use Privy's signTypedData or ethers provider
  const signature = await signerProvider.signTypedData({
    domain: WITHDRAWAL_DOMAIN,
    types: WITHDRAWAL_TYPES,
    primaryType: 'Withdrawal',
    message
  });

  return signature;
}
```

### Server-Side Verification

```typescript
// lib/token-withdrawal/eip712/server-verification.ts

import { verifyTypedData } from 'viem';
import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES, type WithdrawalMessage } from './types';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('eip712-verification');

export async function verifyWithdrawalSignature(
  message: WithdrawalMessage,
  signature: `0x${string}`
): Promise<{ valid: boolean; recoveredAddress?: `0x${string}`; error?: string }> {
  try {
    const isValid = await verifyTypedData({
      address: message.user,
      domain: WITHDRAWAL_DOMAIN,
      types: WITHDRAWAL_TYPES,
      primaryType: 'Withdrawal',
      message,
      signature
    });

    if (isValid) {
      log.info('Signature verified successfully', { user: message.user });
      return { valid: true, recoveredAddress: message.user };
    } else {
      log.warn('Signature verification failed', { user: message.user });
      return { valid: false, error: 'Invalid signature' };
    }
  } catch (error) {
    log.error('Signature verification error', { error, message });
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

---

## Services

### DG Transfer Service Functions

```typescript
// lib/token-withdrawal/functions/dg-transfer-service.ts

import { type WalletClient, type PublicClient, type Address } from 'viem';
import { ERC20_ABI, COMPLETE_LOCK_ABI } from '@/lib/blockchain/shared/abi-definitions';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('dg-token-functions');

export interface DGTransferParams {
  recipientAddress: Address;
  amount: bigint; // Amount in wei (18 decimals for DG)
  tokenAddress: Address;
}

export interface DGTransferResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: bigint;
  error?: string;
}

/**
 * Transfer DG tokens from server wallet to user
 * @param walletClient Initialized wallet client with signing capabilities
 * @param params Transfer parameters
 */
export async function transferDGTokens(
  walletClient: WalletClient,
  params: DGTransferParams
): Promise<DGTransferResult> {
  const { recipientAddress, amount, tokenAddress } = params;

  if (!walletClient) {
    return {
      success: false,
      error: 'Server wallet not configured'
    };
  }

  try {
    log.info('Initiating DG token transfer', {
      recipient: recipientAddress,
      amount: amount.toString(),
      token: tokenAddress
    });

    // Execute ERC20 transfer
    const txHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipientAddress, amount]
    });

    log.info('DG transfer transaction sent', { txHash });

    // Wait for confirmation (2 blocks)
    const receipt = await walletClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 2
    });

    if (receipt.status === 'success') {
      log.info('DG transfer confirmed', {
        txHash,
        blockNumber: receipt.blockNumber.toString()
      });

      return {
        success: true,
        transactionHash: txHash,
        blockNumber: receipt.blockNumber
      };
    } else {
      log.error('DG transfer reverted', { txHash, receipt });
      return {
        success: false,
        error: 'Transaction reverted on-chain'
      };
    }
  } catch (error) {
    log.error('DG transfer failed', { error, params });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check token balance for an address
 * @param publicClient Initialized public client for read operations
 * @param tokenAddress ERC20 token contract address
 * @param walletAddress Address to check balance for
 */
export async function getTokenBalance(
  publicClient: PublicClient,
  tokenAddress: Address,
  walletAddress: Address
): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress]
    }) as bigint;

    return balance;
  } catch (error) {
    log.error('Failed to get token balance', { error, tokenAddress, walletAddress });
    return 0n;
  }
}

/**
 * Check if wallet has a valid key in the DG Nation lock
 * @param publicClient Initialized public client for read operations
 * @param walletAddress User wallet address to check
 * @param lockAddress DG Nation lock address
 */
export async function hasValidDGNationKey(
  publicClient: PublicClient,
  walletAddress: Address,
  lockAddress: Address
): Promise<boolean> {
  try {
    const hasKey = await publicClient.readContract({
      address: lockAddress,
      abi: COMPLETE_LOCK_ABI,
      functionName: 'getHasValidKey',
      args: [walletAddress]
    });
    
    return Boolean(hasKey);
  } catch (error) {
    log.error('Failed to check DG Nation key', { error, walletAddress, lockAddress });
    return false;
  }
}
```

### Limits Validator Functions

```typescript
// lib/token-withdrawal/functions/limits-validator.ts

import { getLogger } from '@/lib/utils/logger';
import { SupabaseClient } from '@supabase/supabase-js';

const log = getLogger('withdrawal-limits-validator');

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Get limits from environment
const getMinAmount = (): bigint => {
  const minDG = parseInt(process.env.DG_WITHDRAWAL_MIN_AMOUNT || '3000');
  return BigInt(minDG) * BigInt(10 ** 18);
};

const getMaxDailyAmount = (): bigint => {
  const maxDailyDG = parseInt(process.env.DG_WITHDRAWAL_MAX_DAILY_AMOUNT || '100000');
  return BigInt(maxDailyDG) * BigInt(10 ** 18);
};

/**
 * Validate minimum withdrawal amount
 */
export function validateMinimumAmount(amount: bigint): ValidationResult {
  const minAmount = getMinAmount();
  
  if (amount < minAmount) {
    const minDG = Number(minAmount / BigInt(10 ** 18));
    return {
      valid: false,
      error: `Minimum withdrawal is ${minDG} DG`
    };
  }
  return { valid: true };
}

/**
 * Validate daily withdrawal limit
 */
export async function validateDailyLimit(
  supabaseClient: SupabaseClient,
  userId: string,
  requestedAmount: bigint
): Promise<ValidationResult> {
  try {
    // Get total withdrawn in last 24 hours
    const { data, error } = await supabaseClient.rpc('get_daily_withdrawal_total', {
      p_user_id: userId
    });

    if (error) {
      log.error('Failed to get daily withdrawal total', { error, userId });
      throw error;
    }

    const dailyTotal = BigInt(data || 0);
    const newTotal = dailyTotal + requestedAmount;
    const maxDailyAmount = getMaxDailyAmount();

    if (newTotal > maxDailyAmount) {
      const remaining = maxDailyAmount - dailyTotal;
      const remainingDG = Number(remaining / BigInt(10 ** 18));

      return {
        valid: false,
        error: `Daily limit exceeded. You can withdraw up to ${remainingDG} DG more today`
      };
    }

    return { valid: true };
  } catch (error) {
    log.error('Daily limit validation error', { error, userId });
    return {
      valid: false,
      error: 'Failed to validate daily limit'
    };
  }
}

/**
 * Validate user has sufficient XP balance
 */
export async function validateSufficientBalance(
  supabaseClient: SupabaseClient,
  userId: string,
  requestedAmount: bigint
): Promise<ValidationResult> {
  try {
    const { data: profile, error } = await supabaseClient
      .from('user_profiles')
      .select('experience_points')
      .eq('privy_user_id', userId)
      .single();

    if (error || !profile) {
      log.error('Failed to get user profile', { error, userId });
      return {
        valid: false,
        error: 'User profile not found'
      };
    }

    const xpBalance = BigInt(profile.experience_points || 0);

    // XP is stored as integer, convert to wei for comparison (1 XP = 1 DG = 1 * 10^18 wei)
    const xpInWei = xpBalance * BigInt(10 ** 18);

    if (xpInWei < requestedAmount) {
      const availableDG = Number(xpBalance);
      return {
        valid: false,
        error: `Insufficient balance. You have ${availableDG} DG available`
      };
    }

    return { valid: true };
  } catch (error) {
    log.error('Balance validation error', { error, userId });
    return {
      valid: false,
      error: 'Failed to validate balance'
    };
  }
}

/**
 * Run all validations
 */
export async function validateAll(
  supabaseClient: SupabaseClient,
  userId: string,
  requestedAmount: bigint
): Promise<ValidationResult> {
  // Check minimum amount
  const minCheck = validateMinimumAmount(requestedAmount);
  if (!minCheck.valid) return minCheck;

  // Check sufficient balance
  const balanceCheck = await validateSufficientBalance(
    supabaseClient,
    userId, 
    requestedAmount
  );
  if (!balanceCheck.valid) return balanceCheck;

  // Check daily limit
  const dailyCheck = await validateDailyLimit(
    supabaseClient,
    userId, 
    requestedAmount
  );
  if (!dailyCheck.valid) return dailyCheck;

  return { valid: true };
}
```

---

## API Endpoint Flow

### POST `/api/token/withdraw`

```typescript
// app/api/token/withdraw/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client';
import { createWalletClientUnified } from '@/lib/blockchain/config/clients/wallet-client';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import { 
  transferDGTokens,
  getTokenBalance, 
  hasValidDGNationKey
} from '@/lib/token-withdrawal/functions/dg-transfer-service';
import { verifyWithdrawalSignature } from '@/lib/token-withdrawal/eip712/server-verification';
import { getLogger } from '@/lib/utils/logger';
import type { WithdrawalMessage } from '@/lib/token-withdrawal/eip712/types';

const log = getLogger('api:token:withdraw');

/**
 * Request Flow:
 * 1. Gate: Check DG Nation lock ownership (hasValidDGNationKey)
 * 2. Validate: Parse and validate request body
 * 3. Verify: EIP712 signature verification
 * 4. Check: Nonce is valid (prevent replay)
 * 5. Check: Signature not expired (deadline)
 * 6. Validate: Min/max/daily limits + sufficient balance
 * 7. DB Transaction Start:
 *    a. Deduct XP from user balance
 *    b. Create withdrawal record (status: 'pending')
 * 8. Blockchain: Transfer DG tokens from server wallet
 * 9. On Success:
 *    a. Update withdrawal record (status: 'completed', tx_hash)
 *    b. Commit DB transaction
 *    c. Return { success: true, txHash, newBalance }
 * 10. On Failure:
 *    a. Rollback DB transaction (revert XP deduction)
 *    b. Update withdrawal record (status: 'failed')
 *    c. Log error
 *    d. Return { success: false, error }
 */

export async function POST(req: NextRequest) {
  try {
    // Create blockchain clients (only when needed, one-time per request)
    // Connections will naturally close when the request completes
    const publicClient = createPublicClientUnified();
    const walletClient = createWalletClientUnified();
    
    if (!walletClient) {
      return NextResponse.json(
        { success: false, error: 'Server wallet not configured' },
        { status: 500 }
      );
    }
    
    // Implementation follows the flow above...
    // The key difference is that blockchain clients are created once
    // and passed to pure functions rather than using service classes
    
    // Example for checking DG Nation lock access:
    const dgNationLockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;
    if (dgNationLockAddress) {
      const hasAccess = await hasValidDGNationKey(
        publicClient,
        userWalletAddress,
        dgNationLockAddress
      );
      
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'DG Nation membership required' },
          { status: 403 }
        );
      }
    }
    
    // Rest of implementation...
  } catch (error) {
    log.error('Withdrawal request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Request/Response Types

```typescript
// Request
interface WithdrawRequest {
  walletAddress: string;
  amount: string; // Amount in DG (will be converted to wei)
  signature: string;
  nonce: string;
  deadline: string;
}

// Response (success)
interface WithdrawSuccessResponse {
  success: true;
  transactionHash: string;
  blockNumber: string;
  amountWithdrawn: string; // In DG
  newXPBalance: number;
}

// Response (failure)
interface WithdrawErrorResponse {
  success: false;
  error: string;
  code?: string; // e.g., 'INSUFFICIENT_BALANCE', 'DAILY_LIMIT_EXCEEDED'
}
```

---

## Client Implementation

### Hook: `useDGWithdrawal`

```typescript
// hooks/useDGWithdrawal.ts

export function useDGWithdrawal() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiateWithdrawal = async (amountDG: number) => {
    // 0. Verify user has enough blance/XP for `amountDG`
    // 1. Get current nonce from API
    // 2. Create EIP712 message with amount, nonce, deadline
    // 3. Sign message using Privy wallet
    // 4. Send signature to API
    // 5. Handle response (show tx hash or error)
  };

  return {
    initiateWithdrawal,
    isLoading,
    error
  };
}
```

---

## Future Enhancements

The modular design allows easy addition of:

1. **Cooldown Periods**: Add `last_withdrawal_at` tracking
2. **Weekly/Monthly Limits**: Extend `limits-validator.ts`
3. **Tier-Based Limits**: Higher limits for higher-tier users
4. **Withdrawal Streaks**: Bonus DG for consistent withdrawals
5. **Withdrawal Fees**: Small percentage fee for platform sustainability
6. **Batch Withdrawals**: Allow multiple users to withdraw in single tx (gas optimization)
7. **Withdrawal Scheduling**: Allow users to schedule future withdrawals
8. **Auto-Withdraw**: Automatic withdrawal when XP reaches threshold

---

## Open Questions

### 1. Access Control
**Question:** Should withdrawal require DG Nation NFT ownership, or is it open to all users with XP?

**Options:**
- A) Require DG Nation NFT (stricter, more exclusive)
- B) Open to all users with XP (more accessible)
- C) Tiered: NFT holders get higher limits

---

### 2. Daily Limit Reset
**Question:** Should the 24-hour window be rolling (last 24 hours) or calendar-based (midnight UTC)?

**Options:**
- A) Rolling 24 hours (e.g., if you withdraw at 3pm Tuesday, limit resets 3pm Wednesday)
- B) Calendar day (resets at midnight UTC every day)

**Current Implementation:** Rolling 24 hours (simpler, fairer)

---

### 3. Decimal Handling
**Question:** DG token has 18 decimals, right? So 3000 DG minimum = 3000 * 10^18 wei?

**Assumption:** Yes, standard ERC20 with 18 decimals

---

### 4. UI Placement
**Question:** Where should the withdraw button live?

**Options:**
- A) Dashboard (high visibility)
- B) Profile page (alongside other account actions)
- C) Dedicated "Rewards" page (cleaner separation)
- D) Multiple locations (dashboard + profile)

---

### 5. Server Wallet Funding
**Question:** How will the server wallet (`LOCK_MANAGER_PRIVATE_KEY` address) be funded with DG tokens initially?

**Options:**
- A) Manual transfer from treasury
- B) Automated funding from another contract
- C) Just-in-time funding when balance is low

**Action Required:** Document the funding process

---

### 6. Withdrawal History
**Question:** Should users see their withdrawal history? If yes, how many records?

**Options:**
- A) Yes, show last 10 withdrawals
- B) Yes, show last 50 withdrawals
- C) Yes, show all withdrawals (paginated)
- D) No history needed

**Recommendation:** Option C (all withdrawals, paginated) for transparency

---

### 7. XP-to-DG Conversion Rate
**Question:** Is 1:1 ratio fixed forever, or should it be configurable for future adjustments?

**Current Implementation:** 1:1 hardcoded in DB constraint

**Options:**
- A) Keep 1:1 forever (simplest)
- B) Make configurable via env variable
- C) Make dynamic based on DG token price

---

### 8. Failure Recovery
**Question:** If blockchain transfer fails but XP was deducted, should we:
- A) Auto-retry the transfer (current plan)
- B) Require user to manually retry
- C) Allow admin to manually process failed withdrawals

**Current Implementation:** Rollback XP if transfer fails (safest)

---

## Security Considerations

1. **Signature Replay**: Prevented via nonce system
2. **Signature Expiry**: 15-minute deadline on signatures
3. **XP Atomicity**: DB transaction ensures XP deduction = token transfer or both fail
4. **Access Control**: DG Nation NFT gating (if implemented)
5. **Rate Limiting**: Daily withdrawal limits prevent abuse
6. **Server Wallet Security**: Uses existing `LOCK_MANAGER_PRIVATE_KEY` infrastructure
7. **Audit Trail**: Complete history in `dg_token_withdrawals` table

---

## Testing Checklist

- [ ] Unit tests for EIP712 signing/verification
- [ ] Unit tests for limits validator
- [ ] Unit tests for DG transfer service
- [ ] Integration test: Full withdrawal flow (happy path)
- [ ] Integration test: Insufficient balance
- [ ] Integration test: Daily limit exceeded
- [ ] Integration test: Invalid signature
- [ ] Integration test: Expired signature
- [ ] Integration test: Replay attack (reused nonce)
- [ ] Integration test: Blockchain transfer failure (rollback XP)
- [ ] E2E test: Complete user journey from UI to wallet

---

## Deployment Checklist

- [ ] Create database migration `086_dg_token_withdrawals.sql`
- [ ] Apply migration to local DB
- [ ] Add environment variables to `.env.example`
- [ ] Add environment variables to deployment (Vercel/Railway)
- [ ] Fund server wallet with initial DG tokens
- [ ] Test on Base Sepolia testnet first
- [ ] Monitor server wallet balance (alert when low)
- [ ] Set up error monitoring/alerting for failed withdrawals
- [ ] Document server wallet funding process
- [ ] Create runbook for common issues

---

## Implementation Order

### Phase 1: Core Infrastructure
1. Database migration
2. EIP712 types and verification
3. DG transfer service
4. Limits validator service

### Phase 2: API Layer
1. Nonce manager
2. Withdrawal orchestrator
3. API endpoint `/api/token/withdraw`

### Phase 3: Client Layer
1. `useDGWithdrawal` hook
2. `WithdrawDGButton` component
3. `WithdrawDGModal` component

### Phase 4: Polish
1. Withdrawal history table
2. Error handling and user feedback
3. Loading states and animations

### Phase 5: Testing & Deployment
1. Unit and integration tests
2. Testnet deployment
3. Mainnet deployment
4. Monitoring setup

---

## References

- Existing XP Service: `lib/checkin/xp/updater.ts`
- Grant Key Pattern: `lib/blockchain/services/grant-key-service.ts` (for retry logic and error handling)
- ERC20 ABI: `lib/blockchain/shared/abi-definitions.ts`
- Admin API Pattern: `pages/api/admin/grant-key.ts`
- Wallet Client: `lib/blockchain/config/clients/wallet-client.ts`
- Public Client: `lib/blockchain/config/clients/public-client.ts`
- User Profiles Schema: `supabase/migrations/003_user_profiles_schema.sql`
- Certificate Preview API: `app/api/user/bootcamp/[cohortId]/certificate-preview/route.ts` (function-based pattern for blockchain calls)

---

**Last Updated:** 2025-10-20
**Next Review:** Before starting Phase 1 implementation
