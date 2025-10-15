# Bootcamp Completion & Certification — Implementation Notes (2025-10)

This document captures the final implemented design for the Bootcamp Completion & Certification system, including database changes, API endpoints, services, hooks/UI, deployment scripts, and operational guidance. It reflects the code added across migrations, backend, and frontend, plus critical design choices (e.g., single canonical attestation schema and client‑side attestations).

## Summary

- Automatic completion: Enrollment moves to `completed` as soon as all cohort milestones are completed (no end_date gating).
- Manual certificate claim: A user clicks a claim button to receive a program‑level NFT key; optional EAS attestation is client‑side and not required for issuance.
- Admin reconciliation: Admins can fix stuck completion statuses and clear claim locks in bulk.
- Feature‑flagged rollout: All certificate functionality is guarded by `BOOTCAMP_CERTIFICATES_ENABLED`.
- Canonical attestation schema: One unified schema with cohort tracking (no V1/V2 split) for bootcamp completion attestations.

## Feature Flag

- Env variable: `BOOTCAMP_CERTIFICATES_ENABLED`
- Default in `.env.example`: `false`. Set to `true` to enable.
- Affects user certificate claim endpoint, user status route, admin reconciliation routes, and client UI/hook visibility.

## Database Changes

### Migrations

- `supabase/migrations/081_bootcamp_completion_system.sql`
  - Adds certificate tracking columns to `public.bootcamp_enrollments`:
    - `milestones_completed_at TIMESTAMPTZ`
    - `certificate_issued_at TIMESTAMPTZ`
    - `certificate_tx_hash TEXT`
    - `certificate_attestation_uid TEXT`
    - `certificate_last_error TEXT`
    - `certificate_last_error_at TIMESTAMPTZ`
    - `certificate_retry_count INT DEFAULT 0`
    - `certificate_claim_in_progress BOOLEAN DEFAULT FALSE`
  - Adds indexes for failure triage, completed but unclaimed, and in‑progress claims.
  - Creates trigger function `public.check_bootcamp_completion()` and attaches it to `public.user_milestone_progress` to set `enrollment_status = 'completed'` when all cohort milestones are completed.
  - Admin utilities:
    - `public.fix_completion_status(p_enrollment_id UUID) RETURNS JSONB`
    - `public.force_clear_claim_lock(p_enrollment_id UUID) RETURNS JSONB`
  - Optional remarks table `public.bootcamp_completion_remarks` with RLS for service role.

- `supabase/migrations/082_unify_bootcamp_completion_schema.sql`
  - Unifies the database attestation schema definition for bootcamp completion to the canonical cohort‑aware form (see Attestation Schema below). This updates the `attestation_schemas` row created by 062.

### Trigger Behavior

- On `public.user_milestone_progress` status update → when a milestone transitions to `completed`, the trigger checks all cohort milestones for the user. If all are completed, `public.bootcamp_enrollments` is updated to `enrollment_status = 'completed'`, timestamps are recorded, and a `user_activities` row is inserted.

### Claim Locking (DB‑level)

- Lightweight “in‑progress” flag with TTL semantics:
  - `certificate_claim_in_progress = true` is set at claim start.
  - If another claim is attempted within 5 minutes of `updated_at`, it returns `409` (conflict).
  - Stale flags are ignored (no permanent lockouts).

## Attestation Schema (Canonical)

We unified the bootcamp completion schema into a single canonical schema definition with cohort tracking — not “V2”.

- Canonical definition (in DB and code):

  ```text
  string cohortId,
  string cohortName,
  string bootcampId,
  string bootcampTitle,
  address userAddress,
  uint256 completionDate,
  uint256 totalXpEarned,
  string certificateTxHash
  ```

- Code references:
  - `lib/attestation/core/config.ts:72` → `P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION` now resolves from `BOOTCAMP_COMPLETION_SCHEMA_UID` if set.
  - `lib/attestation/schemas/definitions.ts` → `BOOTCAMP_COMPLETION_SCHEMA` uses the cohort‑aware definition above.

