# Multi‑Transaction Stepper Modal — Implementation Plan

## Summary
Admin lock deployment for Bootcamps, Cohorts, Quests, and Milestones currently runs a **multi‑transaction** onchain flow, but the UX is implemented per‑form with a single `deploymentStep` string and a series of toasts. This plan introduces a reusable, configuration‑driven **Transaction Stepper Modal** that:

- Guides admins through each transaction step (wallet prompt → tx submitted → on‑chain confirmed).
- Provides deterministic step ordering and consistent Web3‑native copy.
- Blocks closing while a step is pending (unless error/cancel).
- Allows retrying a failed step without restarting the entire flow.
- Becomes the standard deployment UX for any multi‑transaction flows in the app.

This is a UX + orchestration refactor: the onchain logic remains owned by the existing deployment hooks/utilities.

## Goals
- **Reusable**: one stepper component used across entity types.
- **Deterministic**: step order is explicit and consistent across runs.
- **Wallet‑aware**: makes “Awaiting wallet confirmation” vs “Confirming on‑chain” obvious.
- **Safe**: no automatic retries; only user‑initiated retry of a failed step.
- **Non‑disruptive**: preserve existing draft/pending deployment persistence patterns.

## Non‑Goals (this document’s scope)
- Changing the underlying onchain semantics (batching, contract changes, etc.).
- Adding new backfill tools or migration automation.
- Rewriting admin fetching to React Query (optional future enhancement only).

## Current System Context (What Exists Today)

### Where deployment UX is implemented today
Each admin form includes a lock deployment helper that:
- Updates a string like `setDeploymentStep("Deploying lock on blockchain...")`.
- Shows success/warning toasts.
- Persists draft + pending deployment state.

Primary entry points:
- `components/admin/BootcampForm.tsx` — `deployLockForBootcamp`
- `components/admin/CohortForm.tsx` — `deployLockForCohort`
- `components/admin/QuestForm.tsx` — `deployLockForQuest`
- `components/admin/MilestoneFormEnhanced.tsx` — `deployLockForMilestone`

### Underlying multi‑transaction sequence
All four entity flows use the same core hook:
- `hooks/unlock/useDeployAdminLock.ts`

Which performs sequential transactions (and returns structured results):
1. Deploy lock (factory `createUpgradeableLockAtVersion`)
2. Grant server wallet lock manager role (`addLockManager`)
3. Update lock config (`updateLockConfig`) — conditional
4. Disable transfers (`updateTransferFee(10000)`)

### Important adjacent system behavior to preserve
- Draft + pending deployment state:
  - `lib/utils/lock-deployment-state.ts`
  - `pages/admin/draft-recovery.tsx`
  - `pages/api/admin/recover-lock-deployment.ts`
- Post‑deploy persistence of “security dimensions” and failure reasons happens in existing form logic and admin APIs.

## Proposed Approach (Recommended): Config‑Driven Stepper + Hook

### High‑level architecture
We introduce:
1) A reusable UI component: `TransactionStepperModal`
2) An orchestration hook: `useTransactionStepper`
3) Config builders per entity: `buildXDeploymentFlow(...)`

This keeps the “what are the steps?” (config) separate from “how do we run them?” (hook) and “how do we show them?” (modal).

### Why this is DRY
- All logic for step state transitions, retry rules, and modal behavior lives in one place.
- Each entity only supplies a config (titles/descriptions + the `execute()` functions).
- We can reuse the same step definitions across entities when they share steps.

## Detailed Design

### Types
Create types that are generic enough for future flows (not just lock deployment).

```ts
export type StepPhase =
  | "idle"
  | "awaiting_wallet"
  | "submitted"
  | "confirming"
  | "success"
  | "error";

export type TxResult = {
  transactionHash?: string;
  receipt?: unknown; // viem receipt if available
  // optional structured metadata for downstream saving (e.g., lockAddress)
  data?: Record<string, unknown>;
};

export type DeploymentStep = {
  id: string;
  title: string;
  description?: string;
  /**
   * Executes the step. Must throw on failure.
   * Should return txHash (when applicable) and any structured data needed later.
   */
  execute: () => Promise<TxResult>;
};

export type DeploymentFlowConfig = {
  entityType: "bootcamp" | "cohort" | "quest" | "milestone";
  title: string; // Modal title, e.g. "Deploy bootcamp lock"
  steps: DeploymentStep[];
};
```

