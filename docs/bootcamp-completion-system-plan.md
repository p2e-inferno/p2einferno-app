# Bootcamp Completion & Certification System

## Overview

Implement a complete bootcamp completion flow with hybrid triggers (automatic + manual admin), learner certificate NFT claiming with EAS attestation, and admin bulk completion capabilities.

## Architecture

### Module Structure (DRY & Modular)

- `lib/bootcamp-completion/` - New module following `@attestation/` pattern
- `components/bootcamp-completion/` - UI components
- `hooks/bootcamp-completion/` - React hooks
- Database functions for completion validation
- API endpoints for completion and certificate claiming

---

## Implementation Plan

### Phase 1: Database & Core Logic

#### 1.1 Create Database Migration

**File**: `supabase/migrations/078_bootcamp_completion_system.sql`

- Add function `check_bootcamp_completion_eligibility(p_user_profile_id, p_cohort_id)` → returns boolean + metadata
- Validates all milestones completed
- Checks bootcamp end date
- Returns completion stats
- Add function `mark_bootcamp_complete(p_enrollment_id, p_completed_by)` 
- Updates `bootcamp_enrollments`: `enrollment_status='completed'`, `completion_date=NOW()`
- Validates eligibility first
- Creates activity log entry
- Returns success/error
- Add trigger `auto_complete_bootcamp_on_milestone_completion()`
- Fires AFTER UPDATE on `user_milestone_progress`
- Checks if all cohort milestones completed + end date passed
- Calls `mark_bootcamp_complete()` automatically
- Add table `bootcamp_completion_remarks` (for post-completion feedback/misconduct notes)
- Columns: id, enrollment_id, remark_type (feedback|misconduct|other), content, created_by, created_at

#### 1.2 Attestation Schema Setup

**Files**:

- Verify `lib/attestation/schemas/definitions.ts` has `BOOTCAMP_COMPLETION_SCHEMA`
- Add to `lib/attestation/schemas/registry.ts` if not present

---

### Phase 2: Backend Services Module

#### 2.1 Create `lib/bootcamp-completion/` Module

Following `lib/attestation/` structure:

**`lib/bootcamp-completion/core/service.ts`**

- `BootcampCompletionService` class
- `checkEligibility(userId, cohortId)` - wrapper for DB function
- `markComplete(enrollmentId, completedBy, isAutomatic)` - calls DB function + logging
- `getCompletionStats(enrollmentId)` - fetch completion metadata

**`lib/bootcamp-completion/core/validator.ts`**

- `validateCompletionEligibility()` - business logic validation
- `validateBulkCompletionRequest()` - for admin bulk operations

**`lib/bootcamp-completion/database/queries.ts`**

- Supabase query builders for completion checks
- Bulk completion query builders

**`lib/bootcamp-completion/utils/helpers.ts`**

- `formatCompletionDate()`
- `calculateCompletionPercentage()`
- `getCompletionMessage()`

**`lib/bootcamp-completion/index.ts`**

- Module exports (barrel file)

#### 2.2 Certificate NFT Service

**`lib/bootcamp-completion/certificate/service.ts`**

- `CertificateService` class
- `grantCertificateNFT(userId, bootcampId, cohortId)` - uses `UserKeyService`
- `createCompletionAttestation(params)` - wraps `AttestationService`
- `claimCertificate(userId, enrollmentId)` - orchestrates NFT grant + attestation

**`lib/bootcamp-completion/certificate/types.ts`**

- TypeScript interfaces for certificate data

---

### Phase 3: API Endpoints

#### 3.1 User-Facing Certificate Claim Endpoint

**File**: `pages/api/bootcamp/certificate/claim.ts`

- `POST /api/bootcamp/certificate/claim`
- Body: `{ enrollmentId, cohortId }`
- Authentication: Privy user (via `getPrivyUser`)
- Logic:

1. Verify user owns the enrollment
2. Check enrollment is completed
3. Check bootcamp has `lock_address`
4. Grant NFT key (gasless via `UserKeyService`)
5. Create EAS attestation with completion data
6. Return `{ success, transactionHash, attestationUid }`

#### 3.2 Admin Manual Completion Endpoint

**File**: `app/api/admin/bootcamp-completion/route.ts`

- `POST /api/admin/bootcamp-completion` - Mark single enrollment complete
- Body: `{ enrollmentId }`
- Validates eligibility via `check_bootcamp_completion_eligibility()`
- Calls `mark_bootcamp_complete()`
- Revalidates cache tags

- `POST /api/admin/bootcamp-completion/bulk` - Bulk completion
- Body: `{ cohortId, enrollmentIds[] }`
- Validates all enrollments meet criteria
- Batch calls `mark_bootcamp_complete()`
- Returns array of results

- `POST /api/admin/bootcamp-completion/remarks` - Add remark
- Body: `{ enrollmentId, remarkType, content }`
- Inserts into `bootcamp_completion_remarks`

#### 3.3 Completion Status Endpoint

**File**: `pages/api/user/bootcamp/[cohortId]/completion-status.ts`

- `GET /api/user/bootcamp/[cohortId]/completion-status`
- Returns: `{ isEligible, isCompleted, stats, canClaimCertificate, lockAddress }`

---

### Phase 4: React Hooks

#### 4.1 Completion Status Hook

**File**: `hooks/bootcamp-completion/useBootcampCompletionStatus.ts`

