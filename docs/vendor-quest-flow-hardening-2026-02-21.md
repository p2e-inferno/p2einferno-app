# Vendor Quest Flow Hardening (2026-02-21)

## Scope

This document tracks all fixes implemented for vendor quest completion reliability, replay protection, and UX safety across critical, high, medium, and low findings.

## Problems Addressed

### Critical

1. Vendor tx tasks could not be completed from UI because tx hash input was not guaranteed to render.
2. Replay protection could be bypassed with transaction hash casing variants.

### High

1. Vendor tasks could fail open if `verification_method` was misconfigured away from blockchain.
2. Transaction registration/completion persistence could diverge and strand users.
3. Admin UI could not effectively configure vendor tx input defaults.

### Medium

1. Task completion requests did not consistently propagate active wallet context.
2. Tx replay uniqueness conflicted with same-completion resubmissions.
3. `deploy_lock` could dead-end in UI when config/form rendering was unavailable.

### Low

1. Vendor task icons were generic/unclear in task list UI.
2. Client accepted malformed tx hashes and only failed server-side.
3. Missing/invalid vendor contract env produced generic verification errors.

---

## Implemented Changes

### 1) UI + Client Flow Hardening

#### `components/quests/TaskItem.tsx`

- Added tx-hash input flow for tx-based vendor tasks regardless of `input_required`.
- Added fallback tx-hash input for `deploy_lock` when deploy form config is unavailable.
- Added strict client-side tx-hash format validation (`0x` + 64 hex chars).
- Disabled action button until tx hash is valid.
- Removed legacy stored-data fallback read from `verification_data.transactionHash`; tx prefill now reads `verification_data.txHash` only.
- Added vendor-specific icons:
  - `vendor_buy`, `vendor_sell` -> `Coins`
  - `vendor_light_up` -> `Flame`
  - `vendor_level_up` -> `TrendingUp`
- Added/kept resubmission prefill behavior for tx hash from existing completion metadata.

#### `pages/lobby/quests/[id].tsx`

- Added tx-hash format check before calling completion API for tx-based tasks.
- Added local `submitTask(...)` wrapper to consistently pass active wallet header (`selectedWallet?.address`) to task completion API.
- Uses shared `isValidTransactionHash(...)` and `isUserRejectedError(...)` helpers (deduplicated logic).

#### `lib/quests/client.ts`

- Extended `completeQuestTaskRequest(...)` to accept `walletAddress` and forward it as `X-Active-Wallet`.

#### `hooks/useQuests.ts`

- Updated quest task completion calls to pass selected wallet address, preserving active-wallet context outside quest details page too.
- Uses shared `isUserRejectedError(...)` helper (deduplicated logic).

#### `lib/quests/tx-hash.ts`

- Added shared tx-hash helpers:
  - `isValidTransactionHash(...)`
  - `normalizeTransactionHash(...)`

#### `lib/utils/wallet-errors.ts`

- Added shared wallet user-rejection classifier:
  - `isUserRejectedError(...)`

#### `components/admin/QuestTaskForm.tsx`

- Vendor tx tasks (`vendor_buy`, `vendor_sell`, `vendor_light_up`) now keep `input_required=false` because quest UI tx input is task-type-driven, not `input_required`-driven.
- Manual input configuration is shown only for manual-input task types to avoid no-op admin toggles on vendor tx tasks.
- Added vendor tx defaults when selecting vendor tx task types:
  - `input_validation = "text"`
  - `input_label = "Transaction Hash"`
  - `input_placeholder = "0x..."`

---

### 2) Server Verification + Replay Logic Hardening

#### `pages/api/quests/complete-task.ts`

- Enforced blockchain verification for vendor task types even when admin `verification_method` is misconfigured.
- Added validated active-wallet extraction from `X-Active-Wallet` (fallback to profile wallet only if header absent).
- Normalized incoming tx hash (`trim().toLowerCase()`).
- Registers tx replay claims before persisting completion records for tx-based tasks to remove non-atomic rollback windows.
- Removed stale snapshot-based skip logic; tx registration now runs consistently for tx-based tasks and relies on DB-level idempotency.
- Ignores client-supplied tx hash for non-tx blockchain tasks (`vendor_level_up`) to prevent metadata pollution.

#### `lib/quests/verification/replay-prevention.ts`

- Normalizes tx hash before RPC registration (`trim().toLowerCase()`).
- Hardened block number serialization with explicit numeric finite checks.
- Returns `alreadyRegistered` for idempotent replay-registration responses.

#### `lib/quests/verification/vendor-verification.ts`

- Added explicit vendor-address configuration validation.
- Returns clear error on missing/invalid contract address:
  - `code: "VENDOR_CONFIG_ERROR"`
  - `error: "Vendor contract address is not configured"`
