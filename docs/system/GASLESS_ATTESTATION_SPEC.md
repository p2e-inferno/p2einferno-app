# Gasless Attestation Integration Plan
## KISS, DRY, and Scalable Solution

## Overview
Add gasless EAS attestations to 8 user actions using ONE reusable pattern. Current check-in implementation serves as the proven reference (DO NOT MODIFY check-in flow to avoid regression). All attestations are gasless (server wallet pays gas), following the EAS delegated attestation standard.

**Actions to Attest:**
1. XP Renewal (subscription renewal with XP) - key extension
2. DG Token Withdrawals (user withdrawals) - token transfer
3. DG Config Changes (admin withdrawal limit changes) - config update
4. **Milestone Task Reward Claim** (XP award for individual task completion) - DB transaction
5. **Milestone Key Claim** (key grant for milestone progression) - on-chain transaction
6. **Quest Task Reward Claim** (XP award for individual task completion) - DB transaction
7. **Quest Key Claim** (key grant for quest completion) - on-chain transaction
8. **Bootcamp Certificate Claim** (key grant + certificate) - migrate from direct to gasless

**Critical Distinction for Milestones and Quests:**
- **Task Reward Claims** (#4, #6): User claims XP for completing individual milestone/quest tasks. This is a DB-only transaction that awards experience points.
- **Key Claims** (#5, #7): User claims the on-chain key after completing all tasks. This grants a key for progression/completion (no XP awarded at this step).

**⚠️ CRITICAL: Do NOT modify or refactor check-in flow (`/hooks/checkin/useDelegatedAttestationCheckin.ts`, `/pages/api/checkin/index.ts`) to avoid regression. Only COPY patterns from these files.**

## Key Architectural Understanding

**Milestone and Quest flows have TWO separate attestable actions:**

### Milestone Actions:
1. **Task Reward Claim** (`/pages/api/user/task/[taskId]/claim.ts`)
   - User completes individual milestone task → claims XP reward
   - DB-only transaction (updates `user_task_progress.reward_claimed`, awards XP)
   - Schema: `milestone_task_reward_claim`
   - Column: `user_task_progress.reward_claim_attestation_uid`

2. **Key Claim** (`/pages/api/milestones/claim.ts`)
   - User completes ALL milestone tasks → claims milestone key for progression
   - On-chain transaction (grants key via smart contract)
   - NO XP awarded (XP already claimed in step 1)
   - Schema: `milestone_achievement`
   - Column: `user_milestone_progress.key_claim_attestation_uid`

### Quest Actions:
1. **Task Reward Claim** (`/pages/api/quests/claim-task-reward.ts`)
   - User completes individual quest task → claims XP reward
   - DB-only transaction (updates `user_task_completions.reward_claimed`, awards XP)
   - Schema: `quest_task_reward_claim`
   - Column: `user_task_completions.reward_claim_attestation_uid`

2. **Key Claim** (`/pages/api/quests/complete-quest.ts` or `/pages/api/quests/get-trial.ts`)
   - User completes ALL quest tasks → claims quest completion key
   - On-chain transaction (grants key via smart contract)
   - NO XP awarded (XP already claimed in step 1)
   - Schema: `quest_completion`
   - Column: `user_quest_progress.key_claim_attestation_uid`

**Both actions are attestable** because they represent verifiable user achievements:
- Task reward claims attest to earned XP (proof of individual task completion)
- Key claims attest to on-chain key grants (proof of milestone/quest progression/completion)

## Engineering Decision: Why This Approach

**Codex Suggestion Review:**
✅ One shared server helper (adopted)
✅ Per-action payload builders (adopted)
✅ Schema key-based resolution (adopted)
⚠️ "Encode at API layer" (defer for now; keep client-encoded signing to match current delegated flow)

**Policy decision (explicit rule):**
- **Fail-closed** for DB-only actions (attestation required).
- **On-chain actions**: user signature is required (cancel signing cancels the action). Server submission is best-effort after the on-chain operation succeeds.

**Why Client Encodes + Signs (current pattern):**
Delegated attestations follow EAS standard where **user is the attester**. The EAS contract verifies the user's signature matches the attester address. Therefore:
1. Client encodes attestation data (they're signing the data hash)
2. Client signs with their wallet (they're the attester)
3. Server submits to blockchain (pays gas via service wallet)

Attempting to "encode at API layer" would mean the client signs data they didn't encode, breaking signature verification.

**Result:** This plan uses TWO simple components (client hook + API helper) that together = ~10 lines per action integration.

## Architecture: KISS Pattern

**Delegated Attestation Flow (EAS Standard):**
```
Client: Encode data → Sign with wallet (EIP-712) → Send signature to server
Server: Validate → Submit via service wallet → Extract UID
```

**Why Client Must Encode+Sign:**
- In delegated attestations, the **user is the attester** (not the server)
- EAS contract verifies the user's signature matches the attester address
- Therefore: Client encodes → Client signs → Server submits (pays gas)

### 1. Generic Client Hook
**Create:** `/hooks/attestation/useGaslessAttestation.ts`

**Purpose:** Handle encoding + signing for ALL new attestation types. Check-in keeps its own hook (no regression).

**Copy from:** `/hooks/checkin/useDelegatedAttestationCheckin.ts` (lines 1-167)
- Remove "checkin" branding
- Make schemaKey parameter-based (not hardcoded "daily_checkin")
- Keep all EAS SDK logic unchanged

**Simple Interface:**
```typescript
const { signAttestation, isSigning } = useGaslessAttestation();

// Usage
const signature = await signAttestation({
  schemaKey: 'milestone_completion',  // DB lookup
  recipient: userAddress,
  schemaData: [
    { name: 'milestoneId', value: 'abc', type: 'string' },
    { name: 'userAddress', value: '0x...', type: 'address' },
    // ... more fields
  ],
});
```

**What It Does:**
1. Resolves schema UID from DB via `resolveSchemaUID(schemaKey, network)`
2. Encodes data using `SchemaEncoder` from EAS SDK
3. Signs with EAS SDK's `getDelegated().signDelegatedAttestation()`
4. Returns signature object

---

### 2. Generic API Helper
**Create:** `/lib/attestation/api/helpers.ts`

**Purpose:** One function that handles all server-side attestation logic.

**Copy from:** `/pages/api/checkin/index.ts` (lines 115-210)

**Simple Interface:**
```typescript
export async function handleGaslessAttestation(params: {
  signature: DelegatedAttestationSignature | null;
  schemaKey: string;
  recipient: string;
  gracefulDegrade?: boolean;
}): Promise<{ success: boolean; uid?: string; txHash?: string; error?: string }>
```

**What It Does:**
1. Check EAS enabled
2. Validate signature recipient matches expected user
3. Resolve schema UID from DB
4. Call existing `createDelegatedAttestation()` (already perfect)
5. Return UID or handle graceful degradation

**Benefits:**
- API endpoints: 5 lines (call helper + save UID)
- Consistent error handling
- Graceful degradation (proven pattern from check-in)

---

## Schema Definitions

**CRITICAL UNDERSTANDING: ALL Attestations Are On-Chain**

Every attestation creates an immutable on-chain record, regardless of whether the underlying action is a database transaction or blockchain transaction. The attestation serves as an **on-chain audit trail** that provides:

1. **Transparency**: Public verifiable record of all user actions
2. **Verification**: On-chain backup of database state for dispute resolution
3. **Data Analysis**: Rich on-chain data queryable by schema UID
4. **Trust**: Immutable proof that cannot be altered or deleted

**Examples:**
- **Task Reward Claim** (DB transaction) → Creates on-chain attestation with XP amount, addresses, timestamp
- **Key Claim** (Blockchain transaction) → Creates on-chain attestation with lock address, token ID, grant tx hash

**Data Principles:**
- Include PUBLIC blockchain data (addresses, token IDs, tx hashes)
- EXCLUDE PII (emails, personal information)
- Use proper web3 types (address, bytes32, uint256, not string)

### New Schemas (Add to `/lib/attestation/schemas/definitions.ts`)

#### 1. XP Renewal
```typescript
{
  key: 'xp_renewal',
  name: "XP Subscription Renewal",
  description: "On-chain attestation for subscription renewals using XP. Creates immutable audit trail for off-chain renewal transaction.",
  schema: "address userAddress,address subscriptionLockAddress,uint256 amountXp,uint256 serviceFeeXp,uint256 durationDays,uint256 newExpirationTimestamp,bytes32 renewalTxHash",
  category: "transaction",
  revocable: false,
}
```

**Schema Key:** `xp_renewal`
**Web3 Types:** `subscriptionLockAddress` (address), `renewalTxHash` (bytes32)
**Purpose:** Verifiable on-chain record of subscription renewal with lock address and key extension transaction

#### 2. DG Withdrawal
```typescript
{
  key: 'dg_withdrawal',
  name: "DG Token Withdrawal",
  description: "On-chain attestation for DG token withdrawals. Creates audit trail for token transfers.",
  schema: "address userAddress,uint256 amountDg,uint256 withdrawalTimestamp,bytes32 withdrawalTxHash",
  category: "transaction",
  revocable: false,
}
```

**Schema Key:** `dg_withdrawal`
**Web3 Types:** `withdrawalTxHash` (bytes32)
**Purpose:** Transparent on-chain record of token withdrawal for verification and dispute resolution

#### 3. DG Config Change
```typescript
{
  key: 'dg_config_change',
  name: "DG Withdrawal Config Change",
  description: "On-chain attestation for admin changes to DG withdrawal limits. Creates governance audit trail.",
  schema: "address adminAddress,uint256 previousMinAmount,uint256 newMinAmount,uint256 previousMaxDaily,uint256 newMaxDaily,uint256 changeTimestamp,string changeReason",
  category: "governance",
  revocable: false,
}
```

**Schema Key:** `dg_config_change`
**Web3 Types:** `adminAddress` (address)
**Purpose:** Immutable governance record for transparency and accountability

#### 4. Milestone Task Reward Claim
```typescript
{
  key: 'milestone_task_reward_claim',
  name: "Milestone Task Reward Claim",
  description: "On-chain attestation for claiming XP rewards for individual milestone task completions. Creates audit trail for XP awards.",
  schema: "string milestoneId,address userAddress,address milestoneLockAddress,uint256 rewardAmount,uint256 claimTimestamp",
  category: "achievement",
  revocable: false,
}
```

**Schema Key:** `milestone_task_reward_claim`
**Web3 Types:** `milestoneLockAddress` (address)
**Purpose:** Verifiable proof of task completion and XP reward. On-chain backup of database transaction for transparency and data analysis.
**Note:** `taskId` removed - not relevant for on-chain record

#### 5. Quest Task Reward Claim
```typescript
{
  key: 'quest_task_reward_claim',
  name: "Quest Task Reward Claim",
  description: "On-chain attestation for claiming XP rewards for individual quest task completions. Creates audit trail for XP awards.",
  schema: "string questId,string taskId,string taskType,address userAddress,address questLockAddress,uint256 rewardAmount,uint256 claimTimestamp",
  category: "achievement",
  revocable: false,
}
```

**Schema Key:** `quest_task_reward_claim`
**Web3 Types:** `questLockAddress` (address)
**Purpose:** Verifiable proof of task completion and XP reward. On-chain backup of database transaction for transparency and data analysis.
**Note:** Added `taskType` for richer on-chain data analysis, removed `completionId` (internal DB reference)

### Existing Schemas (Need Updates for Web3 Data)

#### 6. Milestone Achievement (UPDATE REQUIRED)
**Current Schema:**
```typescript
"string milestoneId,string milestoneTitle,address userAddress,uint256 achievementDate,uint256 xpEarned,string skillLevel"
```

**Updated Schema:**
```typescript
{
  key: 'milestone_achievement',
  name: "Milestone Achievement",
  description: "On-chain attestation for milestone key grants. Creates immutable record of progression with blockchain data.",
  schema: "string milestoneId,string milestoneTitle,address userAddress,address cohortLockAddress,address milestoneLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 achievementDate,uint256 xpEarned,string skillLevel",
  category: "achievement",
  revocable: false,
}
```

**Schema Key:** `milestone_achievement`
**Web3 Types Added:** `cohortLockAddress` (address), `milestoneLockAddress` (address), `keyTokenId` (uint256), `grantTxHash` (bytes32)
**Purpose:** Verifiable proof of milestone completion with on-chain key data for transparency and data analysis. Includes cohort context for rich data analysis.

#### 7. Quest Completion (UPDATE REQUIRED)
**Current Schema:**
```typescript
"string questId,string questTitle,address userAddress,uint256 completionDate,uint256 xpEarned,string difficulty"
```

**Updated Schema:**
```typescript
{
  key: 'quest_completion',
  name: "Quest Completion",
  description: "On-chain attestation for quest key grants. Creates immutable record of completion with blockchain data.",
  schema: "string questId,string questTitle,address userAddress,address questLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 completionDate,uint256 xpEarned,string difficulty",
  category: "achievement",
  revocable: false,
}
```

**Schema Key:** `quest_completion`
**Web3 Types Added:** `questLockAddress` (address), `keyTokenId` (uint256), `grantTxHash` (bytes32)
**Purpose:** Verifiable proof of quest completion with on-chain key data for transparency and data analysis

#### 8. Bootcamp Completion (UPDATE REQUIRED)
**Current Schema:**
```typescript
"string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash"
```

**Updated Schema:**
```typescript
{
  key: 'bootcamp_completion',
  name: "Bootcamp Completion",
  description: "On-chain attestation for bootcamp certificate claims. Creates immutable record with blockchain data.",
  schema: "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,address cohortLockAddress,address certificateLockAddress,uint256 certificateTokenId,bytes32 certificateTxHash,uint256 completionDate,uint256 totalXpEarned",
  category: "achievement",
  revocable: false,
}
```

**Schema Key:** `bootcamp_completion`
**Web3 Types Fixed:** `certificateTxHash` (bytes32 instead of string)
**Web3 Types Added:** `cohortLockAddress` (address), `certificateLockAddress` (address), `certificateTokenId` (uint256)
**Purpose:** Verifiable proof of bootcamp completion with on-chain certificate data for transparency and data analysis. Includes cohort lock for full context.

#### 9. Daily Checkin (Align Types)
```typescript
"address walletAddress,string greeting,uint256 timestamp,uint256 xpGained"
```

**Schema Key:** `daily_checkin`
**Status:** ✅ Use address for walletAddress; remove userDid for consistency

**Important Distinction:**
- **Task Reward Claims** (schemas 4-5): Attest XP awards for individual task completions. Creates on-chain audit trail for off-chain DB transactions.
- **Key Claims** (schemas 6-8): Attest on-chain key grants for milestone/quest/bootcamp completion. Includes blockchain-specific data (lockAddress, tokenId, txHash).

**Schema Resolution:** All schemas use `resolveSchemaUID(schemaKey, network)` which queries the database (`attestation_schemas` table joined with `eas_schema_keys`) to get the UID for the specified key and network. No environment variables needed.

---

## Database Migration

**File:** `/supabase/migrations/134_add_gasless_attestation_uids.sql`

```sql
-- Add attestation UID tracking columns for various actions

-- Transaction/config attestations
ALTER TABLE subscription_renewal_attempts
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

ALTER TABLE dg_token_withdrawals
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

ALTER TABLE config_audit_log
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

-- Milestone/Quest KEY claim attestations (on-chain key grants)
ALTER TABLE user_milestone_progress
  ADD COLUMN IF NOT EXISTS key_claim_attestation_uid TEXT;

ALTER TABLE user_quest_progress
  ADD COLUMN IF NOT EXISTS key_claim_attestation_uid TEXT;

-- Milestone/Quest TASK REWARD claim attestations (XP awards)
ALTER TABLE user_task_progress
  ADD COLUMN IF NOT EXISTS reward_claim_attestation_uid TEXT;

ALTER TABLE user_task_completions
  ADD COLUMN IF NOT EXISTS reward_claim_attestation_uid TEXT;

-- Indexes for efficient attestation lookups
CREATE INDEX IF NOT EXISTS idx_renewal_attempts_attestation
  ON subscription_renewal_attempts(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_attestation
  ON dg_token_withdrawals(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_audit_attestation
  ON config_audit_log(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_milestone_progress_key_claim
  ON user_milestone_progress(key_claim_attestation_uid)
  WHERE key_claim_attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quest_progress_key_claim
  ON user_quest_progress(key_claim_attestation_uid)
  WHERE key_claim_attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_progress_reward_claim
  ON user_task_progress(reward_claim_attestation_uid)
  WHERE reward_claim_attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_completions_reward_claim
  ON user_task_completions(reward_claim_attestation_uid)
  WHERE reward_claim_attestation_uid IS NOT NULL;
```

**Notes:**
- `bootcamp_enrollments` already has `certificate_attestation_uid TEXT`
- Column naming convention:
  - `attestation_uid` for general actions
  - `key_claim_attestation_uid` for milestone/quest KEY claims (to distinguish from task reward claims)
  - `reward_claim_attestation_uid` for milestone/quest TASK REWARD claims

---

## Integration Points

**IMPORTANT:** All integration examples below must include the full set of blockchain fields as defined in the schema definitions. The examples show the signature creation and API integration pattern - ensure all fields from the schema are included, especially:
- Lock addresses (typed as `address`)
- Transaction hashes (typed as `bytes32`)
- Token IDs (typed as `uint256`)

### 1. XP Renewal

**Client (5 lines):**
```typescript
const signature = await signAttestation({
  schemaKey: 'xp_renewal',
  recipient: userAddress,
  schemaData: [
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'amountXp', value: baseCost, type: 'uint256' },
    { name: 'serviceFeeXp', value: fee, type: 'uint256' },
    { name: 'durationDays', value: duration, type: 'uint256' },
    { name: 'newExpiration', value: expiration, type: 'uint256' },
    { name: 'renewalTxHash', value: txHash, type: 'bytes32' },
  ],
});
// Pass signature to API
```

**API (5 lines):**
```typescript
// After key extension succeeds (line ~438)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'xp_renewal',
  recipient: userAddress,
  gracefulDegrade: true,
});
await supabase.from('subscription_renewal_attempts')
  .update({ attestation_uid: attestation.uid })
  .eq('id', renewalId);
```

**File:** `/pages/api/subscriptions/renew-with-xp.ts` (line ~438)

### 2. DG Token Withdrawal

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'dg_withdrawal',
  schemaData: [
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'amountDg', value: amount, type: 'uint256' },
    { name: 'timestamp', value: BigInt(Date.now()), type: 'uint256' },
    { name: 'withdrawalTxHash', value: txHash, type: 'bytes32' },
  ],
});
```

**API:**
```typescript
// After transfer succeeds (line ~203)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'dg_withdrawal',
  recipient: userAddress,
  gracefulDegrade: true,
});
// Update via RPC with attestation UID
```

**File:** `/app/api/token/withdraw/route.ts` (line ~203)

---

### 3. DG Config Change (Admin)

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'dg_config_change',
  schemaData: [
    { name: 'adminAddress', value: adminAddress, type: 'address' },
    { name: 'previousMinAmount', value: prevMin, type: 'uint256' },
    { name: 'newMinAmount', value: newMin, type: 'uint256' },
    { name: 'previousMaxDaily', value: prevMax, type: 'uint256' },
    { name: 'newMaxDaily', value: newMax, type: 'uint256' },
    { name: 'timestamp', value: BigInt(Date.now()), type: 'uint256' },
    { name: 'reason', value: reason, type: 'string' },
  ],
});
```

