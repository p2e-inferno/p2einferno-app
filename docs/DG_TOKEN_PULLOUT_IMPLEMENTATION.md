# DG Token Withdrawal Feature - Implementation Plan

**Feature Name:** DG_TOKEN_PULLOUT_FEATURE
**Status:** Implemented with Dynamic Configuration
**Last Updated:** 2025-10-20

## Key Simplifications

This design has been streamlined based on engineering review:

1. **Signature-Based Idempotency**: Removed nonce table and functions. Signatures are unique by design - simpler and equally secure.
2. **Atomic DB Functions**: All validation, XP deduction, and record creation happen in single `initiate_withdrawal()` function - prevents race conditions.
3. **Integer Storage**: Store amounts as DG integers (not wei) in database, convert to wei only for blockchain - fixes decimal bugs.
4. **Built-in Validation**: Min/max/daily limits enforced in DB function - no separate validator service needed.
5. **Automatic Rollback**: `rollback_withdrawal()` and `complete_withdrawal()` functions ensure XP is always restored on failure.

**Lines of code removed**: ~300 (nonce management, separate validators)
**Estimated implementation time**: 11-16 hours (down from 30+ hours)

## Dynamic Configuration Enhancement

The initial implementation used hardcoded withdrawal limits. We've enhanced this with a fully dynamic, database-driven configuration system:

1. **Generic System Config Table**: `system_config` key-value store for all runtime-configurable settings
2. **Full Admin UI**: `WithdrawalLimitsConfig` component for managing limits without redeployment
3. **Complete Audit Trail**: `config_audit_log` table tracks all changes with user attribution
4. **Admin Session Protection**: Config updates require admin authentication via session middleware
5. **Graceful Fallbacks**: Client and server use default values if config fetch fails

**Benefits:**
- No redeployment needed to adjust limits
- Audit compliance for regulatory requirements
- Easy to add more configurable parameters
- Client and database always use same limits

## Overview

Ability for users to withdraw DG tokens earned from the app. Currently, earnings are stored in the database as XP (experience points). This feature implements a secure claim process whereby the server wallet transfers DG tokens to users at a 1:1 XP-to-DG rate.

### Security & Access Control

- **EIP712 Typed Signatures**: Users sign typed messages client-side for additional security
- **Unlock Protocol Gating**: Uses `NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS` for access control
- **Replay Attack Prevention**: Signature-based idempotency (signatures are unique and cannot be reused)
- **Signature Expiry**: Time-bound signatures (default: 15 minutes)
- **Atomic Transactions**: Database functions ensure XP deduction and withdrawal creation happen atomically

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
│   ├── types.ts               # EIP712 domain + message type definitions
│   ├── client-signing.ts      # Client-side signing with Privy/wallet
│   └── server-verification.ts # Server-side signature recovery
│
├── functions/
│   └── dg-transfer-service.ts # Pure functions for blockchain operations
│
└── types.ts                   # TypeScript interfaces

app/api/token/withdraw/
├── route.ts                   # POST endpoint - main withdrawal flow
└── history/
    └── route.ts               # GET endpoint - withdrawal history

app/api/admin/wallet/balance/
└── route.ts                   # GET endpoint - server wallet monitoring

app/api/admin/config/withdrawal-limits/
├── route.ts                   # GET/PUT endpoints - manage withdrawal limits
└── audit/
    └── route.ts               # GET endpoint - config change audit log

components/token-withdrawal/
├── WithdrawDGButton.tsx         # Trigger button
├── WithdrawDGModal.tsx          # Modal with amount input
├── WithdrawalHistoryTable.tsx   # Past withdrawals
├── SubscriptionBadge.tsx        # Displays DG Nation subscription status
├── AccessRequirementCard.tsx    # Information card for users without access
└── SubscriptionExpiryInfo.tsx   # Shows when the user's NFT subscription expires

components/admin/
└── WithdrawalLimitsConfig.tsx   # Admin UI for managing withdrawal limits

hooks/
├── useDGWithdrawal.ts         # Client orchestration hook (signs + submits)
├── useDGNationKey.ts          # Hook to check NFT ownership and expiration
├── useWithdrawalAccess.ts     # Hook to determine withdrawal eligibility
└── useWithdrawalLimits.ts     # Hook to fetch dynamic limits from API

supabase/migrations/
├── 086_dg_token_withdrawals.sql         # Withdrawal tracking table + functions
└── 087_configurable_withdrawal_limits.sql # Dynamic config system
```

---

## Environment Variables

Add to `.env.local` and `.env.example`:

```bash
# DG Token Configuration
NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET=0x... # DG token on Base mainnet
NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA=0x...  # DG token on Base Sepolia

# Signature Configuration
DG_WITHDRAWAL_SIGNATURE_DEADLINE_SECONDS=900 # 15 min signature expiry (optional, defaults to 900)

# Server Wallet (already exists, reuse)
LOCK_MANAGER_PRIVATE_KEY=0x...             # Server wallet with DG balance

# DG Nation Lock (for access control)
NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS=0x...   # DG Nation NFT lock
```

**Note on Withdrawal Limits:** Minimum and maximum withdrawal limits are now stored in the database (`system_config` table) and configurable via admin UI. No environment variables needed for limits. See "Dynamic Configuration System" section below.

---

## Database Schema

### Migration: `086_dg_token_withdrawals.sql`

```sql
-- Track all withdrawal transactions
-- Simplified: Use signature as idempotency key, store amounts as DG integers (not wei)
CREATE TABLE IF NOT EXISTS public.dg_token_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_profile_id uuid REFERENCES public.user_profiles(id),
  wallet_address text NOT NULL,

  -- Amounts (stored as DG integers, converted to wei only for blockchain)
  amount_dg integer NOT NULL,           -- DG amount (e.g., 5000)
  xp_balance_before integer NOT NULL,   -- Audit trail

  -- Signature data (signature is the idempotency key)
  signature text NOT NULL UNIQUE,       -- EIP712 signature - prevents replays
  deadline bigint NOT NULL,             -- Unix timestamp (seconds) when signature expires

  -- Blockchain data
  transaction_hash text,

  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  error_message text,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT positive_amount CHECK (amount_dg > 0)
);