- Vendor address remains intentionally module-scoped (`VENDOR_ADDRESS`) because the DG vendor contract address is fixed for the deployed app/runtime.

---

### 3) Database Migration

#### `supabase/migrations/149_normalize_quest_verified_tx_hashes.sql`

- Removes old case-sensitive uniqueness constraint for quest verified tx hashes.
- Adds case-insensitive unique index on `lower(transaction_hash)`.
- Drops redundant legacy `transaction_hash` index now superseded by the case-insensitive unique index.
- Updates `register_quest_transaction(...)` function to normalize hashes via `lower(trim(...))` before check/insert.
- Adds idempotent success when the tx hash is already registered by the same `user_id + task_id` (including concurrent unique-violation path).

Note: This migration intentionally avoids rewriting existing rows and avoids cleanup/deletion operations.

---

## Tests Added/Updated

### Added

- `__tests__/unit/components/quests/TaskItem.vendor-tx.test.tsx`
  - vendor tx input renders when `input_required=false`
  - valid tx hash submits correctly
  - invalid tx hash keeps button disabled
  - deploy-lock fallback tx input renders when config is missing
  - confirms no prefill from legacy `verification_data.transactionHash`

### Updated

- `__tests__/integration/pages/api/quests/complete-task.test.ts`
  - replay conflict expectations aligned with pre-registration behavior (no completion row written on replay conflict)
  - enforcement test for vendor blockchain verification even under misconfigured verification method
  - `vendor_level_up` test asserting client tx hash is not persisted
- `__tests__/unit/pages/api/quests/complete-task.test.ts`
  - insert/select/delete mock chain adjusted to current handler flow
- `__tests__/unit/lib/quests/verification/vendor-verification.test.ts`
  - added `VENDOR_CONFIG_ERROR` test
- `__tests__/unit/lib/quests/verification/replay-prevention.test.ts`
  - added idempotent success (`already_registered=true`) coverage
- `__tests__/unit/components/admin/QuestTaskForm.vendor.test.tsx`
  - verifies vendor tx task selection keeps `input_required=false`
- `__tests__/unit/lib/quests/vendor-verification.test.ts`
  - normalized fixtures to valid hex addresses (to align with address validation)

---

## Verification Run

Executed focused suites:

```bash
npm test -- --runTestsByPath \
  __tests__/integration/pages/api/quests/complete-task.test.ts \
  __tests__/unit/pages/api/quests/complete-task.test.ts \
  __tests__/unit/components/quests/TaskItem.vendor-tx.test.tsx \
  __tests__/unit/components/admin/QuestTaskForm.vendor.test.tsx \
  __tests__/unit/lib/quests/verification/replay-prevention.test.ts \
  __tests__/unit/lib/quests/verification/vendor-verification.test.ts \
  __tests__/unit/lib/quests/vendor-verification.test.ts \
  --watch=false
```

Result: all targeted suites passed.

---

## Rollout Notes

1. Apply DB migration before production deploy to align runtime behavior with replay uniqueness expectations.
2. Confirm `NEXT_PUBLIC_DG_VENDOR_ADDRESS` is set and valid in each environment.
3. Manual smoke test:
   - vendor sell/buy/light-up task completion from UI
   - replay attempt with same hash (same completion vs different completion)
   - deploy_lock task with and without valid task config
   - wallet switching with `X-Active-Wallet` propagation

---

## Suggested PR Title

`fix(quests): harden vendor task completion flow, replay safety, and tx-proof UX`

## Suggested PR Description

### Summary

This PR hardens vendor quest completion end-to-end across UI, API, and DB replay controls. It resolves blocked vendor task completion paths, enforces blockchain verification for vendor tasks even under misconfiguration, improves active-wallet handling, and adds clearer failure modes for env/config issues.

### Key Fixes

- Guarantee tx-proof input UX for tx-based vendor tasks.
- Enforce case-insensitive replay uniqueness (`lower(transaction_hash)`).
- Normalize tx hash input at API and replay registration layers.
- Enforce vendor blockchain verification regardless of `verification_method` misconfiguration.
- Eliminate non-atomic completion rollback by registering tx replay claims before completion persistence.
- Support same-completion tx resubmissions without false replay conflicts.
- Add deploy-lock tx fallback path when config is unavailable.
- Add explicit vendor config errors for missing/invalid contract env.

### Migration

- `supabase/migrations/149_normalize_quest_verified_tx_hashes.sql`

### Testing

- Updated and added focused unit/integration coverage for:
  - vendor tx UI behavior
  - replay conflict behavior
  - vendor verification config guards
  - complete-task API behavior

### Risk

Low-to-moderate; changes are surgical and backed by focused tests. Primary runtime dependency is applying migration and ensuring vendor address env is set correctly.