**API:**
```typescript
// After config update (line ~150)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'dg_config_change',
  recipient: adminAddress,
  gracefulDegrade: true,
});
await supabase.from('config_audit_log')
  .update({ attestation_uid: attestation.uid })
  .eq('id', auditId);
```

**File:** `/app/api/admin/config/withdrawal-limits/route.ts` (line ~150)

---

### 4. Milestone Task Reward Claim

**Action:** User claims XP reward for completing an individual milestone task. Attests the **XP award** (DB transaction), not the task completion itself.

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'milestone_task_reward_claim',
  recipient: userAddress,
  schemaData: [
    { name: 'milestoneId', value: milestoneId, type: 'string' },
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'milestoneLockAddress', value: milestoneLockAddress, type: 'address' },
    { name: 'rewardAmount', value: rewardAmount, type: 'uint256' },
    { name: 'claimTimestamp', value: BigInt(Date.now()), type: 'uint256' },
  ],
});
```

**API:**
```typescript
// After XP award succeeds (line ~125-140)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'milestone_task_reward_claim',
  recipient: userAddress,
  gracefulDegrade: true,
});
await supabase.from('user_task_progress')
  .update({ reward_claim_attestation_uid: attestation.uid })
  .eq('id', utp.id);
```

**File:** `/pages/api/user/task/[taskId]/claim.ts` (line ~125-140)
**Timing:** Attestation happens when XP is awarded, after task is completed and approved

---

### 5. Milestone Key Claim

**Action:** User claims milestone key after completing all tasks. Attests the **key grant** (on-chain action) for milestone progression. No XP awarded at this step.

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'milestone_achievement',  // Updated schema with blockchain fields
  schemaData: [
    { name: 'milestoneId', value: milestoneId, type: 'string' },
    { name: 'milestoneTitle', value: title, type: 'string' },
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'cohortLockAddress', value: cohortLockAddress, type: 'address' },  // NEW: Cohort context
    { name: 'milestoneLockAddress', value: milestoneLockAddress, type: 'address' },  // NEW: Milestone lock address
    { name: 'keyTokenId', value: tokenId, type: 'uint256' },  // NEW: NFT token ID
    { name: 'grantTxHash', value: grantTxHash, type: 'bytes32' },  // NEW: Grant transaction hash
    { name: 'achievementDate', value: BigInt(Date.now()), type: 'uint256' },
    { name: 'xpEarned', value: xpAmount, type: 'uint256' },
    { name: 'skillLevel', value: level, type: 'string' },
  ],
});
```

