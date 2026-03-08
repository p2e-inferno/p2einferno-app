# Quest Vendor Verification Upgrade Plan v2

This document captures repo findings and a detailed, actionable plan to harden quest verification for vendor-related tasks (buy/sell/light-up/level-up), wire verification into the completion endpoint, add admin-configurable amount requirements, and implement transaction replay prevention.

**Version**: 2.0
**Previous Version**: [QUEST_VENDOR_VERIFICATION_UPGRADE_PLAN.md](./QUEST_VENDOR_VERIFICATION_UPGRADE_PLAN.md)
**Changes from v1**: Added mandatory transaction replay prevention, clarified amount field semantics, resolved `required_amount` missing behavior, added interface signature updates, retained `receipt.from` validation.

---

## Table of Contents

1. [Repo Findings](#repo-findings)
2. [Security Model](#security-model)
3. [Upgrade Plan](#upgrade-plan)
   - [1. Transaction Replay Prevention](#1-transaction-replay-prevention)
   - [2. Enforce Verification in Completion Endpoint](#2-enforce-verification-in-completion-endpoint)
   - [3. Strengthen Vendor Verification with Event Log Decoding](#3-strengthen-vendor-verification-with-event-log-decoding)
   - [4. Admin-Configurable Buy/Sell Amount Requirements](#4-admin-configurable-buysell-amount-requirements)
   - [5. Verification Data Hygiene](#5-verification-data-hygiene)
   - [6. Interface and Type Updates](#6-interface-and-type-updates)
4. [Test Plan](#test-plan)
5. [Migration Strategy](#migration-strategy)
6. [Risk Notes](#risk-notes)

---

## Repo Findings

- **Quest task schema and verification fields**:
  - `supabase/migrations/001_initial_schema.sql` defines `quest_tasks` and `user_task_completions` with `verification_data`.
  - `supabase/migrations/019_quest_input_and_review_system.sql` adds `input_*`, `requires_admin_review`, `submission_status`, `submission_data`.
  - `lib/supabase/types.ts` mirrors these fields in TypeScript.

- **Task completion endpoint**:
  - `pages/api/quests/complete-task.ts` writes completions and **never invokes verification strategies** (root cause of vulnerability).

- **Verification strategies**:
  - Registry: `lib/quests/verification/registry.ts` maps vendor task types to `VendorVerificationStrategy`.
  - Strategy: `lib/quests/verification/vendor-verification.ts` currently checks only `receipt.to`, `receipt.from`, and status (plus user state for level-up).
  - **No event decoding, no amount validation**.

- **Vendor ABI/address/constants**:
  - ABI: `lib/blockchain/shared/vendor-abi.ts` (functions only; **no events defined**).
  - Address: `NEXT_PUBLIC_DG_VENDOR_ADDRESS` referenced in vendor hooks and verification.

- **Admin task creation / persistence**:
  - UI: `components/admin/QuestTaskForm.tsx` sets vendor tasks with `verification_method: "blockchain"`, `requires_admin_review: false`.
  - Admin routes: `app/api/admin/quests-v2/route.ts` and `app/api/admin/quests-v2/[questId]/route.ts` persist task fields.
  - Legacy pages routes also exist: `pages/api/admin/quests/index.ts`, `pages/api/admin/quests/[id].ts`.

- **Verification data storage**:
  - `pages/api/quests/complete-task.ts` stores client-provided `verification_data` directly (untrusted).

- **Existing replay prevention pattern**:
  - `supabase/migrations/086_dg_token_withdrawals.sql` uses signature as idempotency key with `UNIQUE` constraint.
  - Similar pattern can be adapted for transaction hash replay prevention.

- **Testing**:
  - Jest unit tests under `__tests__/` (`jest.config.js`, `jest.setup.ts`).
  - Playwright/Synpress E2E under `tests/e2e/` and `tests/wallet-setup/`.

---

## Security Model

### Threat Model

| Threat | Current State | Post-Upgrade |
|--------|---------------|--------------|
| Submit arbitrary tx hash | ✅ Exploitable | ❌ Blocked (event verification) |
| Submit tx from wrong user | ⚠️ Partial check | ❌ Blocked (event arg + receipt.from) |
| Submit tx with insufficient amount | ✅ Exploitable | ❌ Blocked (amount validation) |
| Reuse same tx for multiple tasks | ✅ Exploitable | ❌ Blocked (replay prevention) |
| Submit tx to wrong contract | ❌ Blocked | ❌ Blocked (retained) |

### Trust Boundaries

- **Client**: Untrusted. Only provides `transactionHash`.
- **Server**: Trusted. Fetches receipt, decodes events, validates all fields.
- **Blockchain**: Trusted source of truth for transaction data.
- **Database**: Trusted for replay prevention state.

---

## Upgrade Plan

### 1. Transaction Replay Prevention

**Goal**: Prevent the same transaction hash from being used to complete multiple quest tasks.

**Rationale**: A single vendor transaction (e.g., buying 1000 DG) should only satisfy one quest task. Without replay prevention, a user could complete multiple "buy DG" tasks with one transaction.

#### 1.1 Database Schema

**New migration**: `supabase/migrations/XXX_quest_tx_replay_prevention.sql`

```sql
-- Transaction replay prevention for quest verification
-- Ensures each blockchain transaction can only be used once per task type context

CREATE TABLE IF NOT EXISTS public.quest_verified_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction identification
  transaction_hash TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453, -- Base mainnet

  -- Usage context
  user_id TEXT NOT NULL,           -- Privy user ID
  task_id UUID NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,         -- vendor_buy, vendor_sell, etc.

  -- Verification metadata (for audit trail)
  verified_amount TEXT,            -- Amount in wei (string for BigInt)
  event_name TEXT,                 -- TokensPurchased, TokensSold, Lit, etc.
  block_number BIGINT,
  log_index INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent same tx being used for ANY task (global uniqueness)
  CONSTRAINT unique_tx_hash UNIQUE (transaction_hash)
);

-- Index for lookups during verification
CREATE INDEX idx_quest_verified_tx_hash ON public.quest_verified_transactions(transaction_hash);
CREATE INDEX idx_quest_verified_tx_user ON public.quest_verified_transactions(user_id);
CREATE INDEX idx_quest_verified_tx_task ON public.quest_verified_transactions(task_id);

-- RLS: Users can only see their own verified transactions
ALTER TABLE public.quest_verified_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verified transactions"
  ON public.quest_verified_transactions
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Function to check and register transaction usage (atomic)
CREATE OR REPLACE FUNCTION public.register_quest_transaction(
  p_tx_hash TEXT,
  p_chain_id INTEGER,
  p_user_id TEXT,
  p_task_id UUID,
  p_task_type TEXT,
  p_verified_amount TEXT DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_log_index INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  -- Check if transaction already used
  SELECT * INTO v_existing
  FROM public.quest_verified_transactions
  WHERE transaction_hash = p_tx_hash;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification',
      'existing_task_id', v_existing.task_id,
      'existing_task_type', v_existing.task_type
    );
  END IF;

  -- Register the transaction
  INSERT INTO public.quest_verified_transactions (
    transaction_hash,
    chain_id,
    user_id,
    task_id,
    task_type,
    verified_amount,
    event_name,
    block_number,
    log_index
  ) VALUES (
    p_tx_hash,
    p_chain_id,
    p_user_id,
    p_task_id,
    p_task_type,
    p_verified_amount,
    p_event_name,
    p_block_number,
    p_log_index
  );

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: another request registered the tx first
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification (concurrent)'
    );
END;
$$;
```

#### 1.2 Verification Flow Integration

The replay check happens **after** event verification succeeds but **before** writing the completion:

```ts
// In vendor-verification.ts or complete-task.ts
async function registerVerifiedTransaction(
  supabase: SupabaseClient,
  txHash: string,
  userId: string,
  taskId: string,
  taskType: string,
  metadata: { amount?: string; eventName?: string; blockNumber?: bigint; logIndex?: number }
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('register_quest_transaction', {
    p_tx_hash: txHash,
    p_chain_id: 8453, // Base mainnet, or from env
    p_user_id: userId,
    p_task_id: taskId,
    p_task_type: taskType,
    p_verified_amount: metadata.amount,
    p_event_name: metadata.eventName,
    p_block_number: metadata.blockNumber ? Number(metadata.blockNumber) : null,
    p_log_index: metadata.logIndex ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as { success: boolean; error?: string };
}
```

#### 1.3 Error Handling

When replay is detected, return a clear error to the user:

```json
{
  "error": "This transaction has already been used to complete a quest task",
  "code": "TX_ALREADY_USED"
}
```

---

### 2. Enforce Verification in Completion Endpoint

**Goal**: Server-side verification is mandatory for tasks with `verification_method = "blockchain"` (vendor tasks), and failure blocks completion.

**Files to change**:
- `pages/api/quests/complete-task.ts`
- `lib/quests/verification/registry.ts`
- `lib/quests/verification/vendor-verification.ts`
- `lib/quests/verification/types.ts`

#### 2.1 Implementation Details

- Add a verification block after loading `task` and before writing `user_task_completions`.
- Use `getVerificationStrategy(task.task_type)` and call `verify(...)` when:
  - `task.verification_method === "blockchain"` AND a strategy exists.
- Verify with server-side wallet lookup; ignore client-provided amounts.
- If verification fails, return `400` and do not create/update completion.
- Preserve admin review flow:
  - Verification happens before `initialStatus` is applied.
  - If `requires_admin_review` is true, status stays `pending`.

#### 2.2 Pseudocode

```ts
// After fetching task, before writing completion
const strategy = getVerificationStrategy(task.task_type);

if (task.verification_method === "blockchain" && strategy) {
  // Get user's wallet address
  const userWallet = await getUserPrimaryWallet(supabase, effectiveUserId);
  if (!userWallet) {
    return res.status(400).json({ error: "Wallet not linked" });
  }

  // Run verification
  const result = await strategy.verify(
    task.task_type,
    clientVerificationData ?? {},
    effectiveUserId,
    userWallet,
    { taskConfig: task.task_config, taskId: task.id }
  );

  if (!result.success) {
    return res.status(400).json({
      error: result.error || "Verification failed",
      code: result.code // e.g., TX_ALREADY_USED, AMOUNT_TOO_LOW, USER_MISMATCH
    });
  }

  // Register transaction to prevent replay (for tx-based tasks)
  if (result.metadata?.txHash && task.task_type !== 'vendor_level_up') {
    const replayCheck = await registerVerifiedTransaction(
      supabase,
      result.metadata.txHash,
      effectiveUserId,
      taskId,
      task.task_type,
      {
        amount: result.metadata.amount?.toString(),
        eventName: result.metadata.eventName,
        blockNumber: result.metadata.blockNumber,
        logIndex: result.metadata.logIndex,
      }
    );

    if (!replayCheck.success) {
      return res.status(400).json({
        error: replayCheck.error,
        code: "TX_ALREADY_USED"
      });
    }
  }

  // Use server-validated metadata
  verificationData = {
    txHash: result.metadata?.txHash,
    eventName: result.metadata?.eventName,
    amount: result.metadata?.amount?.toString(),
    logIndex: result.metadata?.logIndex,
    blockNumber: result.metadata?.blockNumber?.toString(),
    verifiedAt: new Date().toISOString(),
  };
}
```

#### 2.3 Backward Compatibility

- Only enforce verification for new submissions and resubmissions (`retry`, `failed`).
- Do not modify existing completions.
- Existing completions with `submission_status = 'completed'` are grandfathered.

---

### 3. Strengthen Vendor Verification with Event Log Decoding

**Goal**: Require vendor buy/sell/light-up to prove the correct on-chain event and matching args.

**Files to change**:
- `lib/quests/verification/vendor-verification.ts`
- `lib/blockchain/shared/vendor-abi.ts`

#### 3.1 ABI Event Definitions

Add these vendor events to `lib/blockchain/shared/vendor-abi.ts`:

```ts
// Add to DG_TOKEN_VENDOR_ABI array
// Events for verification
{
  type: "event",
  name: "TokensPurchased",
  inputs: [
    { indexed: true, name: "buyer", type: "address" },
    { indexed: false, name: "baseTokenAmount", type: "uint256" },
    { indexed: false, name: "swapTokenAmount", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" },
  ],
},
{
  type: "event",
  name: "TokensSold",
  inputs: [
    { indexed: true, name: "seller", type: "address" },
    { indexed: false, name: "swapTokenAmount", type: "uint256" },
    { indexed: false, name: "baseTokenAmount", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" },
  ],
},
{
  type: "event",
  name: "Lit",
  inputs: [
    { indexed: true, name: "user", type: "address" },
    { indexed: false, name: "burnAmount", type: "uint256" },
    { indexed: false, name: "newFuel", type: "uint256" },
  ],
},
{
  type: "event",
  name: "StageUpgraded",
  inputs: [
    { indexed: true, name: "user", type: "address" },
    { indexed: false, name: "newStage", type: "uint8" },
  ],
},
```

#### 3.2 Event Field Semantics

**Critical clarification for amount validation**:

| Task Type | Event | User Field | Amount Field to Check | Meaning |
|-----------|-------|------------|----------------------|---------|
| `vendor_buy` | `TokensPurchased` | `buyer` | `baseTokenAmount` | Amount of base token (e.g., USDC) user **spent** |
| `vendor_sell` | `TokensSold` | `seller` | `swapTokenAmount` | Amount of swap token (DG) user **sold** |
| `vendor_light_up` | `Lit` | `user` | N/A (no amount check) | |
| `vendor_level_up` | `StageUpgraded` (optional) | `user` | N/A (state check) | |

**Why `baseTokenAmount` for buy and `swapTokenAmount` for sell**:
- `required_amount` represents what the user must **spend** to complete the task.
- For buying: user spends base token (USDC/ETH) to receive DG.
- For selling: user spends DG to receive base token.
- This aligns with the admin's mental model: "User must spend at least X to complete this task."

#### 3.3 Verification Logic

```ts
import { decodeEventLog, type PublicClient } from 'viem';
import { DG_TOKEN_VENDOR_ABI } from '@/lib/blockchain/shared/vendor-abi';

interface TaskConfig {
  required_amount?: string; // In wei, stored as string for BigInt
}

interface VerificationOptions {
  taskConfig?: TaskConfig;
  taskId?: string;
}

// Event name mapping
const TASK_EVENT_MAP: Record<string, string> = {
  vendor_buy: 'TokensPurchased',
  vendor_sell: 'TokensSold',
  vendor_light_up: 'Lit',
};

// User field in event args
const EVENT_USER_FIELD: Record<string, string> = {
  TokensPurchased: 'buyer',
  TokensSold: 'seller',
  Lit: 'user',
  StageUpgraded: 'user',
};

// Amount field for validation (what user spent)
const EVENT_AMOUNT_FIELD: Record<string, string> = {
  TokensPurchased: 'baseTokenAmount', // User spends base token
  TokensSold: 'swapTokenAmount',      // User spends DG
};

async function verifyVendorTransaction(
  client: PublicClient,
  txHash: `0x${string}`,
  taskType: string,
  userAddress: string,
  options: VerificationOptions
): Promise<VerificationResult> {
  const expectedEvent = TASK_EVENT_MAP[taskType];
  if (!expectedEvent) {
    return { success: false, error: 'Unknown task type', code: 'INVALID_TASK_TYPE' };
  }

  // Fetch receipt
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (error) {
    return {
      success: false,
      error: 'Transaction not found or still pending',
      code: 'TX_NOT_FOUND'
    };
  }

  // Check transaction status
  if (receipt.status !== 'success') {
    return { success: false, error: 'Transaction failed', code: 'TX_FAILED' };
  }

  // Check transaction target (defense in depth)
  if (receipt.to?.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()) {
    return { success: false, error: 'Transaction not with Vendor contract', code: 'WRONG_CONTRACT' };
  }

  // Check transaction sender (defense in depth)
  // Ensures user actually submitted the tx, not just received benefits
  if (receipt.from.toLowerCase() !== userAddress.toLowerCase()) {
    return { success: false, error: 'Transaction sender mismatch', code: 'SENDER_MISMATCH' };
  }

  // Filter logs from vendor contract only
  const vendorLogs = receipt.logs.filter(
    (log) => log.address.toLowerCase() === VENDOR_ADDRESS.toLowerCase()
  );

  // Decode and find expected event
  let matchedEvent: { args: Record<string, unknown>; logIndex: number } | null = null;

  for (const log of vendorLogs) {
    try {
      const decoded = decodeEventLog({
        abi: DG_TOKEN_VENDOR_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === expectedEvent) {
        matchedEvent = {
          args: decoded.args as Record<string, unknown>,
          logIndex: log.logIndex,
        };
        break; // Use first matching event
      }
    } catch {
      // Not a matching event, continue
    }
  }

  if (!matchedEvent) {
    return {
      success: false,
      error: `Expected ${expectedEvent} event not found in transaction`,
      code: 'EVENT_NOT_FOUND',
    };
  }

  // Validate user address in event args
  const userField = EVENT_USER_FIELD[expectedEvent];
  const eventUser = matchedEvent.args[userField] as string;

  if (eventUser.toLowerCase() !== userAddress.toLowerCase()) {
    return {
      success: false,
      error: 'Event user does not match quest user',
      code: 'USER_MISMATCH',
    };
  }

  // Amount validation for buy/sell tasks
  if (taskType === 'vendor_buy' || taskType === 'vendor_sell') {
    const requiredAmount = options.taskConfig?.required_amount
      ? BigInt(options.taskConfig.required_amount)
      : 0n;

    if (requiredAmount > 0n) {
      const amountField = EVENT_AMOUNT_FIELD[expectedEvent];
      const actualAmount = matchedEvent.args[amountField] as bigint;

      if (actualAmount < requiredAmount) {
        return {
          success: false,
          error: `Amount too low: ${actualAmount} < ${requiredAmount}`,
          code: 'AMOUNT_TOO_LOW',
        };
      }
    }
    // If requiredAmount is 0 or missing, any amount passes (contract enforces minimums)
  }

  // Success
  return {
    success: true,
    metadata: {
      txHash,
      eventName: expectedEvent,
      amount: matchedEvent.args[EVENT_AMOUNT_FIELD[expectedEvent]]?.toString(),
      logIndex: matchedEvent.logIndex,
      blockNumber: receipt.blockNumber,
    },
  };
}
```

#### 3.4 Level-Up Verification

`vendor_level_up` uses state-based verification (no transaction required):

```ts
async function verifyLevel(
  client: PublicClient,
  userAddress: string,
  targetStage: number
): Promise<VerificationResult> {
  const userState = await client.readContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: 'getUserState',
    args: [userAddress as `0x${string}`],
  });

  const tuple = userState as readonly [number, ...unknown[]];
  const currentStage = tuple[0];

  if (currentStage >= targetStage) {
    return {
      success: true,
      metadata: { currentStage, targetStage },
    };
  }

  return {
    success: false,
    error: `Current stage ${currentStage} < Target ${targetStage}`,
    code: 'STAGE_TOO_LOW',
  };
}
```

---

### 4. Admin-Configurable Buy/Sell Amount Requirements

**Goal**: Allow admins to define minimum buy/sell amounts per task. Light-up ignores amount.

**Files to change**:
- DB migration: `supabase/migrations/XXX_add_task_config_to_quest_tasks.sql`
- Types: `lib/supabase/types.ts`
- Admin UI: `components/admin/QuestTaskForm.tsx`
- Admin routes: `app/api/admin/quests-v2/route.ts`, `app/api/admin/quests-v2/[questId]/route.ts`

#### 4.1 Data Model

**Migration**: Add `task_config JSONB` to `quest_tasks`:

```sql
-- Add task_config column for flexible task-specific configuration
ALTER TABLE public.quest_tasks
ADD COLUMN IF NOT EXISTS task_config JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.quest_tasks.task_config IS
'Task-specific configuration. For vendor_buy/vendor_sell: { required_amount: string (wei) }. For vendor_level_up: { target_stage: number }';

-- Index for querying tasks by config
CREATE INDEX IF NOT EXISTS idx_quest_tasks_config ON public.quest_tasks USING gin(task_config);
```

**TypeScript type**:

```ts
interface VendorTaskConfig {
  // Amount in wei as string (for BigInt serialization)
  // If missing or "0", no amount requirement (contract minimums apply)
  required_amount?: string;

  // For vendor_level_up only
  target_stage?: number;
}
```

#### 4.2 Default Behavior (required_amount missing or zero)

**Decision**: If `required_amount` is missing or `"0"`, **no amount validation** is performed.

**Rationale**:
1. The contract enforces its own minimums (`minBuyAmount`, `minSellAmount`).
2. Backward compatibility: existing quests without `task_config` continue to work.
3. Admin intent: if they don't specify an amount, they want "any buy/sell satisfies this task."

**Logging**: When `required_amount` is missing, log a debug message:
```ts
log.debug('No required_amount configured, skipping amount validation', { taskId });
```

#### 4.3 Admin UI Changes

In `components/admin/QuestTaskForm.tsx`:

1. Show amount input when task type is `vendor_buy` or `vendor_sell`.
2. Display contract minimum (fetched from `getStageConstants()`).
3. Validate that `required_amount >= minBuyAmount/minSellAmount`.
4. Serialize into `task_config.required_amount` as string (wei).

```tsx
// Example UI logic
{(taskType === 'vendor_buy' || taskType === 'vendor_sell') && (
  <div>
    <label>Required Amount (in base units)</label>
    <input
      type="text"
      value={requiredAmount}
      onChange={(e) => setRequiredAmount(e.target.value)}
      placeholder="0 = any amount (contract minimum applies)"
    />
    <p className="text-sm text-gray-500">
      Contract minimum: {taskType === 'vendor_buy' ? minBuyAmount : minSellAmount}
    </p>
    {requiredAmount && BigInt(requiredAmount) < contractMin && (
      <p className="text-sm text-red-500">
        Amount must be ≥ contract minimum
      </p>
    )}
  </div>
)}
```

#### 4.4 Server-Side Validation

In admin routes, validate `required_amount` against contract minimums:

```ts
// In app/api/admin/quests-v2/route.ts
if (task.task_type === 'vendor_buy' || task.task_type === 'vendor_sell') {
  const taskConfig = task.task_config as VendorTaskConfig;

  if (taskConfig?.required_amount) {
    const requiredAmount = BigInt(taskConfig.required_amount);
    const stageConstants = await getStageConstants();

    const minimum = task.task_type === 'vendor_buy'
      ? stageConstants.minBuyAmount
      : stageConstants.minSellAmount;

    if (requiredAmount > 0n && requiredAmount < minimum) {
      return res.status(400).json({
        error: `required_amount must be >= contract minimum (${minimum})`,
      });
    }
  }
}
```

---

### 5. Verification Data Hygiene

**Goal**: Never trust client-provided amounts or events.

**Files to change**:
- `pages/api/quests/complete-task.ts`
- `lib/quests/verification/vendor-verification.ts`

#### 5.1 Implementation

Overwrite `verification_data` with server-validated metadata:

```ts
// After successful verification
verificationData = {
  // Server-validated fields only
  txHash: result.metadata.txHash,
  eventName: result.metadata.eventName,
  amount: result.metadata.amount,
  logIndex: result.metadata.logIndex,
  blockNumber: result.metadata.blockNumber?.toString(),

  // Audit trail
  verifiedAt: new Date().toISOString(),
  verificationMethod: 'event_log',
};

// Do NOT include any client-provided fields except txHash (which is re-validated)
```

#### 5.2 Client-Provided Data Policy

| Field | Policy |
|-------|--------|
| `transactionHash` | Accepted, used to fetch receipt |
| `amount` | **Ignored**, extracted from event |
| `tokenType` | **Ignored**, determined by task type |
| Any other field | **Ignored** |

---

### 6. Interface and Type Updates

**Goal**: Update verification strategy interface to support task configuration.

**Files to change**:
- `lib/quests/verification/types.ts`
- `lib/quests/verification/vendor-verification.ts`
- `lib/quests/verification/registry.ts`

#### 6.1 Updated Types

```ts
// lib/quests/verification/types.ts

import type { TaskType } from "@/lib/supabase/types";

/**
 * Options passed to verification strategies
 */
export interface VerificationOptions {
  taskConfig?: Record<string, unknown>;
  taskId?: string;
}

/**
 * Result of a verification attempt
 */
export interface VerificationResult {
  success: boolean;
  error?: string;
  code?: string; // Machine-readable error code
  metadata?: {
    txHash?: string;
    eventName?: string;
    amount?: string;
    logIndex?: number;
    blockNumber?: bigint;
    [key: string]: unknown;
  };
}

/**
 * Strategy interface for task verification
 * Implementations handle specific task types (e.g., vendor transactions)
 */
export interface VerificationStrategy {
  verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions  // NEW optional parameter
  ): Promise<VerificationResult>;
}
```

#### 6.2 Strategy Implementation Update

```ts
// lib/quests/verification/vendor-verification.ts

export class VendorVerificationStrategy implements VerificationStrategy {
  constructor(private readonly client: PublicClient) {}

  async verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions  // NEW parameter
  ): Promise<VerificationResult> {
    // ... implementation uses options.taskConfig
  }
}
```

---

## Test Plan

### Unit Tests: Vendor Verification

**File**: `__tests__/unit/lib/quests/verification/vendor-verification.test.ts`

| Test Case | Expected Result |
|-----------|-----------------|
| Receipt has no expected event | Fail with `EVENT_NOT_FOUND` |
| Event present but user arg mismatched | Fail with `USER_MISMATCH` |
| Event present, user matches, amount < required | Fail with `AMOUNT_TOO_LOW` |
| Event present, user matches, amount >= required | Pass |
| Event present, user matches, no amount requirement | Pass |
| Light-up: event present, user matches | Pass |
| Light-up: wrong user in event | Fail with `USER_MISMATCH` |
| Level-up: current stage >= target | Pass |
| Level-up: current stage < target | Fail with `STAGE_TOO_LOW` |
| Transaction to non-vendor contract | Fail with `WRONG_CONTRACT` |
| Transaction sender != user wallet | Fail with `SENDER_MISMATCH` |
| Transaction failed (status != success) | Fail with `TX_FAILED` |
| Transaction not found / pending | Fail with `TX_NOT_FOUND` |

### Unit Tests: Replay Prevention

**File**: `__tests__/unit/lib/quests/verification/replay-prevention.test.ts`

| Test Case | Expected Result |
|-----------|-----------------|
| First use of tx hash | Success, tx registered |
| Second use of same tx hash | Fail with `TX_ALREADY_USED` |
| Same tx for different user | Fail with `TX_ALREADY_USED` |
| Same tx for different task | Fail with `TX_ALREADY_USED` |
| Concurrent registration (race) | One succeeds, one fails |

### Integration Tests: Completion Endpoint

**File**: `__tests__/integration/pages/api/quests/complete-task.test.ts`

| Test Case | Expected Result |
|-----------|-----------------|
| `verification_method = "blockchain"` | Strategy invoked |
| Verification fails | 400, no completion written |
| Verification succeeds | Completion written with server metadata |
| Resubmission (`retry`/`failed`) | Verification required again |
| Replay detected | 400 with `TX_ALREADY_USED` |
| Non-blockchain task | Strategy not invoked |
| Existing completed task | 400 (cannot resubmit) |

### Mocking Strategy

```ts
// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockSupabaseClient,
}));

// Mock verification strategy
jest.mock('@/lib/quests/verification/registry', () => ({
  getVerificationStrategy: jest.fn(() => mockStrategy),
}));

// Mock viem client
jest.mock('@/lib/blockchain/providers/privy-viem', () => ({
  createViemPublicClient: () => mockViemClient,
}));
```

---

## Migration Strategy

### Phase 1: Database Migration

1. Deploy `XXX_add_task_config_to_quest_tasks.sql`
2. Deploy `XXX_quest_tx_replay_prevention.sql`
3. Run `npm run db:types` to regenerate TypeScript types

### Phase 2: Backend Changes

1. Update `lib/quests/verification/types.ts`
2. Add events to `lib/blockchain/shared/vendor-abi.ts`
3. Update `lib/quests/verification/vendor-verification.ts`
4. Update `pages/api/quests/complete-task.ts`
5. Deploy and verify in staging

### Phase 3: Admin UI

1. Update `components/admin/QuestTaskForm.tsx`
2. Update admin API routes with validation
3. Test admin flow end-to-end

### Phase 4: Existing Quest Audit

1. Query quests with `vendor_buy`/`vendor_sell` tasks without `task_config`
2. Decide: backfill `required_amount` or leave as "any amount"
3. Document findings

---

## Risk Notes

| Risk | Mitigation |
|------|------------|
| Missing event ABI | Source from canonical vendor contract; test against testnet |
| Chain reorgs | Base L2 has fast finality (~2s); consider confirmation depth for high-value tasks |
| Multiple logs in tx | Use first matching event; document behavior |
| Amount units | Store and compare in wei (BigInt); display in human-readable format in UI |
| Pending tx | Return retryable error; client should poll |
| Contract upgrade | Event signatures change; version ABIs if needed |
| Race conditions | Database `UNIQUE` constraint + function handles concurrency |
| Backward compatibility | Existing completions grandfathered; only new submissions verified |

---

## Appendix: Error Codes

| Code | Meaning | User Action |
|------|---------|-------------|
| `TX_NOT_FOUND` | Transaction not found or pending | Wait and retry |
| `TX_FAILED` | Transaction reverted | Submit new transaction |
| `TX_ALREADY_USED` | Transaction already used for another task | Submit new transaction |
| `WRONG_CONTRACT` | Transaction not with vendor contract | Submit correct transaction |
| `SENDER_MISMATCH` | Transaction not from user's wallet | Submit from linked wallet |
| `EVENT_NOT_FOUND` | Expected event not in transaction | Submit correct transaction type |
| `USER_MISMATCH` | Event user doesn't match quest user | Submit from linked wallet |
| `AMOUNT_TOO_LOW` | Amount less than required | Submit transaction with higher amount |
| `STAGE_TOO_LOW` | User stage below target | Level up first |
| `INVALID_TASK_TYPE` | Unknown task type | Contact support |