### On‑Chain Deployment & UID Sync

- Deploy the canonical schema to EAS (Base Sepolia/mainnet as configured), then set:
  - `BOOTCAMP_COMPLETION_SCHEMA_UID=0x...`
- After deployment, update the `attestation_schemas` DB row’s `schema_uid` to match the on‑chain UID if the placeholder UID from 062 was used. (We can supply a tiny sync script if desired.)

## Backend Services

### CertificateService

- File: `lib/bootcamp-completion/certificate/service.ts`
- Responsibilities:
  - Acquire the claim lock (with TTL semantics).
  - Idempotent pre‑check: if any linked user wallet already holds the program key, immediately mark issuance and return success.
  - Grant the key via `UserKeyService.grantKeyToUser` (admin gasless write). Records tx hash.
  - Mark issuance as complete.
  - Attestation is optional and remains pending until the client creates it and commits the UID.
  - Always releases the in‑progress flag.

### Admin Utilities

- `public.fix_completion_status(enrollment_id)` → recalculates milestone completion and fixes status when eligible.
- `public.force_clear_claim_lock(enrollment_id)` → clears a stuck `certificate_claim_in_progress` flag.

## API Endpoints

All endpoints below enforce the feature flag: return `403` if `BOOTCAMP_CERTIFICATES_ENABLED !== 'true'`.

### User Certificate Claim

- File: `pages/api/bootcamp/certificate/claim.ts`
- Method: `POST`
- Body: `{ cohortId: string }`
- Auth: Privy JWT via `getPrivyUser`
- Flow:
  1. Validate user, load enrollment, ensure `enrollment_status = 'completed'`.
  2. Ensure program `lock_address` exists.
  3. Call `CertificateService.claimCertificate(...)`.
  4. Return `{ success, txHash, attestationPending }`.

### User Attestation Commit (Client‑Side Only)

- File: `pages/api/bootcamp/certificate/commit-attestation.ts`
- Method: `POST`
- Body: `{ cohortId: string, attestationUid: string }`
- Auth: Privy JWT
- Purpose: Persist the attestation UID after the client creates it with their wallet.

> Note: We intentionally removed the previously proposed “retry‑attestation” server endpoint to avoid implying server‑side attestations. User‑initiated attestations occur in the browser only.

### User Completion Status (App Route)

- File: `app/api/user/bootcamp/[cohortId]/completion-status/route.ts`
- Method: `GET`
- Auth: Privy (cookies/Authorization)
- Response: `{ isCompleted, completionDate, certificate: { issued, issuedAt, txHash, attestationUid, lastError, canRetryAttestation }, lockAddress }`.

### Admin Reconciliation (App Routes)

- File: `app/api/admin/bootcamp-completion/route.ts` (POST)
  - Actions: `fix-status`, `force-unlock`, `save-attestation`
  - Guarded by `ensureAdminOrRespond`

- File: `app/api/admin/cohorts/[cohortId]/fix-statuses/route.ts` (POST)
  - Bulk fix up to 500 enrollments via `fix_completion_status` RPC
  - Guarded by `ensureAdminOrRespond`

## Hooks & UI

### Hooks

- `hooks/bootcamp-completion/useBootcampCompletionStatus.ts`
  - Fetches the user’s completion/certificate status for a cohort.

- `hooks/bootcamp-completion/useCertificateClaim.ts`
  - Claims the certificate via REST; then, if `attestationPending`, provides a `retryAttestation()` that:
    - Uses the browser wallet to create an attestation via `AttestationService.createAttestation({ schemaUid: P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION, ... })`.
    - Calls `POST /api/bootcamp/certificate/commit-attestation` to persist the UID.

### User Components

- `components/bootcamp-completion/CertificateClaimButton.tsx`
  - Renders appropriate state (disabled until completed or when `lockAddress` missing; claimed badge; retry attestation button when pending).

- `components/bootcamp-completion/CompletionBadge.tsx`
  - Displays “Completed” and optional “Certificate Claimed”.