**API:**
```typescript
// After key grant succeeds (line ~126)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'milestone_achievement',
  recipient: userAddress,
  gracefulDegrade: true,
});
await supabase.from('user_milestone_progress')
  .update({ key_claim_attestation_uid: attestation.uid })
  .eq('milestone_id', milestoneId);
```

**File:** `/pages/api/milestones/claim.ts` (line ~126)
**Timing:** Attestation happens when key is granted, not when status becomes "completed"

---

### 6. Quest Task Reward Claim

**Action:** User claims XP reward for completing an individual quest task. Attests the **XP award** (DB transaction), not the task completion itself.

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'quest_task_reward_claim',
  recipient: userAddress,
  schemaData: [
    { name: 'questId', value: questId, type: 'string' },
    { name: 'taskId', value: taskId, type: 'string' },
    { name: 'taskType', value: taskType, type: 'string' },  // e.g., "deploy_lock", "social_task", etc.
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'questLockAddress', value: questLockAddress, type: 'address' },
    { name: 'rewardAmount', value: rewardAmount, type: 'uint256' },
    { name: 'claimTimestamp', value: BigInt(Date.now()), type: 'uint256' },
  ],
});
```

**API:**
```typescript
// After XP award succeeds (line ~133-140)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'quest_task_reward_claim',
  recipient: userAddress,
  gracefulDegrade: true,
});
await supabase.from('user_task_completions')
  .update({ reward_claim_attestation_uid: attestation.uid })
  .eq('id', completionId);