-- Indexes for performance
CREATE INDEX idx_dg_withdrawals_user_id ON public.dg_token_withdrawals(user_id);
CREATE INDEX idx_dg_withdrawals_status ON public.dg_token_withdrawals(status);
CREATE INDEX idx_dg_withdrawals_wallet ON public.dg_token_withdrawals(wallet_address);
CREATE INDEX idx_dg_withdrawals_created_at ON public.dg_token_withdrawals(created_at DESC);
CREATE UNIQUE INDEX idx_dg_withdrawals_signature ON public.dg_token_withdrawals(signature);

-- Index for daily limit calculation (rolling 24-hour window)
CREATE INDEX idx_dg_withdrawals_daily_limit ON public.dg_token_withdrawals(user_id, created_at)
  WHERE status = 'completed';

-- RLS Policies (users can only see their own withdrawals)
ALTER TABLE public.dg_token_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals"
  ON public.dg_token_withdrawals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Atomic function to initiate withdrawal
-- Handles validation, XP deduction, and record creation in one transaction
CREATE OR REPLACE FUNCTION public.initiate_withdrawal(
  p_user_id uuid,
  p_amount_dg integer,
  p_signature text,
  p_deadline bigint,
  p_wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_current_xp integer;
  v_withdrawal_id uuid;
  v_daily_total integer;
  v_min_amount integer := 3000;  -- From env DG_WITHDRAWAL_MIN_AMOUNT
  v_max_daily integer := 100000; -- From env DG_WITHDRAWAL_MAX_DAILY_AMOUNT
BEGIN
  -- Check if signature already used (idempotency)
  SELECT id INTO v_withdrawal_id
  FROM public.dg_token_withdrawals
  WHERE signature = p_signature;

  IF FOUND THEN
    -- Return existing withdrawal (idempotent)
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_withdrawal_id,
      'idempotent', true
    );
  END IF;

  -- Lock user profile row and get current XP
  SELECT id, experience_points INTO v_profile_id, v_current_xp
  FROM public.user_profiles
  WHERE privy_user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Validate minimum amount
  IF p_amount_dg < v_min_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum withdrawal is %s DG', v_min_amount)
    );
  END IF;

  -- Validate sufficient balance
  IF v_current_xp < p_amount_dg THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance. You have %s DG available', v_current_xp)
    );
  END IF;

  -- Check daily limit (rolling 24-hour window)
  SELECT COALESCE(SUM(amount_dg), 0) INTO v_daily_total
  FROM public.dg_token_withdrawals
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND created_at > now() - interval '24 hours';

  IF v_daily_total + p_amount_dg > v_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Daily limit exceeded. You can withdraw up to %s DG more today',
                      v_max_daily - v_daily_total)
    );
  END IF;

  -- Deduct XP from user profile
  UPDATE public.user_profiles
  SET experience_points = experience_points - p_amount_dg,
      updated_at = now()
  WHERE id = v_profile_id;

  -- Create withdrawal record
  INSERT INTO public.dg_token_withdrawals (
    user_id,
    user_profile_id,
    wallet_address,
    amount_dg,
    xp_balance_before,
    signature,
    deadline,
    status
  ) VALUES (
    p_user_id,
    v_profile_id,
    p_wallet_address,
    p_amount_dg,
    v_current_xp,
    p_signature,
    p_deadline,
    'pending'
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'xp_deducted', p_amount_dg
  );
END;
$$;

-- Function to complete a successful withdrawal
CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  p_withdrawal_id uuid,
  p_tx_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.dg_token_withdrawals
  SET
    status = 'completed',
    transaction_hash = p_tx_hash,
    completed_at = now()
  WHERE id = p_withdrawal_id
    AND status = 'pending';
END;
$$;