Notes:
- The stepper does not assume every step is onchain; it just models phases and errors.
- The “awaiting wallet confirmation” state is represented as a phase set immediately before calling `execute()`.

### State model
The stepper runtime state is an array parallel to `steps[]`.

Per step state:
- `phase: StepPhase`
- `transactionHash?: string`
- `errorMessage?: string`
- `startedAt/endedAt?: number` (optional; useful for diagnostics and later analytics)

Global state:
- `activeStepIndex: number`
- `isRunning: boolean`
- `canClose: boolean` derived from phases (block close if any step is in `awaiting_wallet|submitted|confirming`)

### Execution algorithm (sequential)
Rules:
- Execute steps strictly in order.
- Autoadvance on success.
- Stop on first failure.
- Allow retry only for the failed step.

Pseudo:
1. When `start()` is called:
   - set `activeStepIndex = first idle step`
2. For each step:
   - set phase `awaiting_wallet`
   - call `execute()`
   - set phase `submitted` once txHash known (if returned)
   - set phase `confirming` while awaiting receipt (execute() typically returns after receipt)
   - set phase `success` and advance
3. On error:
   - set phase `error` and store message
   - unlock modal close

### Modal UX requirements
- Modal is open while running.
- **Close button disabled** while any step is pending.
- On error:
  - show error panel under the failed step
  - show “Retry step” and “Cancel” actions
- On success:
  - show final “Done” action

Copy guidelines:
- “Awaiting wallet confirmation…”
- “Transaction submitted”
- “Confirming on‑chain…”
- “Transaction confirmed”

### Accessibility & UX details
- Use existing modal primitives (`components/ui/dialog`).
- Use ARIA‑compliant focus trapping from the dialog implementation.
- Ensure stepper has clear iconography (idle/active/success/error).
- Ensure error messages are selectable/copyable and truncated gracefully.
- Include links to block explorers when tx hash exists (optional).

## Files To Create / Modify

### New files
- `components/admin/TransactionStepperModal.tsx`
  - Presentation component (modal + stepper UI).
- `hooks/useTransactionStepper.ts`
  - Orchestration hook + runtime state machine.
- `lib/blockchain/deployment-flows.ts`
  - Config builders for each entity type.

### Files to modify (integration)
- `components/admin/BootcampForm.tsx`
- `components/admin/CohortForm.tsx`
- `components/admin/QuestForm.tsx`
- `components/admin/MilestoneFormEnhanced.tsx`

### Files reused (no behavioral changes)
- `hooks/unlock/useDeployAdminLock.ts` (source of onchain steps today)
- `lib/utils/lock-deployment-state.ts` (draft/pending deployment persistence)
- Existing admin API endpoints and “security dimension” state logic

## Step Identification Per Entity (What the modal will show)

### Baseline (shared) steps
For all entity types:
1) **Deploy lock**
   - Onchain: factory create
2) **Grant server wallet manager role**
   - Onchain: `addLockManager(serverWallet)`
3) **Configure lock purchases**
   - Onchain: `updateLockConfig(...)` (only when called in current flow)
4) **Disable transfers**
   - Onchain: `updateTransferFee(10000)`

### Entity nuances
- Bootcamp / Quest / Milestone:
  - Usually include the “configure lock purchases” semantics (grant‑only / purchase disabled) in config.
- Cohort:
  - May have different lock economics but still shares transferability + manager requirements.

Implementation note:
- We can either:
  - (A) model these as separate step executes that call contract writes directly (more granular), or
  - (B) treat `useDeployAdminLock` as one execute and display sub‑steps by instrumenting the hook (less immediate).

Recommendation for v1:
- Keep granularity aligned with what we can reliably signal today:
  - Option 1 (preferred): refactor deployment execution to expose per‑tx exec functions.
  - If refactor risk is too high, implement v1 as a single “Deploy & configure lock” step and add per‑tx sub‑step events later.

## Integration Plan (per form)

### Common changes in each form
Replace:
- `deploymentStep` string updates
- multi‑toast sequence as primary UX