```

**File:** `/pages/api/quests/claim-task-reward.ts` (line ~133-140)
**Timing:** Attestation happens when XP is awarded, after task is completed and approved

---

### 7. Quest Key Claim

**Action:** User claims quest completion key after completing all tasks. Attests the **key grant** (on-chain action) for quest completion. No XP awarded at this step (XP was already claimed via task reward claims).

**Client:**
```typescript
const signature = await signAttestation({
  schemaKey: 'quest_completion',  // Existing schema
  schemaData: [
    { name: 'questId', value: questId, type: 'string' },
    { name: 'questTitle', value: title, type: 'string' },
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'completionDate', value: BigInt(Date.now()), type: 'uint256' },
    { name: 'xpEarned', value: xp, type: 'uint256' },
    { name: 'difficulty', value: difficulty, type: 'string' },
  ],
});
```

**API:**
```typescript
// After key grant succeeds
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'quest_completion',
  recipient: userAddress,
  gracefulDegrade: true,
});
await supabase.from('user_quest_progress')
  .update({ key_claim_attestation_uid: attestation.uid })
  .eq('quest_id', questId);
```

**Files:**
- `/pages/api/quests/complete-quest.ts` (line ~138) - Standard quests
- `/pages/api/quests/get-trial.ts` (line ~200) - Activation quests (grants 2 keys)

**Timing:** Attestation happens when quest key is granted, not when tasks are completed or task XP is claimed

---

### 8. Bootcamp Completion (Migration from Direct to Gasless)

**Current:** Direct attestation (user pays gas, client-side)
**New:** Gasless attestation (server pays gas)

**Client:**
```typescript
// REPLACE AttestationService.createAttestation() with:
const signature = await signAttestation({
  schemaKey: 'bootcamp_completion',
  schemaData: [
    { name: 'cohortId', value: cohortId, type: 'string' },
    { name: 'cohortName', value: name, type: 'string' },
    { name: 'bootcampId', value: bootcampId, type: 'string' },
    { name: 'bootcampTitle', value: title, type: 'string' },
    { name: 'userAddress', value: userAddress, type: 'address' },
    { name: 'completionDate', value: BigInt(Date.now()), type: 'uint256' },
    { name: 'totalXpEarned', value: totalXp, type: 'uint256' },
    { name: 'certificateTxHash', value: txHash, type: 'bytes32' },
  ],
});
```

**API:**
```typescript
// After key grant (line ~113)
const attestation = await handleGaslessAttestation({
  signature: req.body.attestationSignature,
  schemaKey: 'bootcamp_completion',
  recipient: userAddress,
  gracefulDegrade: true,
});
// Save to bootcamp_enrollments.certificate_attestation_uid
```

**Files:**
- `/pages/api/bootcamp/certificate/claim.ts` (line ~113)
- `/hooks/bootcamp-completion/useCertificateClaim.ts` (replace direct attestation)
- Delete `/pages/api/bootcamp/certificate/commit-attestation.ts` (no longer needed)

---

## Type Definitions

**Create:** `/lib/attestation/api/types.ts`

```typescript
// Generic delegated attestation signature (replaces check-in-specific one)
export interface DelegatedAttestationSignature {
  signature: string;
  deadline: bigint;
  attester: string;
  recipient: string;
  schemaUid: string;
  data: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  chainId: number;
  network: string;
}