-- Function to rollback a failed withdrawal
CREATE OR REPLACE FUNCTION public.rollback_withdrawal(
  p_withdrawal_id uuid,
  p_error_message text DEFAULT 'Transfer failed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_amount integer;
  v_profile_id uuid;
BEGIN
  -- Get withdrawal details
  SELECT amount_dg, user_profile_id INTO v_amount, v_profile_id
  FROM public.dg_token_withdrawals
  WHERE id = p_withdrawal_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN; -- Already processed or doesn't exist
  END IF;

  -- Restore XP to user profile
  UPDATE public.user_profiles
  SET experience_points = experience_points + v_amount,
      updated_at = now()
  WHERE id = v_profile_id;

  -- Mark withdrawal as failed
  UPDATE public.dg_token_withdrawals
  SET
    status = 'failed',
    error_message = p_error_message,
    completed_at = now()
  WHERE id = p_withdrawal_id;
END;
$$;
```

### Migration: `087_configurable_withdrawal_limits.sql`

```sql
-- Generic system configuration key-value store
CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Audit log for configuration changes
CREATE TABLE IF NOT EXISTS public.config_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Helper function to get integer config values with defaults
CREATE OR REPLACE FUNCTION public.get_config_int(
  p_key text,
  p_default integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  v_value text;
BEGIN
  SELECT value INTO v_value
  FROM public.system_config
  WHERE key = p_key;

  IF v_value IS NULL THEN
    RETURN p_default;
  END IF;

  RETURN v_value::integer;
EXCEPTION
  WHEN OTHERS THEN
    RETURN p_default;
END;
$$;

-- Trigger to automatically log config changes
CREATE OR REPLACE FUNCTION public.log_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.config_audit_log (
    config_key,
    old_value,
    new_value,
    changed_by
  ) VALUES (
    NEW.key,
    OLD.value,
    NEW.value,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER config_change_audit
  AFTER UPDATE ON public.system_config
  FOR EACH ROW
  WHEN (OLD.value IS DISTINCT FROM NEW.value)
  EXECUTE FUNCTION public.log_config_change();

-- Seed initial withdrawal limit values
INSERT INTO public.system_config (key, value, description) VALUES
  ('dg_withdrawal_min_amount', '3000', 'Minimum DG withdrawal amount'),
  ('dg_withdrawal_max_daily_amount', '100000', 'Maximum DG withdrawal per 24-hour rolling window')
ON CONFLICT (key) DO NOTHING;

-- Update initiate_withdrawal function to use dynamic config
-- (Replace hardcoded values with get_config_int() calls)
CREATE OR REPLACE FUNCTION public.initiate_withdrawal(
  p_user_id uuid,
  p_amount_dg integer,
  p_signature text,
  p_deadline bigint,
  p_wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_current_xp integer;
  v_withdrawal_id uuid;
  v_daily_total integer;
  v_min_amount integer;
  v_max_daily integer;
BEGIN
  -- Get dynamic limits from config
  v_min_amount := get_config_int('dg_withdrawal_min_amount', 3000);
  v_max_daily := get_config_int('dg_withdrawal_max_daily_amount', 100000);

  -- Check if signature already used (idempotency)
  SELECT id INTO v_withdrawal_id
  FROM public.dg_token_withdrawals
  WHERE signature = p_signature;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_withdrawal_id,
      'idempotent', true
    );
  END IF;

  -- Lock user profile row and get current XP
  SELECT id, experience_points INTO v_profile_id, v_current_xp
  FROM public.user_profiles
  WHERE privy_user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Validate minimum amount (using dynamic config)
  IF p_amount_dg < v_min_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum withdrawal is %s DG', v_min_amount)
    );
  END IF;

  -- Validate sufficient balance
  IF v_current_xp < p_amount_dg THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance. You have %s DG available', v_current_xp)
    );
  END IF;

  -- Check daily limit (using dynamic config)
  SELECT COALESCE(SUM(amount_dg), 0) INTO v_daily_total
  FROM public.dg_token_withdrawals
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND created_at > now() - interval '24 hours';

  IF v_daily_total + p_amount_dg > v_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Daily limit exceeded. You can withdraw up to %s DG more today',
                      v_max_daily - v_daily_total)
    );
  END IF;

  -- Deduct XP and create withdrawal record
  UPDATE public.user_profiles
  SET experience_points = experience_points - p_amount_dg,
      updated_at = now()
  WHERE id = v_profile_id;

  INSERT INTO public.dg_token_withdrawals (
    user_id,
    user_profile_id,
    wallet_address,
    amount_dg,
    xp_balance_before,
    signature,
    deadline,
    status
  ) VALUES (
    p_user_id,
    v_profile_id,
    p_wallet_address,
    p_amount_dg,
    v_current_xp,
    p_signature,
    p_deadline,
    'pending'
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'xp_deducted', p_amount_dg
  );
END;
$$;
```

---

## Dynamic Configuration System

### API Endpoints

#### GET `/api/admin/config/withdrawal-limits`

Public endpoint that returns current withdrawal limits. Used by client-side hooks and components.

```typescript
// Response
{
  success: true,
  limits: {
    minAmount: 3000,
    maxAmount: 100000,
    updatedAt: "2025-10-20T10:30:00Z",
    updatedBy: "user-uuid-here"
  }
}
```

#### PUT `/api/admin/config/withdrawal-limits`

Admin-protected endpoint to update withdrawal limits. Requires admin session authentication.

```typescript
// Request
{
  minAmount: 5000,
  maxAmount: 150000
}

// Response
{
  success: true,
  limits: {
    minAmount: 5000,
    maxAmount: 150000,
    updatedAt: "2025-10-20T10:35:00Z",
    updatedBy: "admin-uuid-here"
  }
}
```

**Validation:**
- `minAmount` must be > 0
- `maxAmount` must be > `minAmount`
- Requires authenticated admin user (via admin session middleware)

#### GET `/api/admin/config/withdrawal-limits/audit`

Admin-protected endpoint that returns audit history of limit changes with pagination.

```typescript
// Query params: ?limit=10&offset=0

// Response
{
  success: true,
  auditLogs: [
    {
      id: "audit-uuid",
      configKey: "dg_withdrawal_limits_batch",
      oldValue: { minAmount: 3000, maxAmount: 100000 },
      newValue: { minAmount: 5000, maxAmount: 150000 },
      changedBy: "admin-uuid",
      changedAt: "2025-10-20T10:35:00Z",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0..."
    }
  ],
  total: 15,
  limit: 10,
  offset: 0
}
```

### React Hook: `useWithdrawalLimits`

Client-side hook that fetches dynamic limits from the API with fallback to hardcoded defaults.

```typescript
// hooks/useWithdrawalLimits.ts

import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useWithdrawalLimits');

