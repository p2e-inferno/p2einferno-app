# Check-in API Porting: Phased Plan (Low-Risk)

## Goal
Port the check-in flow to `/api/checkin` with true parity to `DailyCheckinService.performCheckin` while preserving gasless attestations and preventing regressions.

## Phase 0: Parity Contract (Baseline)
**Objective**: Lock the contract and expected behaviors before any code changes.

**Steps**
1. Lock the contract in `docs/checkin-api-parity-contract.md`.
2. Review existing docs for consistency:
   - `docs/checkin-api-parity-tests.md`
   - `docs/checkin-service-vs-api-parity.md`

**Files**
- Reference: `lib/checkin/core/types.ts`
- Reference: `lib/checkin/core/service.ts`
- Reference: `pages/api/checkin/index.ts`
- New: `docs/checkin-api-parity-contract.md`

**Exit Criteria**
- Agreed response contract and activity payload structure.

---

## Phase 1: Tests First (Parity Harness)
**Objective**: Create red tests that codify parity requirements.

**Steps**
1. Create/extend API parity tests with mock Supabase RPC + delegated attestation.
2. Add coverage for method/param validation, conflict, unauthorized, schema UID failure, attestation exceptions, concurrency.

**Files**
- Create: `__tests__/pages/api/checkin-parity.spec.ts`
- Reference: `docs/checkin-api-parity-tests.md`
- Reference: `pages/api/checkin/index.ts`

**Exit Criteria**
- Tests fail on current API (expected), documenting required behavior.

---

## Phase 2: Server-Side Parity Calculations
**Objective**: Make `/api/checkin` compute the same streak/xp/multiplier as the service.

**Steps**
1. Reuse service public methods (no private factory calls):
   - `getDefaultCheckinService().canCheckinToday(...)`
   - `getDefaultCheckinService().getCheckinPreview(...)`
   - `getDefaultCheckinService().getCurrentTier(...)`
   - **Do not call** `DailyCheckinService.performCheckin()` from `/api/checkin` (it can recurse back into `/api/checkin` via `xpUpdater.updateUserXPWithActivity`).
2. Pre-check eligibility before delegated attestation to avoid wasting gas.
3. Bind delegated attestation to profile wallet:
   - `attestationSignature.recipient === profile.wallet_address`
   - (optional) `attestationSignature.attester === profile.wallet_address`
4. Treat the server as source of truth:
   - Ignore client-sent `xpAmount` (if present).
   - Compute `xpEarned` from the service preview/breakdown.
5. Return correct response fields: `xpEarned`, `newStreak`, `breakdown`.

**Files**
- Update: `pages/api/checkin/index.ts`
- Import: `lib/checkin/index.ts` (for `getDefaultCheckinService`)
- Reference: `lib/checkin/core/service.ts`

**Exit Criteria**
- Phase 1 tests pass for success and conflict paths.

---

## Phase 3: Activity Data Parity
**Objective**: Ensure RPC receives the same `activityData` structure as the service.

**Steps**
1. Build `activityData` server-side with:
   - `greeting`, `streak`, `xpBreakdown`, `multiplier`, `tierInfo`, `timestamp`, `activityType`
2. Include `attestationUid` when delegated attestation succeeds.

**Files**
- Update: `pages/api/checkin/index.ts`
- Reference: `lib/checkin/core/service.ts`
- Reference: `supabase/migrations/102_perform_daily_checkin_tx.sql`

**Exit Criteria**
- Tests assert RPC payload includes full activity data.

---

## Phase 4: Gasless Attestation Safety
**Objective**: Match the chosen EAS policy and prove it with tests.

**Steps**
1. Add tests for:
   - Schema UID missing
   - `createDelegatedAttestation` failure or throw
   - Signature-wallet mismatch (`attestationSignature.recipient !== profile.wallet_address`) is rejected (or attestation is skipped) with clearly defined behavior
2. Confirm behavior matches the policy:
   - Default (fail-closed parity): EAS failures fail the check-in.
   - Optional override: `CHECKIN_EAS_GRACEFUL_DEGRADE=1` restores “log + continue without attestation”.

**Files**
- Update: `__tests__/pages/api/checkin-parity.spec.ts`
- Reference: `lib/attestation/core/delegated.ts`

**Exit Criteria**
- Tests cover fail-closed and graceful modes, plus delegated-success wiring.

---

## Phase 5: Client Cutover (No Behavior Change)
**Objective**: Ensure hook works with corrected API response without changes.

**Steps**
1. Verify `useDailyCheckin` expects `xpEarned` + `newStreak`.
2. Run manual or E2E smoke tests for the check-in UI.
3. Add a unit test proving the hook consumes `xpEarned/newStreak` from the API response and renders the correct toast.

**Files**
- Reference: `hooks/checkin/useDailyCheckin.ts`
- Create: `__tests__/unit/hooks/checkin/useDailyCheckin.test.ts`
- Optional: `tests/e2e/` (if needed)

**Exit Criteria**
- UI toast shows correct XP + streak.

---

## Phase 6: Cleanup and Hardening
**Objective**: Remove now-unused paths and tighten validation.

**Steps**
1. Stop sending legacy fields from the client (keep server as the only source of truth for XP/streak):
   - `xpAmount` is no longer sent by the hook (API still ignores it if present for backward compatibility).
2. Ensure delegated signature payload is JSON-safe:
   - The delegated signature includes `bigint` fields (`deadline`, `expirationTime`); the client must stringify these before `JSON.stringify(...)` or the request will throw.
3. Document final API behavior and contract (fail-closed default; `CHECKIN_EAS_GRACEFUL_DEGRADE=1` override).

**Files**
- Update: `pages/api/checkin/index.ts`
- Update: `hooks/checkin/useDailyCheckin.ts`
- Update: `__tests__/unit/hooks/checkin/useDailyCheckin.test.ts`
- Optional: `docs/checkin-api-parity-contract.md`
- Optional: `docs/checkin-service-vs-api-parity.md`

**Exit Criteria**
- Parity tests green; API is authoritative.

---

## Summary of Files
**Create**
- `__tests__/api/checkin-parity.test.ts`

**Update**
- `pages/api/checkin/index.ts`
- `docs/checkin-api-parity-tests.md` (if test spec changes)
- Optional: `docs/checkin-service-vs-api-parity.md` (final behavior notes)

**Reuse (Imports)**
- `lib/checkin/index.ts` (`getDefaultCheckinService`)
- `lib/checkin/core/service.ts` (behavior reference)
- `lib/attestation/core/delegated.ts` (delegated attestations)

**Reference**
- `supabase/migrations/102_perform_daily_checkin_tx.sql`
- `lib/checkin/core/types.ts`