// Schema field data for encoding
export interface SchemaFieldData {
  name: string;
  value: any;
  type: 'address' | 'string' | 'uint256' | 'bytes32' | 'bool' | 'uint64';
}

// API request extension mixin
export interface WithAttestationSignature {
  attestationSignature?: DelegatedAttestationSignature | null;
}
```

**Update:** Existing request types to extend `WithAttestationSignature`

---

## Implementation Order (Phased Rollout with Review Gates)

### Phase 1: Foundation (Reusable Components + Tests)
**Goal:** Build and test all reusable components BEFORE any action integration
**Risk:** None - no existing functionality modified
**Review Gate:** User reviews foundation code and tests before proceeding to any integration

#### Step 1.1: Type Definitions
**File:** `/lib/attestation/api/types.ts`
- Create `DelegatedAttestationSignature` interface
- Create `SchemaFieldData` interface
- Create `WithAttestationSignature` interface
- **Validation:** Types compile without errors

#### Step 1.2: Generic Client Hook
**File:** `/hooks/attestation/useGaslessAttestation.ts`
- Copy pattern from `/hooks/checkin/useDelegatedAttestationCheckin.ts`
- Remove "checkin" branding
- Make `schemaKey` parameter-based (not hardcoded)
- Keep all EAS SDK logic unchanged
- **Validation:** Hook compiles without errors

**Test File:** `/hooks/attestation/useGaslessAttestation.test.ts`
- Mock wallet/signer
- Test successful signature generation
- Test error handling (no wallet, invalid schema, etc.)
- Test signature format normalization
- **Validation:** All unit tests pass

#### Step 1.3: API Helper
**File:** `/lib/attestation/api/helpers.ts`
- Copy pattern from `/pages/api/checkin/index.ts` (lines 115-210)
- Extract into reusable `handleGaslessAttestation()` function
- Generic schema key resolution
- Graceful degradation support
- **Validation:** Function compiles without errors

**Test File:** `/lib/attestation/api/helpers.test.ts`
- Mock EAS enabled/disabled states
- Test signature validation
- Test graceful degradation behavior
- Test schema UID resolution
- Test successful attestation flow
- **Validation:** All unit tests pass

#### Step 1.4: Schema Definitions
**File:** `/lib/attestation/schemas/definitions.ts`
- Add 5 new schema definitions (keys only, no UIDs yet):
  - `xp_renewal`
  - `dg_withdrawal`
  - `dg_config_change`
  - `milestone_task_reward_claim`
  - `quest_task_reward_claim`
- **Validation:** Schema definitions follow correct format

#### Step 1.5: Database Migration
**File:** `/supabase/migrations/134_add_gasless_attestation_uids.sql`
- Add attestation UID columns to all relevant tables
- Create indexes for efficient lookups
- Apply migration to local database: `supabase migration up --local`
- **Validation:** Migration applies cleanly, columns exist, no FK violations

#### Step 1.6: Foundation Review Gate
**Deliverables for Review:**
- Generic hook with unit tests passing
- API helper with unit tests passing
- Type definitions
- Schema definitions (not deployed)
- Database migration applied locally

**User Action:** Review all foundation code, run tests, verify quality
**Proceed Only When:** User approves foundation and all tests pass

---

### Phase 2: Schema Deployment
**Goal:** Deploy 5 new schemas + redeploy 3 updated existing schemas to EAS via admin UI
**Risk:** Low - schemas are immutable, updates get new UIDs
**Prerequisites:** Phase 1 approved

#### Step 2.1: Deploy New Schemas
**For Each New Schema (via `/admin/eas-schemas`):**
1. Navigate to admin UI
2. Deploy schema on-chain (admin wallet signs)
3. Schema UID automatically saved to database
4. Verify on EAS Scan
5. Test resolution: `resolveSchemaUID(schemaKey, network)` returns UID

**New Schemas to Deploy:**
- `xp_renewal`
- `dg_withdrawal`
- `dg_config_change`
- `milestone_task_reward_claim`
- `quest_task_reward_claim`

#### Step 2.2: Redeploy Updated Existing Schemas
**For Each Updated Schema:**
1. Deploy NEW schema with updated field list (new UID generated)
2. Update database to point schema key to new UID
3. Old UID remains in database for historical attestations
4. New attestations use new UID with additional fields

**Schemas to Redeploy:**
- `milestone_achievement` - Add lockAddress, keyTokenId, grantTxHash
- `quest_completion` - Add lockAddress, keyTokenId, grantTxHash
- `bootcamp_completion` - Add lockAddress, certificateTokenId, fix txHash type

**IMPORTANT:** Existing attestations with old UIDs remain valid. Database tracks both old and new UIDs for same schema key. New attestations use new schema with richer blockchain data.

**Validation:** All 8 schemas deployed/redeployed, UIDs saved in database, resolution works

---

### Phase 3: Milestone Task Reward Claim Integration
**Goal:** First action integration - lowest risk (DB-only, no blockchain)
**Risk:** Very Low - DB transaction only, low volume
**Prerequisites:** Phases 1-2 complete
**Files Modified:**
- `/pages/api/user/task/[taskId]/claim.ts`
- Frontend hook/component that calls this API

#### Integration Steps:
1. **API Integration** (line ~125-140):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after XP award
   - Pass `gracefulDegrade: false` (DB-only action must be fail-closed when EAS is enabled)
   - Save UID to `user_task_progress.reward_claim_attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Complete milestone task
   - Claim reward with attestation
   - Verify UID saved in database
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved
   - Test WITHOUT signature → claim succeeds, no UID
   - Check logs for errors
   - Verify no regression to existing functionality