export interface WithdrawalLimits {
  minAmount: number;
  maxAmount: number;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_LIMITS = {
  minAmount: 3000,
  maxAmount: 100000
};

export function useWithdrawalLimits() {
  const [limits, setLimits] = useState<WithdrawalLimits>({
    minAmount: DEFAULT_LIMITS.minAmount,
    maxAmount: DEFAULT_LIMITS.maxAmount,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    fetchLimits();
  }, []);

  const fetchLimits = async () => {
    try {
      setLimits(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch('/api/admin/config/withdrawal-limits');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch limits');
      }

      setLimits({
        minAmount: data.limits.minAmount,
        maxAmount: data.limits.maxAmount,
        isLoading: false,
        error: null
      });
    } catch (error) {
      log.error('Failed to fetch withdrawal limits, using defaults', { error });
      // Use defaults on error
      setLimits({
        minAmount: DEFAULT_LIMITS.minAmount,
        maxAmount: DEFAULT_LIMITS.maxAmount,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load limits'
      });
    }
  };

  return limits;
}
```

### Admin UI Component: `WithdrawalLimitsConfig`

Full-featured admin component for managing withdrawal limits (`components/admin/WithdrawalLimitsConfig.tsx`).

**Features:**
- Form with min/max input fields
- Real-time validation
- Save button with loading state
- Success/error notifications
- Collapsible audit history table
- Auto-refresh audit logs on save
- Last updated timestamp display

**Usage:**
```tsx
import { WithdrawalLimitsConfig } from '@/components/admin/WithdrawalLimitsConfig';

// In admin dashboard
<WithdrawalLimitsConfig />
```

The component fetches current limits on mount, allows editing, validates changes, and submits updates to the PUT endpoint. After a successful save, it refreshes the audit logs to show the change history.

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
    { name: 'deadline', type: 'uint256' }
  ]
} as const;

export interface WithdrawalMessage {
  user: `0x${string}`;
  amount: bigint;
  deadline: bigint; // Unix timestamp (seconds)
}
```

### Client-Side Signing

```typescript
// lib/token-withdrawal/eip712/client-signing.ts

import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES, type WithdrawalMessage } from './types';

export async function signWithdrawalMessage(
  walletAddress: `0x${string}`,
  amountDG: number,
  deadline: bigint,
  signerProvider: any // Privy wallet or ethers provider
): Promise<string> {
  // Convert DG amount to wei for signing
  const amountWei = BigInt(amountDG) * BigInt(10 ** 18);

  const message: WithdrawalMessage = {
    user: walletAddress,
    amount: amountWei,
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

### Server Wallet Monitoring

```typescript
// app/api/admin/wallet/balance/route.ts

import { NextResponse } from 'next/server';
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client';
import { getTokenBalance } from '@/lib/token-withdrawal/functions/dg-transfer-service';
import { privateKeyToAccount } from 'viem/accounts';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:wallet-balance');

export async function GET() {
  try {
    const publicClient = createPublicClientUnified();
    const tokenAddress = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}`;
    const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY as `0x${string}`;

    if (!privateKey || !tokenAddress) {
      return NextResponse.json(
        { error: 'Server wallet not configured' },
        { status: 500 }
      );
    }

    const serverWallet = privateKeyToAccount(privateKey).address;

    // Get DG token balance
    const dgBalanceWei = await getTokenBalance(
      publicClient,
      tokenAddress,
      serverWallet
    );

    // Get native ETH balance for gas
    const ethBalance = await publicClient.getBalance({ address: serverWallet });

    const dgBalance = Number(dgBalanceWei / BigInt(10 ** 18));
    const ethBalanceFormatted = Number(ethBalance) / 10 ** 18;

    // Alert thresholds
    const DG_LOW_THRESHOLD = 10000; // Alert if < 10k DG
    const ETH_LOW_THRESHOLD = 0.01; // Alert if < 0.01 ETH

    const alerts = [];
    if (dgBalance < DG_LOW_THRESHOLD) {
      alerts.push({
        type: 'low_dg_balance',
        message: `DG balance is low: ${dgBalance} DG (threshold: ${DG_LOW_THRESHOLD})`,
        severity: 'warning'
      });
    }

    if (ethBalanceFormatted < ETH_LOW_THRESHOLD) {
      alerts.push({
        type: 'low_eth_balance',
        message: `ETH balance is low: ${ethBalanceFormatted.toFixed(4)} ETH (threshold: ${ETH_LOW_THRESHOLD})`,
        severity: 'critical'
      });
    }

    log.info('Server wallet balance checked', {
      dgBalance,
      ethBalance: ethBalanceFormatted,
      hasAlerts: alerts.length > 0
    });

    return NextResponse.json({
      success: true,
      balances: {
        dg: dgBalance,
        eth: ethBalanceFormatted,
        dgRaw: dgBalanceWei.toString(),
        ethRaw: ethBalance.toString()
      },
      thresholds: {
        dg: DG_LOW_THRESHOLD,
        eth: ETH_LOW_THRESHOLD
      },
      alerts,
      serverWallet
    });
  } catch (error) {
    log.error('Failed to check wallet balance', { error });
    return NextResponse.json(
      { success: false, error: 'Failed to check balance' },
      { status: 500 }
    );
  }
}
```

**Note**: All validation logic (minimum amount, daily limits, balance checks) is now handled atomically in the `initiate_withdrawal()` database function. This ensures race-condition-free operation.

---

## API Endpoint Flow

### POST `/api/token/withdraw`

```typescript
// app/api/token/withdraw/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyTypedData, type Address } from 'viem';
import { createPublicClientUnified } from '@/lib/blockchain/config/clients/public-client';
import { createWalletClientUnified } from '@/lib/blockchain/config/clients/wallet-client';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import {
  transferDGTokens,
  hasValidDGNationKey
} from '@/lib/token-withdrawal/functions/dg-transfer-service';
import { WITHDRAWAL_DOMAIN, WITHDRAWAL_TYPES } from '@/lib/token-withdrawal/eip712/types';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:token:withdraw');

const DG_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET as `0x${string}`;
const DG_NATION_LOCK = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

/**
 * Simplified Request Flow:
 * 1. Authenticate user (Privy)
 * 2. Check DG Nation NFT ownership (if configured)
 * 3. Verify EIP712 signature
 * 4. Check signature deadline
 * 5. Atomic DB operation (validates limits, deducts XP, creates withdrawal)
 * 6. Blockchain transfer
 * 7. On success: complete withdrawal
 * 8. On failure: rollback XP and mark failed
 */

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request
    const { walletAddress, amountDG, signature, deadline } = await req.json();

    if (!walletAddress || !amountDG || !signature || !deadline) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 2. Check DG Nation membership (if required)
    if (DG_NATION_LOCK) {
      const publicClient = createPublicClientUnified();
      const hasAccess = await hasValidDGNationKey(
        publicClient,
        walletAddress as Address,
        DG_NATION_LOCK
      );

      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: 'DG Nation membership required' },
          { status: 403 }
        );
      }
    }

    // 3. Verify EIP712 signature
    const amountWei = BigInt(amountDG) * BigInt(10 ** 18);
    const message = {
      user: walletAddress as Address,
      amount: amountWei,
      deadline: BigInt(deadline)
    };

    const isValid = await verifyTypedData({
      address: walletAddress as Address,
      domain: WITHDRAWAL_DOMAIN,
      types: WITHDRAWAL_TYPES,
      primaryType: 'Withdrawal',
      message,
      signature: signature as `0x${string}`
    });

    if (!isValid) {
      log.warn('Invalid signature', { user: user.id, walletAddress });
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 403 }
      );
    }

    // 4. Check deadline
    const now = Math.floor(Date.now() / 1000);
    if (now > Number(deadline)) {
      return NextResponse.json(
        { success: false, error: 'Signature expired' },
        { status: 400 }
      );
    }

    // 5. Atomic DB operation (validates, deducts XP, creates withdrawal)
    const supabase = createAdminClient();
    const { data: withdrawalData, error: dbError } = await supabase.rpc(
      'initiate_withdrawal',
      {
        p_user_id: user.id,
        p_amount_dg: amountDG,
        p_signature: signature,
        p_deadline: deadline,
        p_wallet_address: walletAddress
      }
    );

    if (dbError || !withdrawalData?.success) {
      log.error('DB withdrawal initiation failed', { error: dbError, data: withdrawalData });
      return NextResponse.json(
        { success: false, error: withdrawalData?.error || 'Failed to initiate withdrawal' },
        { status: 400 }
      );
    }

    const withdrawalId = withdrawalData.withdrawal_id;

    // If idempotent (signature already used), return existing withdrawal
    if (withdrawalData.idempotent) {
      const { data: existing } = await supabase
        .from('dg_token_withdrawals')
        .select('status, transaction_hash')
        .eq('id', withdrawalId)
        .single();

      return NextResponse.json({
        success: true,
        idempotent: true,
        withdrawalId,
        status: existing?.status,
        transactionHash: existing?.transaction_hash
      });
    }

    // 6. Blockchain transfer
    const walletClient = createWalletClientUnified();
    if (!walletClient) {
      await supabase.rpc('rollback_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_error_message: 'Server wallet not configured'
      });
      return NextResponse.json(
        { success: false, error: 'Server wallet not configured' },
        { status: 500 }
      );
    }

    try {
      const transferResult = await transferDGTokens(walletClient, {
        recipientAddress: walletAddress as Address,
        amount: amountWei,
        tokenAddress: DG_TOKEN_ADDRESS
      });

      if (transferResult.success && transferResult.transactionHash) {
        // 7. Complete withdrawal
        await supabase.rpc('complete_withdrawal', {
          p_withdrawal_id: withdrawalId,
          p_tx_hash: transferResult.transactionHash
        });

        log.info('Withdrawal completed', {
          userId: user.id,
          withdrawalId,
          txHash: transferResult.transactionHash,
          amountDG
        });

        return NextResponse.json({
          success: true,
          withdrawalId,
          transactionHash: transferResult.transactionHash,
          amountDG
        });
      } else {
        // 8. Rollback on failure
        await supabase.rpc('rollback_withdrawal', {
          p_withdrawal_id: withdrawalId,
          p_error_message: transferResult.error || 'Transfer failed'
        });

        log.error('Blockchain transfer failed', {
          userId: user.id,
          withdrawalId,
          error: transferResult.error
        });

        return NextResponse.json(
          { success: false, error: transferResult.error || 'Transfer failed' },
          { status: 500 }
        );
      }
    } catch (blockchainError) {
      // Rollback on exception
      await supabase.rpc('rollback_withdrawal', {
        p_withdrawal_id: withdrawalId,
        p_error_message: blockchainError instanceof Error ? blockchainError.message : 'Unknown error'
      });

      log.error('Blockchain transfer exception', {
        userId: user.id,
        withdrawalId,
        error: blockchainError
      });

      return NextResponse.json(
        { success: false, error: 'Transfer failed' },
        { status: 500 }
      );
    }
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
  amountDG: number;      // DG amount as integer (e.g., 5000)
  signature: string;      // EIP712 signature
  deadline: number;       // Unix timestamp (seconds)
}

// Response (success)
interface WithdrawSuccessResponse {
  success: true;
  withdrawalId: string;
  transactionHash: string;
  amountDG: number;
  idempotent?: boolean;  // True if signature was already used
}

// Response (failure)
interface WithdrawErrorResponse {
  success: false;
  error: string;
}
```

### GET `/api/token/withdraw/history`

```typescript
// app/api/token/withdraw/history/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:token:withdraw:history');

export async function GET(req: NextRequest) {
  try {
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createAdminClient();
    const { data, error, count } = await supabase
      .from('dg_token_withdrawals')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Failed to fetch withdrawal history', { error, userId: user.id });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawals: data,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    log.error('Withdrawal history request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Client Implementation

### Hook: `useDGNationKey`

```typescript
// hooks/useDGNationKey.ts

import { useState, useEffect } from 'react';
import { createViemPublicClient } from '@/lib/blockchain/providers/privy-viem';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { abi as lockAbi } from '@/constants/public_lock_abi';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useDGNationKey');

export interface DGNationKeyInfo {
  hasValidKey: boolean;
  expirationTimestamp: bigint | null;
  expiresAt: Date | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to check if user has a valid DG Nation NFT and when it expires
 * Reusable across components for access control
 */
export function useDGNationKey() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [keyInfo, setKeyInfo] = useState<DGNationKeyInfo>({
    hasValidKey: false,
    expirationTimestamp: null,
    expiresAt: null,
    isLoading: true,
    error: null
  });

  const activeWallet = wallets?.[0]?.address;
  const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;
  
  useEffect(() => {
    if (!activeWallet || !lockAddress) {
      setKeyInfo(prev => ({ 
        ...prev, 
        isLoading: false,
        error: !lockAddress ? 'DG Nation lock not configured' : !activeWallet ? 'No wallet connected' : null
      }));
      return;
    }

    async function checkKeyStatus() {
      try {
        setKeyInfo(prev => ({ ...prev, isLoading: true, error: null }));
        const publicClient = createViemPublicClient();
        
        // Check if user has valid key
        const hasKey = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'getHasValidKey',
          args: [activeWallet]
        });
        
        if (!hasKey) {
          setKeyInfo({
            hasValidKey: false,
            expirationTimestamp: null,
            expiresAt: null,
            isLoading: false,
            error: null
          });
          return;
        }
        
        // If user has key, get tokenId
        // First get user's balance
        const balance = await publicClient.readContract({
          address: lockAddress, 
          abi: lockAbi,
          functionName: 'balanceOf',
          args: [activeWallet]
        });
        
        if (Number(balance) === 0) {
          // This shouldn't happen if getHasValidKey returned true
          throw new Error('Key reported as valid but balance is 0');
        }
        
        // Get the first token ID
        const tokenId = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'tokenOfOwnerByIndex',
          args: [activeWallet, 0n] // Get first token
        });
        
        // Get expiration timestamp
        const expirationTimestamp = await publicClient.readContract({
          address: lockAddress,
          abi: lockAbi,
          functionName: 'keyExpirationTimestampFor',
          args: [tokenId]
        });
        
        // Convert timestamp (in seconds) to Date
        const expiresAt = new Date(Number(expirationTimestamp) * 1000);
        
        setKeyInfo({
          hasValidKey: true,
          expirationTimestamp,
          expiresAt,
          isLoading: false,
          error: null
        });
        
      } catch (error) {
        log.error('Failed to check DG Nation key status', { error, wallet: activeWallet });
        setKeyInfo({
          hasValidKey: false,
          expirationTimestamp: null,
          expiresAt: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to check DG Nation status'
        });
      }
    }
    