- Fetches eligibility and completion status
- Similar pattern to `useMilestoneClaim`

#### 4.2 Certificate Claim Hook

**File**: `hooks/bootcamp-completion/useCertificateClaim.ts`

- Manages certificate claiming flow
- State: `{ isClaiming, hasClaimed, claimError }`
- Method: `claimCertificate()` - calls API + toast feedback

**File**: `hooks/bootcamp-completion/index.ts`

- Barrel export

---

### Phase 5: UI Components

#### 5.1 Certificate Claim Button Component

**File**: `components/bootcamp-completion/CertificateClaimButton.tsx`

- Props: `enrollmentId, cohortId, bootcampName, lockAddress, onClaimed`
- States: not-eligible, eligible, claiming, claimed, error
- Uses `useCertificateClaim` hook
- Toast notifications
- Similar UX to `MilestoneTaskClaimButton`

#### 5.2 Completion Badge Component

**File**: `components/bootcamp-completion/CompletionBadge.tsx`

- Visual indicator for completed bootcamps
- Shows completion date
- Shows certificate status (claimed/unclaimed)

#### 5.3 Admin Bulk Completion Modal

**File**: `components/admin/bootcamp-completion/BulkCompletionModal.tsx`

- List of eligible enrollments
- Checkboxes for selection
- Bulk action button
- Progress indicator

#### 5.4 Admin Completion Actions

**File**: `components/admin/bootcamp-completion/CompletionActions.tsx`

- Single enrollment completion button
- Remarks input/display
- Integrated into existing admin cohort pages

**File**: `components/bootcamp-completion/index.ts`

- Barrel export

---

### Phase 6: UI Integration

#### 6.1 Update Learner Bootcamp Page

**File**: `pages/lobby/bootcamps/[cohortId].tsx`

- Add completion status section at top (when all milestones done)
- Show `<CertificateClaimButton>` when eligible
- Show `<CompletionBadge>` when completed

#### 6.2 Update Enrolled Bootcamps Page

**File**: `pages/lobby/bootcamps/enrolled.tsx`

- "View Certificate" button links to certificate claim/view page OR opens modal
- Display `<CompletionBadge>` on completed bootcamps

#### 6.3 Create Certificate View Page

**File**: `pages/lobby/bootcamp/certificate/[enrollmentId].tsx`

- Shows completion stats
- `<CertificateClaimButton>` if not claimed
- NFT details if claimed
- Link to EAS attestation explorer
- Share certificate CTA

#### 6.4 Admin Cohort Applications Page

**File**: `pages/admin/cohorts/[cohortId]/applications.tsx`

- Add "Completion" tab/section
- Show eligible enrollments count
- `<BulkCompletionModal>` trigger
- Individual completion actions
- Remarks column/modal

---

### Phase 7: Automated Completion Scheduler (Optional Enhancement)

**File**: `supabase/functions/check-bootcamp-completions/index.ts`

- Edge function (or cron job)
- Runs daily/hourly
- Queries enrollments where all milestones done + end_date passed
- Calls completion function
- Sends notifications

---

## Key Files Summary

### New Files

- `supabase/migrations/078_bootcamp_completion_system.sql`
- `lib/bootcamp-completion/core/service.ts`
- `lib/bootcamp-completion/core/validator.ts`
- `lib/bootcamp-completion/certificate/service.ts`
- `lib/bootcamp-completion/certificate/types.ts`
- `lib/bootcamp-completion/database/queries.ts`
- `lib/bootcamp-completion/utils/helpers.ts`
- `lib/bootcamp-completion/index.ts`
- `pages/api/bootcamp/certificate/claim.ts`
- `app/api/admin/bootcamp-completion/route.ts`
- `pages/api/user/bootcamp/[cohortId]/completion-status.ts`
- `hooks/bootcamp-completion/useBootcampCompletionStatus.ts`
- `hooks/bootcamp-completion/useCertificateClaim.ts`
- `hooks/bootcamp-completion/index.ts`
- `components/bootcamp-completion/CertificateClaimButton.tsx`
- `components/bootcamp-completion/CompletionBadge.tsx`
- `components/bootcamp-completion/index.ts`
- `components/admin/bootcamp-completion/BulkCompletionModal.tsx`
- `components/admin/bootcamp-completion/CompletionActions.tsx`
- `components/admin/bootcamp-completion/index.ts`
- `pages/lobby/bootcamp/certificate/[enrollmentId].tsx`

### Modified Files

- `pages/lobby/bootcamps/[cohortId].tsx` - add completion UI
- `pages/lobby/bootcamps/enrolled.tsx` - add certificate claim/view
- `pages/admin/cohorts/[cohortId]/applications.tsx` - add admin completion controls
- `lib/attestation/schemas/registry.ts` - ensure bootcamp schema registered

---

## Testing Checklist

- [ ] Automatic completion triggers when last milestone completed + date passed
- [ ] Manual admin completion works before end date (when all milestones done)
- [ ] Certificate NFT grants successfully
- [ ] EAS attestation creates successfully
- [ ] Bulk completion processes multiple enrollments
- [ ] Remarks can be added post-completion
- [ ] UI shows correct states (eligible, claiming, claimed)
- [ ] Error handling for failed NFT grants
- [ ] Error handling for failed attestations
- [ ] Cache invalidation works correctly