**Proceed Only When:** Phase 3 validated and working

---

### Phase 4: Quest Task Reward Claim Integration
**Goal:** Second action integration - similar to Phase 3
**Risk:** Very Low - DB transaction only, similar pattern
**Prerequisites:** Phase 3 complete and validated
**Files Modified:**
- `/pages/api/quests/claim-task-reward.ts`
- Frontend hook/component that calls this API

#### Integration Steps:
1. **API Integration** (line ~133-140):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after XP award
   - Pass `gracefulDegrade: false` (DB-only action must be fail-closed when EAS is enabled)
   - Save UID to `user_task_completions.reward_claim_attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Complete quest task
   - Claim reward with attestation
   - Verify UID saved in database
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved
   - Test WITHOUT signature → claim succeeds, no UID
   - Check logs for errors
   - Verify Phase 3 still works (no regression)

**Proceed Only When:** Phase 4 validated and Phase 3 unaffected

---

### Phase 5: DG Config Change Integration
**Goal:** Third action integration - admin only, very low volume
**Risk:** Low - Admin-only, low volume, clear audit trail
**Prerequisites:** Phase 4 complete and validated
**Files Modified:**
- `/app/api/admin/config/withdrawal-limits/route.ts`
- Admin UI component

#### Integration Steps:
1. **API Integration** (line ~150):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after config update
   - Save UID to `config_audit_log.attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook to admin UI
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Change withdrawal limits as admin
   - Verify UID saved in config_audit_log
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved
   - Test WITHOUT signature → config update succeeds, no UID
   - Check logs for errors
   - Verify Phases 3-4 still work (no regression)

**Proceed Only When:** Phase 5 validated and Phases 3-4 unaffected

---

### Phase 6: Milestone Key Claim Integration
**Goal:** Fourth action integration - on-chain key grant
**Risk:** Medium - On-chain transaction, moderate volume
**Prerequisites:** Phase 5 complete and validated
**Files Modified:**
- `/pages/api/milestones/claim.ts`
- Frontend hook/component that calls this API

#### Integration Steps:
1. **API Integration** (line ~126):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after key grant
   - Save UID to `user_milestone_progress.key_claim_attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Complete all milestone tasks
   - Claim milestone key with attestation
   - Verify key granted on-chain
   - Verify UID saved in database
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved, key granted
   - When EAS is enabled: signature is required (cancel signing cancels the claim)
   - If signature missing → claim should not proceed (API returns 400)
   - Check gas costs
   - Verify graceful degradation works
   - Verify Phases 3-5 still work (no regression)

**Proceed Only When:** Phase 6 validated and Phases 3-5 unaffected

---

### Phase 7: Quest Key Claim Integration
**Goal:** Fifth action integration - on-chain key grant
**Risk:** Medium - On-chain transaction, moderate volume
**Prerequisites:** Phase 6 complete and validated
**Files Modified:**
- `/pages/api/quests/complete-quest.ts`
- `/pages/api/quests/get-trial.ts` (activation quests)
- Frontend hook/component

#### Integration Steps:
1. **API Integration** (line ~138 in complete-quest, ~200 in get-trial):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after key grant
   - Save UID to `user_quest_progress.key_claim_attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Complete all quest tasks
   - Claim quest key with attestation
   - Verify key granted on-chain
   - Verify UID saved in database
   - Verify UID on EAS Scan
   - Test activation quests (grants 2 keys)
4. **Validation**:
   - Test WITH signature → UID saved, key granted
   - When EAS is enabled: signature is required (cancel signing cancels the claim)
   - If signature missing → claim should not proceed (API returns 400)
   - On-chain key grant should not be blocked by EAS submission failures (best-effort after signature)
   - Check gas costs
   - Verify graceful degradation works
   - Verify Phases 3-6 still work (no regression)

**Proceed Only When:** Phase 7 validated and Phases 3-6 unaffected

---

### Phase 8: XP Renewal Integration
**Goal:** Sixth action integration - transaction-based
**Risk:** Medium - Transaction flow, moderate volume
**Prerequisites:** Phase 7 complete and validated
**Files Modified:**
- `/pages/api/subscriptions/renew-with-xp.ts`
- Frontend renewal component