    checkKeyStatus();
  }, [activeWallet, lockAddress]);
  
  return keyInfo;
}
```

### Hook: `useWithdrawalAccess`

```typescript
// hooks/useWithdrawalAccess.ts

import { useState, useEffect } from 'react';
import { useDGNationKey } from './useDGNationKey';
import { useWithdrawalLimits } from './useWithdrawalLimits';
import { useApiCall } from '@/hooks/useApiCall';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useWithdrawalAccess');

export interface WithdrawalAccessInfo {
  canWithdraw: boolean;
  reason: string | null;
  xpBalance: number;
  isLoading: boolean;
}

/**
 * Hook to determine if user can withdraw DG tokens
 * Combines DG Nation NFT check + XP balance check with dynamic limits
 */
export function useWithdrawalAccess() {
  const { hasValidKey, isLoading: isLoadingKey, error: keyError } = useDGNationKey();
  const { minAmount, isLoading: isLoadingLimits } = useWithdrawalLimits();
  const [accessInfo, setAccessInfo] = useState<WithdrawalAccessInfo>({
    canWithdraw: false,
    reason: null,
    xpBalance: 0,
    isLoading: true
  });

  const { data: xpData, isLoading: isLoadingXp, error: xpError } = useApiCall<{ xp: number }>('/api/user/experience-points');

  useEffect(() => {
    if (isLoadingKey || isLoadingXp || isLoadingLimits) {
      setAccessInfo(prev => ({ ...prev, isLoading: true }));
      return;
    }

    // First check NFT requirement
    if (!hasValidKey) {
      setAccessInfo({
        canWithdraw: false,
        reason: keyError || 'DG Nation membership required to withdraw DG tokens',
        xpBalance: xpData?.xp || 0,
        isLoading: false
      });
      return;
    }

    // Then check XP balance against dynamic minimum
    const hasEnoughXP = (xpData?.xp || 0) >= minAmount;

    setAccessInfo({
      canWithdraw: hasEnoughXP,
      reason: !hasEnoughXP ? `Minimum ${minAmount} DG required (current: ${xpData?.xp || 0})` : null,
      xpBalance: xpData?.xp || 0,
      isLoading: false
    });

  }, [hasValidKey, isLoadingKey, isLoadingXp, isLoadingLimits, xpData, keyError, xpError, minAmount]);

  return accessInfo;
}
```

### UI Component: `SubscriptionBadge`

```tsx
// components/token-withdrawal/SubscriptionBadge.tsx