- Integration:
  - `pages/lobby/bootcamps/[cohortId].tsx` adds a “Completion & Certificate” strip showing `CompletionBadge` and `CertificateClaimButton` once eligible.

### Admin Component

- `components/admin/bootcamp-completion/ReconciliationPanel.tsx`
  - Renders “Fix Stuck Completion Statuses” button backed by `POST /api/admin/cohorts/[cohortId]/fix-statuses`.
  - Wired into `pages/admin/cohorts/[cohortId]/applications.tsx` under a “Completion” section.

## Deployment Scripts

- `scripts/deploy-bootcamp-attestation-schema.ts`
  - Deploys the canonical bootcamp completion schema to EAS; prints the UID. Set the env value afterward.

- `scripts/preflight-certificates.ts`
  - CI/CD guard to block deploys when any `bootcamp_enrollments.certificate_issued = true` exists (clean cutover policy).

### Package Scripts

- `package.json`
  - `deploy:attestation-schema`: `ts-node scripts/deploy-bootcamp-attestation-schema.ts`
  - `preflight:certificates`: `ts-node scripts/preflight-certificates.ts`

## Configuration & Env

- `.env.example`
  - `BOOTCAMP_CERTIFICATES_ENABLED=false`
  - `BOOTCAMP_COMPLETION_SCHEMA_UID=` (set to EAS schema UID after deployment)

## Operational Flows

### Completion

1. User completes all cohort milestones → trigger sets enrollment to `completed` and records timestamps.

### Certificate Claim

1. User clicks “Claim”
2. API `POST /api/bootcamp/certificate/claim`:
   - Acquire claim lock → pre‑check existing key → grant key (admin write) → mark issued (attestation pending)
3. UI shows success; if attestation pending, show “Retry Attestation”.

### Attestation (Optional)

1. User clicks “Retry Attestation”
2. Browser wallet creates attestation for `P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION`
3. Client calls `POST /api/bootcamp/certificate/commit-attestation` to save the UID and clear error flags.

### Admin Reconciliation

1. Use the panel to bulk fix statuses or clear claim locks.
2. Admin can also store attestation UIDs with `save-attestation` action if doing manual reconciliation.

## Concurrency & Error Handling

- Lock pattern avoids double‑grants. 5‑minute TTL prevents permanent stuck states.
- Pre‑check with `UserKeyService.checkUserKeyOwnership` ensures idempotency (unlock rejects duplicates anyway).
- Errors are recorded on the enrollment row (`certificate_last_error`, `certificate_last_error_at`), visible in status responses.

## Limitations / Intentional Constraints

- User‑initiated attestations are client‑side only. The server does not perform end‑user attestations (no custodial signer).
- The database `attestation_schemas` row must have a `schema_uid` matching the on‑chain UID to allow `AttestationService.createAttestation` to load the schema definition.
- Key grant requires a configured admin private key (`LOCK_MANAGER_PRIVATE_KEY`). When absent, grant service returns a clear message and no write occurs.

## Verification Checklist

1. Migrations apply cleanly (`081`, `082`).
2. Trigger fires when last milestone completes; enrollment moves to `completed`.
3. Claim API: returns success; key visible on chain (or early‑exit if already present).
4. Status route: shows `isCompleted=true`, `certificate.issued=true`, `attestationPending=true` initially.
5. Attestation retry (client): attestation created; commit endpoint persists UID; status shows `attestationPending=false`.
6. Admin bulk fix works; lock clear works.

## Future Enhancements

- Add a tiny “schema UID sync” script to update `attestation_schemas.schema_uid` from `BOOTCAMP_COMPLETION_SCHEMA_UID` automatically post‑deploy.
- Optional: cache invalidation tags for the user status App Route.
- Optional: add an admin UI to paste attestation UID for manual reconciliation on specific enrollments.

---

If you need help applying the migrations, deploying the schema, or running through an end‑to‑end verification, see the “Verification Checklist” above or ping the author.