#### Integration Steps:
1. **API Integration** (line ~438):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after key extension
   - Save UID to `subscription_renewal_attempts.attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Renew subscription with XP
   - Verify key extended
   - Verify UID saved in database
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved, renewal succeeds
   - Test WITHOUT signature → renewal succeeds, no UID
   - Check transaction flow
   - Verify graceful degradation works
   - Verify Phases 3-7 still work (no regression)

**Proceed Only When:** Phase 8 validated and Phases 3-7 unaffected

---

### Phase 9: DG Withdrawal Integration
**Goal:** Seventh action integration - transaction-based
**Risk:** Medium - Token transfer, moderate volume
**Prerequisites:** Phase 8 complete and validated
**Files Modified:**
- `/app/api/token/withdraw/route.ts`
- Frontend withdrawal component

#### Integration Steps:
1. **API Integration** (line ~203):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after transfer
   - Save UID to `dg_token_withdrawals.attestation_uid`
2. **Client Integration**:
   - Add `useGaslessAttestation()` hook
   - Sign attestation before API call
   - Pass signature in request body
3. **E2E Test**:
   - Withdraw DG tokens
   - Verify transfer succeeds
   - Verify UID saved in database
   - Verify UID on EAS Scan
4. **Validation**:
   - Test WITH signature → UID saved, withdrawal succeeds
   - Test WITHOUT signature → withdrawal succeeds, no UID
   - Check transaction flow
   - Verify graceful degradation works
   - Verify Phases 3-8 still work (no regression)

**Proceed Only When:** Phase 9 validated and Phases 3-8 unaffected

---

### Phase 10: Bootcamp Completion Migration
**Goal:** Eighth action integration - BREAKING CHANGE (migrate from direct to gasless)
**Risk:** High - Changes existing user flow, requires coordination
**Prerequisites:** Phase 9 complete and validated
**Files Modified:**
- `/pages/api/bootcamp/certificate/claim.ts`
- `/hooks/bootcamp-completion/useCertificateClaim.ts`
**Files Deleted:**
- `/pages/api/bootcamp/certificate/commit-attestation.ts` (no longer needed)

#### Integration Steps:
1. **API Integration** (line ~113):
   - Add `attestationSignature` to request body type
   - Call `handleGaslessAttestation()` after key grant
   - Save UID to `bootcamp_enrollments.certificate_attestation_uid`
   - Remove direct attestation code
2. **Client Migration**:
   - Replace `AttestationService.createAttestation()` with `useGaslessAttestation()`
   - Update user flow (no gas payment needed)
   - Update UI messaging
3. **Backward Compatibility Test**:
   - Verify old certificates still work
   - Verify new certificates use gasless flow
4. **E2E Test**:
   - Complete bootcamp
   - Claim certificate with gasless attestation
   - Verify key granted
   - Verify UID saved in database
   - Verify UID on EAS Scan
5. **Validation**:
   - Test gasless flow works
   - Check user doesn't pay gas
   - Verify certificate validity
   - Verify Phases 3-9 still work (no regression)
6. **Cleanup**:
   - Delete `/pages/api/bootcamp/certificate/commit-attestation.ts`
   - Update documentation

**Proceed Only When:** Phase 10 validated and Phases 3-9 unaffected

---

### Phase 11: Final Validation & Monitoring
**Goal:** Comprehensive validation across all actions
**Prerequisites:** Phase 10 complete

#### Validation Steps:
1. **Coverage Analysis**:
   ```sql
   -- Check attestation coverage for each action
   SELECT 'milestone_task_rewards' as action, COUNT(*) as total,
          COUNT(reward_claim_attestation_uid) as attested
   FROM user_task_progress WHERE created_at > NOW() - INTERVAL '7 days';

   -- Repeat for all other actions...
   ```
2. **E2E Smoke Tests**:
   - Test one instance of each action end-to-end
   - Verify all UIDs on EAS Scan
   - Check graceful degradation for each action
3. **Performance Check**:
   - Monitor API response times
   - Check gas costs for on-chain attestations
   - Verify no bottlenecks
4. **Documentation**:
   - Document the pattern for future actions
   - Add troubleshooting guide
   - Update API documentation

**Success Criteria:** All 8 actions attesting successfully, no regressions, tests passing

---

## Critical Isolation Guarantees

**Each phase modifies DIFFERENT files and database columns:**
- Phase 3: `user_task_progress.reward_claim_attestation_uid`
- Phase 4: `user_task_completions.reward_claim_attestation_uid`
- Phase 5: `config_audit_log.attestation_uid`
- Phase 6: `user_milestone_progress.key_claim_attestation_uid`
- Phase 7: `user_quest_progress.key_claim_attestation_uid`
- Phase 8: `subscription_renewal_attempts.attestation_uid`
- Phase 9: `dg_token_withdrawals.attestation_uid`
- Phase 10: `bootcamp_enrollments.certificate_attestation_uid`

**Regression Prevention:**
- Each phase touches different API endpoints
- Each phase uses different database columns
- Each phase can be tested independently
- Graceful degradation ensures main actions always work
- Later phases cannot break earlier phases (no shared code modified after Phase 1)

**IMPORTANT:** Do NOT touch the check-in flow to avoid regression. Leave `/hooks/checkin/useDelegatedAttestationCheckin.ts` and `/pages/api/checkin/index.ts` unchanged. Only COPY patterns from them.

---

## Schema Deployment Process

**For Each New Schema** (via `/admin/eas-schemas` admin UI):
1. Add schema definition to `/lib/attestation/schemas/definitions.ts` with schema key
2. Navigate to `/admin/eas-schemas` in browser
3. Click "Deploy New Schema"
4. Fill in schema details from definition
5. Admin wallet signs deployment transaction
6. Schema UID automatically saved to `attestation_schemas` table with:
   - `schema_uid` (on-chain bytes32 UID)
   - `schema_key` (e.g., 'xp_renewal')
   - `network` (e.g., 'base-sepolia')
   - `schema_definition` (field types string)
7. Verify on EAS Scan (link shown in admin UI)
8. Test resolution: `resolveSchemaUID('xp_renewal', 'base-sepolia')` should return the UID
9. Test end-to-end attestation with the new schema

**Existing Schemas:**
- ✅ `daily_checkin` - Deployed and working, no changes needed

**Schemas Requiring Updates** (redeploy with new fields):
- ⚠️ `milestone_achievement` - Add `milestoneLockAddress`, `keyTokenId`, `grantTxHash`
- ⚠️ `quest_completion` - Add `questLockAddress`, `keyTokenId`, `grantTxHash`
- ⚠️ `bootcamp_completion` - Add `certificateLockAddress`, `certificateTokenId`, fix `certificateTxHash` type

**NOTE:** EAS schemas are immutable once deployed. Updating means deploying a NEW schema with a NEW UID, then updating the database to point to the new UID for the same schema key.

**New Schemas** (need deployment):
- ❌ `xp_renewal` - Define → deploy via admin UI → auto-saved to DB
- ❌ `dg_withdrawal` - Define → deploy via admin UI → auto-saved to DB
- ❌ `dg_config_change` - Define → deploy via admin UI → auto-saved to DB
- ❌ `milestone_task_reward_claim` - Define → deploy via admin UI → auto-saved to DB
- ❌ `quest_task_reward_claim` - Define → deploy via admin UI → auto-saved to DB

**No Environment Variables Needed:**
- All schema UIDs are database-driven
- Runtime resolution via `resolveSchemaUID(schemaKey, network)`
- Multi-chain support (different UIDs per network)
- Admin UI manages deployment and DB persistence

---

## Error Handling & Graceful Degradation

**Pattern (from check-in API lines 115-210):**
- EAS enabled check: `isEASEnabled()`
- Graceful degrade flag: `CHECKIN_EAS_GRACEFUL_DEGRADE` (or per-action flag)
- If attestation fails + graceful degrade enabled: Log error, continue main action
- If attestation fails + graceful degrade disabled: Block main action, return error

**Explicit Rule for `gracefulDegrade`:**
- `false` (fail-closed) for DB-only actions (safe to block).
- `true` (graceful) for actions that already perform on-chain transactions; attest only after the main transaction succeeds.

**Logging:**
```typescript
log.info('Creating delegated attestation', { schemaKey, recipient });
log.info('Delegated attestation created', { uid, txHash });
log.error('Attestation failed', { error, gracefulDegrade: true });
```

**Database:**
- Save `null` for `attestation_uid` if attestation fails with graceful degrade
- Schema UIDs are resolved from `attestation_schemas` table (not env vars)
- If `resolveSchemaUID()` returns `null`, schema not deployed for that network

---

## Verification & Testing

### Unit Tests
1. Test `useGaslessAttestation()` hook with mock wallet/signer
2. Test `handleGaslessAttestation()` helper with various scenarios:
   - EAS disabled → early return
   - No signature provided → early return
   - Signature validation failure → error
   - Successful attestation → UID returned
   - Failed attestation + graceful degrade → main action continues
3. Test schema encoding for each schema type

### Integration Tests
1. Do NOT modify existing check-in tests (avoid regression)
2. Add NEW API tests for each new integration:
   - With attestation signature → success, UID saved
   - Without attestation signature → main action succeeds, no UID
   - With invalid signature → main action fails (if graceful degrade off)
3. Test backward compatibility for bootcamp completion

### E2E Testing (Manual)
1. **Milestone Task Reward Claim:** Complete milestone task → claim XP reward → verify task reward attestation UID on EAS Scan
2. **Milestone Key Claim:** Complete all milestone tasks → claim milestone key → verify key claim attestation UID on EAS Scan
3. **Quest Task Reward Claim:** Complete quest task → claim XP reward → verify task reward attestation UID on EAS Scan
4. **Quest Key Claim:** Complete all quest tasks → claim quest key → verify key claim attestation UID on EAS Scan
5. **XP Renewal:** Renew subscription → verify attestation created
6. **DG Withdrawal:** Withdraw tokens → verify attestation created
7. **DG Config:** Change limits as admin → verify attestation created
8. **Bootcamp:** Complete bootcamp → claim certificate with gasless attestation

**Verification Queries:**
```sql
-- Check attestation coverage
SELECT
  'renewals' as action,
  COUNT(*) as total,
  COUNT(attestation_uid) as attested,
  ROUND(COUNT(attestation_uid)::numeric / COUNT(*) * 100, 2) as pct