With:
- Build a `DeploymentFlowConfig` (entity‑specific).
- Open `TransactionStepperModal` at the start of deployment.
- Use modal completion callback to update local state:
  - `lockAddress`
  - `lock_manager_granted` + failure reason
  - `max_keys_secured` + failure reason (where relevant)
  - `transferability_secured` + failure reason
- Continue using existing draft/pending deployment persistence after successful step execution.

### Bootcamp integration (example)
- Existing: `deployLockForBootcamp` does `deployAdminLock(params)` and sets `deploymentStep`.
- New:
  - Build flow: `buildBootcampDeploymentFlow({ formData, isAdmin, ... })`
  - Stepper returns `AdminLockDeploymentResult`‑like payload.
  - Reuse the existing `applyDeploymentOutcome` and `effective*ForSave` logic unchanged.

### Cohort integration (example)
- Existing: `deployLockForCohort` does `deployAdminLock(params)` and sets `deploymentStep`.
- New:
  - Flow builder includes step descriptions specific to cohort access locks.
  - Keep parent bootcamp lock address enrichment and pending deployment save intact.

### Quest integration (example)
- Similar to bootcamp; keep `deploymentOutcomeRef` behavior to avoid async race conditions.

### Milestone integration (example)
- Similar; keep the parent cohort lock fetch enrichment.

## Recommendation
Proceed with this **config‑driven stepper + hook** approach.

If we want the cleanest stepper UI (showing each tx as its own step), we should expose per‑transaction “execute step” functions rather than treating `useDeployAdminLock` as an all‑in‑one black box.

## Testing / Validation Checklist
Manual QA in admin UI:
- Start deployment → modal opens → step states progress correctly.
- Wallet reject at step N → step shows error → retry works.
- Tx reverts onchain → step shows error with message → retry works.
- Ensure modal cannot be closed while awaiting wallet or confirming onchain.
- Ensure existing post‑deploy DB persistence still happens (no regression in grant/maxKeys/transferability flags).
- Ensure pending deployment save still happens after deploy (for recovery).

Automated tests (unit‑level, no chain required):
- Stepper state machine: sequential success, fail mid‑way, retry, cancel.
- Ensure “block close while pending” logic is correct.

### Planned Test Additions (Concrete)
Add Jest tests under `__tests__/` (mirroring the implementation folders) to make the stepper safe to reuse across future flows.

**Hook unit tests**
- `__tests__/unit/hooks/useTransactionStepper.test.ts`
  - Runs a flow with 3 stub steps and asserts phase transitions:
    - `idle → awaiting_wallet → submitted/confirming → success`
  - Stops at first failure and records the error message.
  - `retryStep()` re-runs only the failed step and continues execution.
  - `cancel()` behavior:
    - Allowed when error/idle
    - Blocked when any step is `awaiting_wallet|submitted|confirming`

**UI unit tests (rendering + UX rules)**
- `__tests__/unit/components/admin/TransactionStepperModal.test.tsx`
  - Renders step list and shows the correct visual state per phase.
  - Disables close controls while pending; enables on error/success.
  - Shows tx hash when provided and renders “Retry step” only on failed step.

**Light integration tests (per‑entity config wiring)**
- `__tests__/unit/lib/blockchain/deployment-flows.test.ts`
  - Asserts each builder returns deterministic step ordering for:
    - bootcamp, cohort, quest, milestone
  - Asserts titles/descriptions are present and step ids are unique.

Notes:
- These tests should not require RPC or a local Supabase instance; steps are stubbed/mocked.
- Keep entity forms untested at this level; they already have extensive unrelated surface area. The goal is to lock down the stepper runtime contract and the flow config ordering.

## Future Enhancements (Out of Scope)
- **Sub‑step events**: show “Wallet confirmed / tx hash / confirmations” with richer per‑tx events from viem.
- **Batching / atomic deploy**: if desired, update factory ABI usage to batch multiple calls into deploy (context‑dependent).
- **React Query integration**:
  - Only if admin pages standardize on it, the stepper can `invalidateQueries` after success.
  - Not recommended for executing tx steps themselves.
- **Analytics**: record step durations, failure rates, and common error signatures.
- **Advanced recovery**: surface “Recover pending deployment” directly in the modal when DB write fails after successful chain steps.
- **Multi‑network support**: richer chain/network switch UX if/when deployments span multiple networks.