import React from 'react';
import { useDGNationKey } from '@/hooks/useDGNationKey';
import { formatDistanceToNow } from 'date-fns';

interface SubscriptionBadgeProps {
  showExpiry?: boolean;
  compact?: boolean;
}

export function SubscriptionBadge({ showExpiry = true, compact = false }: SubscriptionBadgeProps) {
  const { hasValidKey, expiresAt, isLoading, error } = useDGNationKey();
  
  if (isLoading) {
    return <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
      <span className="animate-pulse">Loading...</span>
    </div>;
  }
  
  if (error) {
    return <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      Error
    </div>;
  }
  
  if (!hasValidKey) {
    return <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
      <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
      </svg>
      {compact ? 'No Access' : 'DG Nation Membership Required'}
    </div>;
  }
  
  // User has valid key
  return <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
    {compact ? 'Active' : 'DG Nation Member'}
    {showExpiry && expiresAt && (
      <span className="ml-1 text-green-700">
        • Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
      </span>
    )}
  </div>;
}
```

### UI Component: `SubscriptionExpiryInfo`

```tsx
// components/token-withdrawal/SubscriptionExpiryInfo.tsx

import React from 'react';
import { useDGNationKey } from '@/hooks/useDGNationKey';
import { format, isBefore, addDays } from 'date-fns';

interface SubscriptionExpiryInfoProps {
  showRenewWarning?: boolean;
  warningDays?: number;
}