FROM subscription_renewal_attempts
WHERE created_at > NOW() - INTERVAL '7 days';

-- Verify attestation UIDs are valid bytes32
SELECT COUNT(*)
FROM user_milestone_progress
WHERE attestation_uid IS NOT NULL
  AND attestation_uid !~ '^0x[0-9a-fA-F]{64}$';
-- Should return 0
```

---

## Critical Files Summary

**New Files:**
- `/hooks/attestation/useGaslessAttestation.ts` - Generic client hook
- `/lib/attestation/api/helpers.ts` - API helper function
- `/lib/attestation/api/types.ts` - Shared type definitions
- `/supabase/migrations/134_add_gasless_attestation_uids.sql` - Database schema

**Modified Files:**
- `/lib/attestation/schemas/definitions.ts` - Add 5 new schema definitions (UIDs stored in DB, not code)
- `/pages/api/subscriptions/renew-with-xp.ts` - XP renewal integration
- `/app/api/token/withdraw/route.ts` - DG withdrawal integration
- `/app/api/admin/config/withdrawal-limits/route.ts` - DG config integration
- `/pages/api/user/task/[taskId]/claim.ts` - Milestone task reward claim integration
- `/pages/api/milestones/claim.ts` - Milestone key claim integration
- `/pages/api/quests/claim-task-reward.ts` - Quest task reward claim integration
- `/pages/api/quests/complete-quest.ts` - Quest key claim integration
- `/pages/api/quests/get-trial.ts` - Activation quest integration
- `/pages/api/bootcamp/certificate/claim.ts` - Bootcamp migration
- `/hooks/useMilestoneClaim.ts` - Add attestation signing for key claims
- `/hooks/useQuests.ts` - Add attestation signing for task reward claims and key claims
- `/hooks/bootcamp-completion/useCertificateClaim.ts` - Migrate to gasless

**Reference Files (Do NOT Modify - Copy Pattern Only):**
- `/lib/attestation/core/delegated.ts` - Core service (already perfect)
- `/pages/api/checkin/index.ts` - Reference implementation (lines 112-210)
- `/hooks/checkin/useDelegatedAttestationCheckin.ts` - Pattern to copy (DO NOT MODIFY OR REFACTOR)

---

## Success Criteria

✅ Single generic hook used by all 8 flows (DRY)
✅ Single API helper used by all 8 flows (DRY)
✅ All new schemas deployed and configured
✅ Database columns added with indexes
✅ Attestation UIDs saved for all successful attestations
✅ Graceful degradation works (main actions succeed even if attestation fails)
✅ Zero gas cost for users (service wallet pays)
✅ Bootcamp migrated from direct to gasless
✅ Tests pass for all integrations
✅ Pattern documented for future attestation types

---

## Why This is KISS, DRY, and Scalable

**KISS (Keep It Simple):**
- Clear flow: Client encodes+signs → Server validates+submits → Save UID
- Each action integration = 5 lines client + 5 lines server
- One hook + one helper for ALL actions
- Graceful degradation keeps actions working even if attestation fails

**DRY (Don't Repeat Yourself):**
- ONE client hook: `useGaslessAttestation()` for all 8 actions
- ONE API helper: `handleGaslessAttestation()` for all 8 actions
- Schema encoding logic shared via hook
- Error handling shared via helper
- Per-action code is just simple data structures

**Scalable:**
- Adding 9th action = Define schema + 5 lines client + 5 lines API
- No duplication - just call hook and helper
- DB-driven schemas (no code changes for new networks)
- Proven pattern from working check-in flow