export function SubscriptionExpiryInfo({ 
  showRenewWarning = true,
  warningDays = 7 
}: SubscriptionExpiryInfoProps) {
  const { hasValidKey, expiresAt, isLoading, error } = useDGNationKey();
  
  if (isLoading || error || !hasValidKey || !expiresAt) {
    return null; // Don't show anything if there's no valid subscription
  }
  
  const now = new Date();
  const warningDate = addDays(now, warningDays);
  const isExpiringSoon = isBefore(expiresAt, warningDate);
  
  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-700">DG Nation Subscription</h3>
      <p className="mt-1 text-sm text-gray-500">
        Your subscription expires on <span className="font-medium">{format(expiresAt, 'PPP')}</span>
      </p>
      
      {showRenewWarning && isExpiringSoon && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Expiring soon!</span> Your DG Nation membership expires in {
              formatDistanceToNow(expiresAt)
            }. Renew to maintain withdrawal access.
          </p>
          <a 
            href="https://app.unlock-protocol.com/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="mt-2 inline-flex items-center text-sm text-yellow-800 font-medium hover:underline"
          >
            Renew Subscription
            <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
```

### UI Component: `AccessRequirementCard`

```tsx
// components/token-withdrawal/AccessRequirementCard.tsx

import React, { useState } from 'react';
import { useDGNationKey } from '@/hooks/useDGNationKey';
import { useKeyPurchase } from '@/hooks/unlock/useKeyPurchase';
import { formatEther } from 'viem';

export function AccessRequirementCard() {
  const { hasValidKey, isLoading: isLoadingKey } = useDGNationKey();
  const { purchaseKey, isLoading: isPurchasing } = useKeyPurchase();
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  
  if (isLoadingKey || hasValidKey || isSuccess) {
    return null; // Don't show if loading, user already has access, or purchase was successful
  }

  const handlePurchase = async () => {
    try {
      setError(null);
      const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;
      
      if (!lockAddress) {
        setError('Lock address not configured');
        return;
      }
      
      const result = await purchaseKey({
        lockAddress: lockAddress as `0x${string}`,
        // The useKeyPurchase hook will handle recipients, keyManagers, and referrers
        // with smart defaults (recipient = current user, etc.)
      });
      
      if (result.success) {
        setIsSuccess(true);
        // Optionally trigger a refresh of the key status
        setTimeout(() => window.location.reload(), 3000);
      } else {
        setError(result.error || 'Purchase failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during purchase');
    }
  };
  
  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h3 className="font-medium text-blue-900">DG Nation Membership Required</h3>
      <p className="mt-1 text-sm text-blue-700">
        You need an active DG Nation membership NFT to withdraw DG tokens. 
        This is a recurring subscription NFT that provides access to exclusive features.
      </p>
      
      {error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-md">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
      
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={handlePurchase}
          disabled={isPurchasing}
          className={`inline-flex items-center px-3 py-1.5 border border-blue-600 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isPurchasing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Purchasing...
            </>
          ) : (
            'Purchase Membership'
          )}
        </button>
        
        <a
          href="https://app.unlock-protocol.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-1.5 border border-blue-500 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
        >
          Learn More
          <svg className="ml-1 -mr-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
    </div>
  );
}
```

### Hook: `useDGWithdrawal`

```typescript
// hooks/useDGWithdrawal.ts

import { useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { signWithdrawalMessage } from '@/lib/token-withdrawal/eip712/client-signing';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useDGWithdrawal');

export function useDGWithdrawal() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const initiateWithdrawal = async (amountDG: number) => {
    try {
      setIsLoading(true);
      setError(null);
      setTxHash(null);

      if (!user || !wallets || wallets.length === 0) {
        throw new Error('Wallet not connected');
      }

      const wallet = wallets[0];
      const walletAddress = wallet.address;

      // 1. Calculate deadline (15 minutes from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);

      // 2. Sign EIP712 message
      const signature = await signWithdrawalMessage(
        walletAddress as `0x${string}`,
        amountDG,
        deadline,
        wallet // Privy wallet has signTypedData method
      );

      log.info('Withdrawal signature created', { amountDG, deadline: deadline.toString() });

      // 3. Submit to API
      const response = await fetch('/api/token/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          amountDG,
          signature,
          deadline: Number(deadline)
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Withdrawal failed');
      }

      setTxHash(data.transactionHash);
      log.info('Withdrawal successful', { txHash: data.transactionHash });

      return {
        success: true,
        txHash: data.transactionHash,
        withdrawalId: data.withdrawalId
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      log.error('Withdrawal failed', { error: err });
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    initiateWithdrawal,
    isLoading,
    error,
    txHash
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
- A) Require DG Nation NFT (stricter, more exclusive) ✅ SELECTED
- B) Open to all users with XP (more accessible)
- C) Tiered: NFT holders get higher limits

**Decision:** Option A - Require DG Nation NFT ownership to withdraw DG tokens. This creates exclusivity and adds value to the NFT.

---

### 2. Daily Limit Reset
**Question:** Should the 24-hour window be rolling (last 24 hours) or calendar-based (midnight UTC)?

**Options:**
- A) Rolling 24 hours (e.g., if you withdraw at 3pm Tuesday, limit resets 3pm Wednesday) ✅ SELECTED
- B) Calendar day (resets at midnight UTC every day)

**Decision:** Option A - Rolling 24 hours window. This is simpler, fairer, and avoids timezone confusion for users.

---

### 3. Decimal Handling
**Question:** DG token has 18 decimals, right? So 3000 DG minimum = 3000 * 10^18 wei?

**Decision:** Yes, confirmed. DG token follows standard ERC20 with 18 decimals. Implementation will use 3000 * 10^18 wei for the minimum amount.

---

### 4. UI Placement
**Question:** Where should the withdraw button live?

**Options:**
- A) Dashboard (high visibility)
- B) Profile page (alongside other account actions)
- C) Dedicated "Rewards" page (cleaner separation)
- D) Multiple locations (dashboard + profile) ✅ SELECTED

**Decision:** Option D - Implement withdrawal functionality in multiple strategic locations (dashboard and profile page) for maximum discoverability and user convenience.

---

### 5. Server Wallet Funding
**Question:** How will the server wallet (`LOCK_MANAGER_PRIVATE_KEY` address) be funded with DG tokens initially?

**Options:**
- A) Manual transfer from treasury ✅ SELECTED
- B) Automated funding from another contract
- C) Just-in-time funding when balance is low

**Decision:** Option A - Treasury will manually fund the server wallet with DG tokens. The operations team will be responsible for monitoring the balance and replenishing when needed. This process will be documented in an internal operations guide.

---

### 6. Withdrawal History
**Question:** Should users see their withdrawal history? If yes, how many records?

**Options:**
- A) Yes, show last 10 withdrawals
- B) Yes, show last 50 withdrawals
- C) Yes, show all withdrawals (paginated) ✅ SELECTED
- D) No history needed

**Decision:** Option C - Show all withdrawal history with pagination. This provides complete transparency for users and helps with support requests. Default page size will be 10 items per page.

---

### 7. XP-to-DG Conversion Rate
**Question:** Is 1:1 ratio fixed forever, or should it be configurable for future adjustments?

**Options:**
- A) Keep 1:1 forever (simplest) ✅ SELECTED
- B) Make configurable via env variable
- C) Make dynamic based on DG token price

**Decision:** Option A - Keep the 1:1 ratio fixed forever. This provides simplicity and clarity for users. The ratio will be hardcoded in the database constraint as already planned.

---

### 8. Failure Recovery
**Question:** If blockchain transfer fails but XP was deducted, should we:
- A) Auto-retry the transfer ✅ SELECTED
- B) Require user to manually retry
- C) Allow admin to manually process failed withdrawals

**Decision:** Option A with rollback safety - Automatically retry the transfer with configurable retry attempts (default: 3 retries with exponential backoff). If all retries fail, roll back the XP deduction to ensure no funds are lost. This combines the convenience of automatic retries with the safety of rollbacks.

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
- [ ] Unit tests for DG transfer service functions
- [ ] Unit tests for atomic DB functions (initiate_withdrawal, rollback_withdrawal, complete_withdrawal)
- [ ] Integration test: Full withdrawal flow (happy path)
- [ ] Integration test: Insufficient balance (validated in DB function)
- [ ] Integration test: Daily limit exceeded (validated in DB function)
- [ ] Integration test: Invalid signature
- [ ] Integration test: Expired signature
- [ ] Integration test: Signature replay (idempotency via unique signature)
- [ ] Integration test: Concurrent withdrawals (row locking prevents race conditions)
- [ ] Integration test: Blockchain transfer failure (automatic rollback)
- [ ] E2E test: Complete user journey from UI to wallet
- [ ] Load test: Multiple concurrent withdrawal requests

---

## Deployment Checklist

- [x] Create database migration `086_dg_token_withdrawals.sql`
- [x] Create database migration `087_configurable_withdrawal_limits.sql`
- [x] Apply migrations to local DB
- [ ] Add environment variables to `.env.example`
- [ ] Add environment variables to deployment (Vercel/Railway)
- [ ] Fund server wallet with initial DG tokens
- [ ] Test on Base Sepolia testnet first
- [ ] Configure initial withdrawal limits in admin UI (or use defaults: 3000 min, 100000 max)
- [ ] Monitor server wallet balance (alert when low)
- [ ] Set up error monitoring/alerting for failed withdrawals
- [ ] Document server wallet funding process
- [ ] Create runbook for common issues
- [ ] Grant admin access to team members who will manage withdrawal limits

---

## Implementation Order

### Phase 1: Core Infrastructure (3-4 hours) ✅ COMPLETED
1. **Database migration** (`086_dg_token_withdrawals.sql`)
   - Create `dg_token_withdrawals` table
   - Implement `initiate_withdrawal()` atomic function
   - Implement `complete_withdrawal()` function
   - Implement `rollback_withdrawal()` function
   - Add indexes and RLS policies

2. **EIP712 implementation**
   - Create type definitions (`lib/token-withdrawal/eip712/types.ts`)
   - Client-side signing function (`client-signing.ts`)
   - Server-side verification (`server-verification.ts`)

3. **DG transfer service** (`lib/token-withdrawal/functions/dg-transfer-service.ts`)
   - `transferDGTokens()` function
   - `getTokenBalance()` function
   - `hasValidDGNationKey()` function

### Phase 1.5: Dynamic Configuration System (2-3 hours) ✅ COMPLETED
1. **Database migration** (`087_configurable_withdrawal_limits.sql`)
   - Create `system_config` key-value table
   - Create `config_audit_log` table
   - Implement `get_config_int()` helper function
   - Create audit trigger
   - Update `initiate_withdrawal()` to use dynamic config

2. **API endpoints** (`app/api/admin/config/withdrawal-limits/`)
   - GET endpoint (public) - fetch current limits
   - PUT endpoint (admin-protected) - update limits
   - GET /audit endpoint (admin-protected) - fetch change history

3. **Client integration**
   - `useWithdrawalLimits` hook
   - Update `useWithdrawalAccess` to use dynamic limits
   - Update `WithdrawDGModal` to use dynamic limits

4. **Admin UI**
   - `WithdrawalLimitsConfig` component with form and audit history

### Phase 2: API Layer (2-3 hours) ✅ COMPLETED
1. **Main withdrawal endpoint** (`app/api/token/withdraw/route.ts`)
   - POST handler with signature verification
   - Atomic DB call
   - Blockchain transfer with rollback

2. **History endpoint** (`app/api/token/withdraw/history/route.ts`)
   - GET handler with pagination

3. **Admin monitoring** (`app/api/admin/wallet/balance/route.ts`)
   - Wallet balance check endpoint
   - Alert thresholds

### Phase 3: Client Layer (3-4 hours) ✅ COMPLETED
1. **Core hooks**
   - `useDGWithdrawal` - Main withdrawal orchestration
   - `useDGNationKey` - NFT ownership check
   - `useWithdrawalAccess` - Combined access check

2. **UI components**
   - `WithdrawDGButton` - Trigger button
   - `WithdrawDGModal` - Amount input and confirmation
   - `WithdrawalHistoryTable` - Past withdrawals
   - `SubscriptionBadge` - NFT status display
   - `AccessRequirementCard` - NFT purchase prompt

### Phase 4: Testing & Polish (2-3 hours) ⏳ PENDING
1. Unit tests for critical functions
2. Integration tests for API endpoints
3. E2E test for complete flow
4. Error handling refinement
5. Loading states and user feedback

### Phase 5: Deployment (1-2 hours) ⏳ PENDING
1. Apply migrations to production
2. Fund server wallet with DG tokens
3. Test on Base Sepolia first
4. Deploy to production
5. Set up monitoring alerts
6. Configure initial withdrawal limits via admin UI

**Total Estimated Time: 13-19 hours** (approximately 2-3 development days)
**Actual Implementation Time: ~13 hours** (Phases 1-3 including dynamic configuration)

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
**Implementation Status:** Core Feature Complete (Phases 1-3) ✅
**Key Enhancements:**
- Removed nonce complexity
- Added atomic DB functions
- Fixed decimal handling
- Implemented dynamic configuration system with admin UI
- Complete audit trail for compliance

**Next Steps:**
1. Testing & Polish (Phase 4)
2. Production Deployment (Phase 5)

**Total Lines Implemented:** ~2,500 lines across 25+ files
