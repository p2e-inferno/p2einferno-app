# Bootcamp Completion & Certification System

## Overview

Implement an automatic bootcamp completion system with manual certificate NFT claiming and optional EAS attestation. Completion is triggered immediately when all cohort milestones are completed (no end_date wait required). Certificates are bootcamp-level NFTs with cohort distinction preserved in attestation metadata.

### Key Features

- **Automatic Completion**: Database trigger marks bootcamp complete when all milestones done
- **Manual Certificate Claiming**: Users click "Claim Certificate" button to receive NFT
- **Optional Attestation**: EAS attestation enriches certificates; failure doesn't block issuance
- **Admin Reconciliation**: Fix stuck states, grant keys directly, retry failed attestations
- **Idempotent Operations**: Safe retries and concurrent request handling
- **Feature Flag**: Controlled rollout with instant disable capability

---

## Core Architecture Decisions

### Certificate Model

- **Scope**: Bootcamp-level NFTs (one lock per bootcamp program)
- **Lock Source**: `bootcamp_programs.lock_address`
- **Cohort Distinction**: Preserved in EAS attestation metadata (cohortId/cohortName)
- **Multi-Cohort Support**: Users can earn multiple certificates by completing different cohorts of the same bootcamp

### Completion Trigger

- **Timing**: Immediate when all cohort milestones completed
- **No Date Gating**: Milestone due dates + prerequisites already enforce pacing
- **Trigger Source**: Automatic via database trigger on `user_milestone_progress`
- **Table Reference**: Uses `cohort_milestones` (verified in migrations 004/055/056)

### Certificate Claiming

- **User Action**: Manual "Claim Certificate" button (similar to milestone claims)
- **Components**: NFT key grant (required) + EAS attestation (optional enrichment)
- **Attestation Failures**: Do not block issuance; retry available via UI and admin panel
- **Key Management**: Admin-managed keys (like milestones), user owns the NFT

### Admin Role

- **Reconciliation Only**: Fix stuck completion status, grant keys manually, retry attestations
- **No Overrides**: Cannot complete bootcamps that don't meet eligibility criteria (all milestones must be done)
- **Bulk Operations**: Up to 500 enrollments per request with detailed result reporting

### Data Model States

```
enrollment_status:
  'active' → 'completed' (when all milestones done)

certificate_issued:
  false → true (when user successfully claims NFT key)

Separation allows:
  - Completion tracking independent of certificate issuance
  - Users who complete but don't claim yet
  - Admin visibility into unclaimed certificates
```

---

## Phase 1: Database Schema

### Migration File

**File**: `supabase/migrations/079_bootcamp_completion_system.sql`

### 1.1 Add Certificate Tracking Columns

```sql
-- Add certificate and progress tracking fields to bootcamp_enrollments
-- Note: certificate_issued already exists (migration 003), using IF NOT EXISTS for safety
ALTER TABLE public.bootcamp_enrollments
  ADD COLUMN IF NOT EXISTS milestones_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS certificate_attestation_uid TEXT,
  ADD COLUMN IF NOT EXISTS certificate_last_error TEXT,
  ADD COLUMN IF NOT EXISTS certificate_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certificate_claim_in_progress BOOLEAN DEFAULT FALSE;

-- Indexes for operational queries
CREATE INDEX IF NOT EXISTS idx_be_cert_failed
  ON public.bootcamp_enrollments (cohort_id)
  WHERE certificate_issued = FALSE AND certificate_last_error IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_be_completed_unclaimed
  ON public.bootcamp_enrollments (cohort_id, enrollment_status)
  WHERE enrollment_status = 'completed' AND certificate_issued = FALSE;

CREATE INDEX IF NOT EXISTS idx_be_claim_in_progress
  ON public.bootcamp_enrollments (id, updated_at)
  WHERE certificate_claim_in_progress = TRUE;
```

### 1.2 Completion Trigger Function

```sql
-- Trigger function to automatically mark bootcamp complete when all milestones done
-- Fires after each milestone completion to check if bootcamp is fully complete
CREATE OR REPLACE FUNCTION public.check_bootcamp_completion()
RETURNS TRIGGER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_enrollment_id UUID;
  v_cohort_id TEXT;
  v_total_milestones INT;
  v_completed_milestones INT;
  v_current_status TEXT;
BEGIN
  -- Only proceed if milestone was just marked completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get cohort for this milestone (using cohort_milestones table)
  SELECT cohort_id INTO v_cohort_id
  FROM public.cohort_milestones
  WHERE id = NEW.milestone_id;

  IF v_cohort_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find enrollment for this user/cohort
  SELECT id, enrollment_status
  INTO v_enrollment_id, v_current_status
  FROM public.bootcamp_enrollments
  WHERE user_profile_id = NEW.user_profile_id
    AND cohort_id = v_cohort_id;

  IF v_enrollment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if already completed (idempotent)
  IF v_current_status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Count total vs completed milestones for this cohort
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE ump.status = 'completed') as completed
  INTO v_total_milestones, v_completed_milestones
  FROM public.cohort_milestones cm
  LEFT JOIN public.user_milestone_progress ump
    ON cm.id = ump.milestone_id
    AND ump.user_profile_id = NEW.user_profile_id
  WHERE cm.cohort_id = v_cohort_id;

  -- If all milestones complete, mark bootcamp complete
  -- WHERE clause ensures idempotency under concurrent trigger executions
  IF v_completed_milestones = v_total_milestones AND v_total_milestones > 0 THEN
    UPDATE public.bootcamp_enrollments
    SET
      enrollment_status = 'completed',
      completion_date = now(),
      milestones_completed_at = now()
    WHERE id = v_enrollment_id
      AND enrollment_status != 'completed';  -- Idempotent: prevents double-update

    -- Log completion activity if update occurred
    IF FOUND THEN
      INSERT INTO public.user_activities (
        user_profile_id,
        activity_type,
        activity_data
      ) VALUES (
        NEW.user_profile_id,
        'bootcamp_completed',
        jsonb_build_object(
          'enrollment_id', v_enrollment_id,
          'cohort_id', v_cohort_id,
          'completion_type', 'automatic'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present
DROP TRIGGER IF EXISTS trg_check_bootcamp_completion
  ON public.user_milestone_progress;

-- Attach trigger to user_milestone_progress
CREATE TRIGGER trg_check_bootcamp_completion
  AFTER UPDATE OF status ON public.user_milestone_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bootcamp_completion();
```

### 1.3 Admin Reconciliation Functions

```sql
-- Function to fix stuck completion status
-- Checks if all milestones complete and updates enrollment status if needed
CREATE OR REPLACE FUNCTION public.fix_completion_status(
  p_enrollment_id UUID
)
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_cohort_id TEXT;
  v_total INT;
  v_completed INT;
  v_current_status TEXT;
BEGIN
  -- Get enrollment details
  SELECT user_profile_id, cohort_id, enrollment_status
  INTO v_user_id, v_cohort_id, v_current_status
  FROM public.bootcamp_enrollments
  WHERE id = p_enrollment_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Enrollment not found'
    );
  END IF;

  -- Check milestone completion count
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE ump.status = 'completed')
  INTO v_total, v_completed
  FROM public.cohort_milestones cm
  LEFT JOIN public.user_milestone_progress ump
    ON cm.id = ump.milestone_id AND ump.user_profile_id = v_user_id
  WHERE cm.cohort_id = v_cohort_id;

  -- If all done but status not completed, fix it
  IF v_completed = v_total AND v_total > 0 AND v_current_status != 'completed' THEN
    UPDATE public.bootcamp_enrollments
    SET
      enrollment_status = 'completed',
      completion_date = now(),
      milestones_completed_at = now()
    WHERE id = p_enrollment_id
      AND enrollment_status != 'completed';

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Status fixed successfully',
      'previous_status', v_current_status,
      'new_status', 'completed',
      'milestones_completed', v_completed,
      'total_milestones', v_total
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not eligible for completion',
      'current_status', v_current_status,
      'milestones_completed', v_completed,
      'total_milestones', v_total,
      'reason', CASE
        WHEN v_total = 0 THEN 'No milestones found for cohort'
        WHEN v_completed < v_total THEN 'Not all milestones completed'
        WHEN v_current_status = 'completed' THEN 'Already marked complete'
        ELSE 'Unknown'
      END
    );
  END IF;
END;
$$;

-- Function to force clear stuck claim-in-progress flags (admin use)
CREATE OR REPLACE FUNCTION public.force_clear_claim_lock(
  p_enrollment_id UUID
)
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.bootcamp_enrollments
  SET certificate_claim_in_progress = FALSE
  WHERE id = p_enrollment_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Claim lock cleared',
      'enrollment_id', p_enrollment_id
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Enrollment not found'
    );
  END IF;
END;
$$;
```

### 1.4 Remarks Table (Optional)

```sql
-- Table for post-completion remarks/feedback
CREATE TABLE IF NOT EXISTS public.bootcamp_completion_remarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID REFERENCES public.bootcamp_enrollments(id) ON DELETE CASCADE,
  remark_type TEXT CHECK (remark_type IN ('feedback', 'misconduct', 'context', 'other')),
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remarks_enrollment
  ON public.bootcamp_completion_remarks(enrollment_id);

-- RLS policies
ALTER TABLE public.bootcamp_completion_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage remarks"
  ON public.bootcamp_completion_remarks
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Phase 2: Attestation Schema V2

### Schema Definition

**File**: `lib/attestation/schemas/definitions.ts`

Add new schema with cohort tracking:

```typescript
export const BOOTCAMP_COMPLETION_SCHEMA_V2: Omit<
  AttestationSchema,
  "id" | "created_at" | "updated_at"
> = {
  schema_uid: P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION_V2,
  name: "Bootcamp Completion V2",
  description: "Bootcamp completion attestation with cohort tracking",
  schema_definition:
    "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash",
  category: "achievement",
  revocable: false,
};
```

Update `P2E_SCHEMA_UIDS` in config:

```typescript
// lib/attestation/core/config.ts
export const P2E_SCHEMA_UIDS = {
  // ... existing
  BOOTCAMP_COMPLETION_V2: process.env.BOOTCAMP_COMPLETION_SCHEMA_UID || "",
};
```

### Deployment Process

#### Pre-Deployment Script

**File**: `scripts/deploy-bootcamp-attestation-schema.ts`

```typescript
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";

async function deploySchema() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  const easAddress = process.env.EAS_CONTRACT_ADDRESS!;
  const eas = new EAS(easAddress);
  eas.connect(signer);

  const schemaRegistry = await eas.getSchemaRegistry();

  const schema = "string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateTxHash";

  console.log("Deploying BOOTCAMP_COMPLETION_SCHEMA_V2...");

  const tx = await schemaRegistry.register({
    schema,
    resolverAddress: ethers.ZeroAddress,
    revocable: false,
  });

  const receipt = await tx.wait();
  console.log("✅ Schema deployed!");
  console.log("Transaction:", receipt.transactionHash);
  console.log("Schema UID:", receipt.uid);
  console.log("\nAdd to .env:");
  console.log(`BOOTCAMP_COMPLETION_SCHEMA_UID=${receipt.uid}`);
}

deploySchema().catch(console.error);
```

#### Pre-Flight Gate

**File**: `scripts/preflight-certificates.ts`

```typescript
import { db } from '@/lib/db';
import { bootcamp_enrollments } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

async function checkCertificates() {
  console.log("🔍 Checking for existing certificates...");

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(bootcamp_enrollments)
    .where(eq(bootcamp_enrollments.certificate_issued, true));

  const count = result[0]?.count || 0;

  if (count > 0) {
    console.error(`\n❌ DEPLOYMENT BLOCKED`);
    console.error(`${count} certificate(s) already issued.`);
    console.error(`Migration required before deploying V2 schema.`);
    console.error(`Contact engineering lead.\n`);
    process.exit(1);
  }

  console.log("✅ Pre-flight check passed: No certificates issued");
}

checkCertificates().catch((err) => {
  console.error("Pre-flight check failed:", err);
  process.exit(1);
});
```

Add to `package.json`:

```json
{
  "scripts": {
    "deploy:attestation-schema": "tsx scripts/deploy-bootcamp-attestation-schema.ts",
    "preflight:certificates": "tsx scripts/preflight-certificates.ts"
  }
}
```

#### Deployment Checklist

1. **Deploy schema to EAS**
   ```bash
   npm run deploy:attestation-schema
   ```

2. **Capture schema UID** from output and set environment variable:
   ```bash
   BOOTCAMP_COMPLETION_SCHEMA_UID=0x...
   ```

3. **Update registry** in `lib/attestation/schemas/registry.ts`:
   ```typescript
   import { BOOTCAMP_COMPLETION_SCHEMA_V2 } from './definitions';

   export const PREDEFINED_SCHEMAS = [
     // ... existing
     BOOTCAMP_COMPLETION_SCHEMA_V2,
   ];
   ```

4. **Run pre-flight check** in CI/CD before deployment:
   ```bash
   npm run preflight:certificates
   ```

#### Failure Handling

- **If schema deployment fails**: Feature can still issue keys (degraded mode)
- **User experience**: "Attestation pending - retry available"
- **Admin recovery**:
  1. Retry schema deployment
  2. Set `BOOTCAMP_COMPLETION_SCHEMA_UID`
  3. Use bulk retry attestation endpoint

#### Migration Decision

**Chosen Approach**: Block deployment if any certificates exist (Option A)

**Rationale**: Clean cutover, no dual-schema complexity for MVP

**Alternative**: If certificates exist at launch, either:
- Implement migration script to backfill V1 attestations
- Support both schemas permanently (query both UIDs)

---

## Phase 3: Backend Services

### Certificate Service

**File**: `lib/bootcamp-completion/certificate/service.ts`

```typescript
import { getLogger } from '@/lib/utils/logger';
import { UserKeyService } from '@/lib/services/UserKeyService';
import { AttestationService } from '@/lib/attestation/core/service';
import { getKeyManagersForContext } from '@/lib/helpers/key-manager-utils';
import { db } from '@/lib/db';
import { bootcamp_enrollments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const log = getLogger('bootcamp-completion:certificate');

export class CertificateService {

  /**
   * Claim certificate with two-transaction locking pattern
   *
   * Pattern:
   * - TX1: Acquire claim lock (fast)
   * - External ops: Blockchain calls (slow - 10-30s)
   * - TX2: Commit final state (fast)
   *
   * This avoids holding database locks during blockchain operations
   */
  async claimCertificate(params: {
    enrollmentId: string;
    userId: string;
    userAddress: string;
    cohortId: string;
    lockAddress: string;
  }) {
    const { enrollmentId, userId, userAddress, cohortId, lockAddress } = params;

    // TX1: Quick lock acquisition
    const lockResult = await this.acquireClaimLock(enrollmentId);

    if (lockResult.alreadyIssued) {
      return { success: true, alreadyIssued: true, ...lockResult };
    }

    if (lockResult.inProgress) {
      return {
        success: false,
        error: 'Certificate claim already in progress. If stuck for >5 minutes, try again.'
      };
    }

    try {
      // Check if key already exists (idempotent recovery)
      const existingKey = await this.checkExistingKey(userAddress, lockAddress);

      let txHash: string;

      if (existingKey) {
        log.info('Key already exists, reconciling state', {
          enrollmentId,
          txHash: existingKey.txHash
        });
        txHash = existingKey.txHash;
      } else {
        // Grant NFT key (admin-managed, user owns)
        const keyResult = await UserKeyService.grantKeyToUser({
          walletAddress: userAddress as `0x${string}`,
          lockAddress: lockAddress as `0x${string}`,
          keyManagers: getKeyManagersForContext(
            process.env.LOCK_MANAGER_ADDRESS as `0x${string}`,
            'milestone' // Admin-managed like milestone keys
          ),
        });

        if (!keyResult.success) {
          await this.recordError(enrollmentId, 'key_grant', keyResult.error);
          throw new Error(`Key grant failed: ${keyResult.error}`);
        }

        txHash = keyResult.txHash;
      }

      // Attempt attestation (optional - failure doesn't block)
      let attestationUid: string | null = null;
      let attestationError: string | null = null;

      try {
        const attestResult = await this.createOrFindAttestation({
          enrollmentId,
          userAddress,
          cohortId,
          txHash,
        });
        attestationUid = attestResult.uid;
      } catch (attError) {
        log.warn('Attestation failed, will allow retry', {
          enrollmentId,
          error: attError
        });
        attestationError = 'Attestation failed - retry available';
      }

      // TX2: Commit final state
      await this.markCertificateIssued({
        enrollmentId,
        txHash,
        attestationUid,
        error: attestationError,
      });

      return {
        success: true,
        txHash,
        attestationUid,
        attestationPending: !attestationUid
      };

    } catch (error) {
      log.error('Certificate claim failed', { enrollmentId, error });
      throw error;
    } finally {
      // Always release lock
      await this.releaseClaimLock(enrollmentId);
    }
  }

  /**
   * Acquire claim lock with TTL check
   *
   * Respects in-progress flag only if updated within 5 minutes
   * Stale flags (>5 min) are automatically ignored
   */
  private async acquireClaimLock(enrollmentId: string) {
    const enrollment = await db
      .select()
      .from(bootcamp_enrollments)
      .where(eq(bootcamp_enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment.length) {
      throw new Error('Enrollment not found');
    }

    const enroll = enrollment[0];

    // Already issued
    if (enroll.certificate_issued) {
      return { alreadyIssued: true };
    }

    // Check if claim in progress (with TTL)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (enroll.certificate_claim_in_progress &&
        enroll.updated_at &&
        enroll.updated_at > fiveMinutesAgo) {
      return { inProgress: true };
    }

    // Acquire lock
    await db
      .update(bootcamp_enrollments)
      .set({ certificate_claim_in_progress: true })
      .where(eq(bootcamp_enrollments.id, enrollmentId));

    return { locked: true };
  }

  /**
   * Check if user already has key (idempotent recovery)
   *
   * Timeout: 5s to prevent slow RPC from blocking claims
   * On timeout: Log warning and proceed (Unlock will reject duplicates)
   */
  private async checkExistingKey(
    userAddress: string,
    lockAddress: string
  ): Promise<{ exists: boolean; txHash?: string } | null> {
    try {
      const hasKey = await Promise.race([
        UserKeyService.checkUserKeyOwnership(userAddress, lockAddress),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        ),
      ]);

      return hasKey ? { exists: true, txHash: '...' } : null;
    } catch (error) {
      log.warn('Key existence check failed, proceeding with grant attempt', {
        userAddress,
        lockAddress,
        error
      });
      // Let grant attempt proceed - Unlock will reject if duplicate
      return null;
    }
  }

  private async releaseClaimLock(enrollmentId: string) {
    await db
      .update(bootcamp_enrollments)
      .set({ certificate_claim_in_progress: false })
      .where(eq(bootcamp_enrollments.id, enrollmentId));
  }

  private async markCertificateIssued(params: {
    enrollmentId: string;
    txHash: string;
    attestationUid: string | null;
    error: string | null;
  }) {
    const { enrollmentId, txHash, attestationUid, error } = params;

    await db
      .update(bootcamp_enrollments)
      .set({
        certificate_issued: true,
        certificate_issued_at: new Date(),
        certificate_tx_hash: txHash,
        certificate_attestation_uid: attestationUid,
        certificate_last_error: error,
        certificate_last_error_at: error ? new Date() : null,
        certificate_claim_in_progress: false,
      })
      .where(eq(bootcamp_enrollments.id, enrollmentId));
  }

  private async recordError(
    enrollmentId: string,
    step: string,
    error: string
  ) {
    await db
      .update(bootcamp_enrollments)
      .set({
        certificate_last_error: `${step}: ${error}`,
        certificate_last_error_at: new Date(),
        certificate_retry_count: sql`certificate_retry_count + 1`,
      })
      .where(eq(bootcamp_enrollments.id, enrollmentId));
  }

  /**
   * Retry attestation with safety checks
   *
   * Steps:
   * 1. Check if attestation already exists (lost response case)
   * 2. Verify key still valid (not transferred/burned)
   * 3. Retry attestation creation
   */
  async retryAttestation(enrollmentId: string) {
    // 1. Check if attestation already exists
    const existing = await AttestationService.findByEnrollment(enrollmentId);
    if (existing) {
      await db
        .update(bootcamp_enrollments)
        .set({
          certificate_attestation_uid: existing.uid,
          certificate_last_error: null,
          certificate_last_error_at: null,
        })
        .where(eq(bootcamp_enrollments.id, enrollmentId));

      return { success: true, found: true, uid: existing.uid };
    }

    // 2. Verify key still valid
    const enrollment = await db
      .select()
      .from(bootcamp_enrollments)
      .where(eq(bootcamp_enrollments.id, enrollmentId))
      .limit(1);

    if (!enrollment.length || !enrollment[0].certificate_tx_hash) {
      throw new Error('No certificate key found');
    }

    // Would need user wallet address here - fetch from enrollment
    const keyValid = await UserKeyService.checkUserKeyOwnership(
      enrollment[0].user_wallet_address,
      enrollment[0].lock_address
    );

    if (!keyValid) {
      throw new Error('Key no longer exists - cannot attest');
    }

    // 3. Retry attestation
    const result = await AttestationService.attest({
      schemaUid: process.env.BOOTCAMP_COMPLETION_SCHEMA_UID!,
      recipient: enrollment[0].user_wallet_address,
      data: {
        cohortId: enrollment[0].cohort_id,
        // ... other attestation data
      },
    });

    await db
      .update(bootcamp_enrollments)
      .set({
        certificate_attestation_uid: result.uid,
        certificate_last_error: null,
        certificate_last_error_at: null,
        certificate_retry_count: sql`certificate_retry_count + 1`,
      })
      .where(eq(bootcamp_enrollments.id, enrollmentId));

    return { success: true, uid: result.uid };
  }

  private async createOrFindAttestation(params: {
    enrollmentId: string;
    userAddress: string;
    cohortId: string;
    txHash: string;
  }) {
    // Implementation to create attestation or find existing
    // Returns { uid: string }
    throw new Error('Not implemented');
  }
}
```

**File**: `lib/bootcamp-completion/certificate/types.ts`

```typescript
export interface CertificateClaimParams {
  enrollmentId: string;
  userId: string;
  userAddress: string;
  cohortId: string;
  lockAddress: string;
}

export interface CertificateClaimResult {
  success: boolean;
  txHash?: string;
  attestationUid?: string | null;
  attestationPending?: boolean;
  alreadyIssued?: boolean;
  error?: string;
}

export interface AttestationRetryResult {
  success: boolean;
  uid?: string;
  found?: boolean;
  error?: string;
}
```

---

## Phase 4: API Endpoints

### Feature Flag Gate

All certificate endpoints check:

```typescript
// In every endpoint
if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== 'true') {
  return res.status(403).json({
    error: 'Certificate feature not enabled'
  });
}
```

### 4.1 User Certificate Claim

**File**: `pages/api/bootcamp/certificate/claim.ts`

**Endpoint**: `POST /api/bootcamp/certificate/claim`

**Authentication**: Privy JWT (via `getPrivyUser`)

**Request Body**:
```typescript
{
  cohortId: string
}
```

**Implementation**:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { getPrivyUser } from '@/lib/auth/privy';
import { CertificateService } from '@/lib/bootcamp-completion/certificate/service';
import { getLogger } from '@/lib/utils/logger';
import { revalidateTag } from 'next/cache';

const log = getLogger('api:certificate-claim');

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Feature flag check
  if (process.env.BOOTCAMP_CERTIFICATES_ENABLED !== 'true') {
    return res.status(403).json({ error: 'Certificate feature not enabled' });
  }

  try {
    // Authenticate user
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { cohortId } = req.body;

    if (!cohortId) {
      return res.status(400).json({ error: 'cohortId required' });
    }

    // Fetch enrollment
    const enrollment = await db
      .select()
      .from(bootcamp_enrollments)
      .innerJoin(user_profiles, eq(bootcamp_enrollments.user_profile_id, user_profiles.id))
      .innerJoin(cohorts, eq(bootcamp_enrollments.cohort_id, cohorts.id))
      .innerJoin(bootcamp_programs, eq(cohorts.bootcamp_program_id, bootcamp_programs.id))
      .where(
        and(
          eq(user_profiles.privy_user_id, user.id),
          eq(bootcamp_enrollments.cohort_id, cohortId)
        )
      )
      .limit(1);

    if (!enrollment.length) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enroll = enrollment[0].bootcamp_enrollments;
    const program = enrollment[0].bootcamp_programs;
    const profile = enrollment[0].user_profiles;

    // Check enrollment completed
    if (enroll.enrollment_status !== 'completed') {
      return res.status(403).json({ error: 'Not eligible for certificate' });
    }

    // Check lock address configured
    if (!program.lock_address) {
      return res.status(400).json({
        error: 'Certificate not configured yet - please try again later or contact support'
      });
    }

    // Claim certificate
    const service = new CertificateService();
    const result = await service.claimCertificate({
      enrollmentId: enroll.id,
      userId: profile.id,
      userAddress: profile.wallet_address!,
      cohortId,
      lockAddress: program.lock_address,
    });

    if (result.success) {
      log.info('Certificate claimed successfully', {
        enrollmentId: enroll.id,
        txHash: result.txHash,
        attestationUid: result.attestationUid,
      });

      // Invalidate cache
      revalidateTag(`user:cohort:completion:${cohortId}`);
      revalidateTag(`user:enrollment:${enroll.id}`);
    }

    return res.status(200).json(result);

  } catch (error) {
    log.error('Certificate claim failed', { error });
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
```

**Response** (Success):
```json
{
  "success": true,
  "txHash": "0x...",
  "attestationUid": "0x..." | null,
  "attestationPending": boolean
}
```

**Error Responses**:
| Status | Error |
|--------|-------|
| 400 | "Certificate not configured yet - contact support" (lock_address missing) |
| 401 | "Unauthorized" (no Privy JWT) |
| 403 | "Not eligible for certificate" (enrollment not completed) |
| 403 | "Certificate feature not enabled" (feature flag off) |
| 404 | "Enrollment not found" |
| 409 | "Claim already in progress" |
| 500 | "Key grant failed: <reason>" or "Internal server error" |

### 4.2 User Attestation Retry

**File**: `pages/api/bootcamp/certificate/retry-attestation.ts`

**Endpoint**: `POST /api/bootcamp/certificate/retry-attestation`

**Request Body**:
```typescript
{
  cohortId: string
}
```

**Response**:
```json
{
  "success": true,
  "attestationUid": "0x...",
  "found": boolean  // true if already existed
}
```

### 4.3 User Completion Status

**File**: `app/api/user/bootcamp/[cohortId]/completion-status/route.ts`

**Endpoint**: `GET /app/api/user/bootcamp/[cohortId]/completion-status`

**Purpose**: App Route for cache tag support

**Response**:
```json
{
  "isCompleted": boolean,
  "completionDate": "ISO8601" | null,
  "certificate": {
    "issued": boolean,
    "issuedAt": "ISO8601" | null,
    "txHash": "0x..." | null,
    "attestationUid": "0x..." | null,
    "lastError": "string" | null,
    "canRetryAttestation": boolean
  },
  "lockAddress": "0x..." | null
}
```

**Cache Tags**:
- `user:cohort:completion:${cohortId}`
- `user:enrollment:${enrollmentId}`

### 4.4 Admin Reconciliation Endpoints

**File**: `app/api/admin/bootcamp-completion/route.ts`

**Auth Guard**: All methods call `ensureAdminOrRespond` at the top

**Logging**: Use `getLogger('api:bootcamp-completion')`

#### Grant Key Directly

**Endpoint**: `POST /api/admin/bootcamp-completion/grant-key`

**Request Body**:
```json
{
  "enrollmentId": "uuid"
}
```

**Logic**:
1. Call `ensureAdminOrRespond`
2. Verify `enrollment_status = 'completed'`
3. Verify `certificate_issued = false`
4. Grant key via `UserKeyService`
5. Update DB with `tx_hash`, `issued_at`
6. Revalidate cache tags

#### Fix Stuck Status

**Endpoint**: `POST /api/admin/bootcamp-completion/fix-status`

**Request Body**:
```json
{
  "enrollmentId": "uuid"
}
```

**Logic**: Calls `fix_completion_status()` DB function

**Response**:
```json
{
  "success": boolean,
  "message": "Status fixed successfully" | "Not eligible for completion",
  "previous_status": "active" | "completed",
  "new_status": "completed",
  "milestones_completed": number,
  "total_milestones": number,
  "reason": "string" (if failed)
}
```

#### Retry Attestation

**Endpoint**: `POST /api/admin/bootcamp-completion/retry-attestation`

**Request Body**:
```json
{
  "enrollmentId": "uuid"
}
```

**Logic**: Same as user retry + revalidates tags

#### Bulk Fix Statuses

**Endpoint**: `POST /api/admin/cohorts/[cohortId]/fix-statuses`

**Request Body**: `{}` (operates on all eligible in cohort)

**Logic**:
- Query up to 500 enrollments where:
  - All milestones complete
  - `enrollment_status != 'completed'`
- Call `fix_completion_status()` per enrollment (check eligibility atomically)
- Collect results

**Response**:
```json
{
  "fixed": [
    { "enrollmentId": "uuid", "userId": "uuid", "previousStatus": "active" }
  ],
  "skipped": [
    { "enrollmentId": "uuid", "reason": "Not all milestones complete" }
  ],
  "total": 500
}
```

**Timeout Risk**: Processing time 50-75s for 500 enrollments. If timeout occurs, admin can retry (idempotent operations).

**Cache Invalidation**:
```typescript
// After bulk operation
revalidateTag(`admin:cohort:${cohortId}`);
// Per-enrollment tags revalidated in loop
for (const result of fixed) {
  revalidateTag(`user:enrollment:${result.enrollmentId}`);
}
```

#### Force Clear Claim Lock

**Endpoint**: `POST /api/admin/bootcamp-completion/force-unlock`

**Request Body**:
```json
{
  "enrollmentId": "uuid"
}
```

**Logic**: Calls `force_clear_claim_lock()` DB function

**Use Case**: Admin intervention when claim stuck >10 minutes

### 4.5 Milestone Addition Constraint

**File**: `app/api/admin/milestones/route.ts` (modify existing)

**Before creating milestone**:

```typescript
// Check if any certificates issued for this bootcamp
const cohort = await db
  .select()
  .from(cohorts)
  .where(eq(cohorts.id, cohortId))
  .limit(1);

if (!cohort.length) {
  return res.status(404).json({ error: 'Cohort not found' });
}

const bootcampId = cohort[0].bootcamp_program_id;

const existingCerts = await db
  .select()
  .from(bootcamp_enrollments)
  .innerJoin(cohorts, eq(bootcamp_enrollments.cohort_id, cohorts.id))
  .where(
    and(
      eq(cohorts.bootcamp_program_id, bootcampId),
      eq(bootcamp_enrollments.certificate_issued, true)
    )
  )
  .limit(1);

if (existingCerts.length > 0) {
  return res.status(400).json({
    error: 'Cannot add milestones - certificates already issued for this bootcamp',
    bootcampId,
  });
}

// Proceed with milestone creation...
```

**Rationale**: Prevents retroactive changes that would invalidate issued certificates

---

## Phase 5: React Hooks

### 5.1 Completion Status Hook

**File**: `hooks/bootcamp-completion/useBootcampCompletionStatus.ts`

```typescript
import { useApiCall } from '@/hooks/useApiCall';

interface CompletionStatus {
  isCompleted: boolean;
  completionDate: string | null;
  certificate: {
    issued: boolean;
    issuedAt: string | null;
    txHash: string | null;
    attestationUid: string | null;
    lastError: string | null;
    canRetryAttestation: boolean;
  };
  lockAddress: string | null;
}

export function useBootcampCompletionStatus(cohortId: string) {
  return useApiCall<CompletionStatus>({
    url: `/api/user/bootcamp/${cohortId}/completion-status`,
    method: 'GET',
  });
}
```

### 5.2 Certificate Claim Hook

**File**: `hooks/bootcamp-completion/useCertificateClaim.ts`

```typescript
import { useState } from 'react';
import { toast } from 'sonner';
import axios from 'axios';

export function useCertificateClaim(cohortId: string) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimData, setClaimData] = useState<{
    txHash?: string;
    attestationUid?: string;
    attestationPending?: boolean;
  } | null>(null);

  const claimCertificate = async () => {
    setIsClaiming(true);
    setClaimError(null);

    try {
      const response = await axios.post('/api/bootcamp/certificate/claim', {
        cohortId,
      });

      if (response.data.success) {
        setHasClaimed(true);
        setClaimData(response.data);

        if (response.data.attestationPending) {
          toast.success('Certificate claimed! Attestation pending - retry available.');
        } else {
          toast.success('Certificate claimed successfully!');
        }
      } else {
        throw new Error(response.data.error || 'Claim failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to claim certificate';
      setClaimError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsClaiming(false);
    }
  };

  const retryAttestation = async () => {
    try {
      const response = await axios.post('/api/bootcamp/certificate/retry-attestation', {
        cohortId,
      });

      if (response.data.success) {
        setClaimData((prev) => ({
          ...prev,
          attestationUid: response.data.attestationUid,
          attestationPending: false,
        }));
        toast.success('Attestation created successfully!');
      }
    } catch (error) {
      toast.error('Failed to retry attestation');
    }
  };

  return {
    isClaiming,
    hasClaimed,
    claimError,
    claimData,
    claimCertificate,
    retryAttestation,
  };
}
```

**File**: `hooks/bootcamp-completion/index.ts`

```typescript
export * from './useBootcampCompletionStatus';
export * from './useCertificateClaim';
```

---

## Phase 6: UI Components

### 6.1 Certificate Claim Button

**File**: `components/bootcamp-completion/CertificateClaimButton.tsx`

```typescript
import { Button } from '@/components/ui/button';
import { useCertificateClaim } from '@/hooks/bootcamp-completion';

interface CertificateClaimButtonProps {
  cohortId: string;
  bootcampName: string;
  lockAddress: string | null;
  isCompleted: boolean;
  alreadyClaimed: boolean;
  onClaimed?: () => void;
}

export function CertificateClaimButton({
  cohortId,
  bootcampName,
  lockAddress,
  isCompleted,
  alreadyClaimed,
  onClaimed,
}: CertificateClaimButtonProps) {
  const { isClaiming, hasClaimed, claimCertificate, claimData } = useCertificateClaim(cohortId);

  if (!isCompleted) {
    return (
      <Button disabled>
        Complete all milestones to claim certificate
      </Button>
    );
  }

  if (!lockAddress) {
    return (
      <Button disabled>
        Certificate not configured yet
      </Button>
    );
  }

  if (alreadyClaimed || hasClaimed) {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled variant="success">
          Certificate Claimed ✓
        </Button>
        {claimData?.attestationPending && (
          <Button
            variant="outline"
            onClick={() => claimCertificate()}
          >
            Retry Attestation
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button
      onClick={async () => {
        await claimCertificate();
        onClaimed?.();
      }}
      disabled={isClaiming}
    >
      {isClaiming ? 'Claiming...' : `Claim ${bootcampName} Certificate`}
    </Button>
  );
}
```

### 6.2 Completion Badge

**File**: `components/bootcamp-completion/CompletionBadge.tsx`

```typescript
import { formatDate } from '@/lib/utils/dateUtils';
import { Badge } from '@/components/ui/badge';

interface CompletionBadgeProps {
  isCompleted: boolean;
  completionDate: string | null;
  certificateIssued: boolean;
}

export function CompletionBadge({
  isCompleted,
  completionDate,
  certificateIssued,
}: CompletionBadgeProps) {
  if (!isCompleted) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="success">
        Completed {completionDate && `on ${formatDate(completionDate)}`}
      </Badge>
      {certificateIssued && (
        <Badge variant="info">
          Certificate Claimed
        </Badge>
      )}
    </div>
  );
}
```

### 6.3 Admin Reconciliation Panel

**File**: `components/admin/bootcamp-completion/ReconciliationPanel.tsx`

```typescript
import { useState } from 'react';
import { useAdminApi } from '@/hooks/useAdminApi';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface ReconciliationPanelProps {
  cohortId: string;
}

export function ReconciliationPanel({ cohortId }: ReconciliationPanelProps) {
  const { post } = useAdminApi();
  const [isFixing, setIsFixing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const fixStuckStatuses = async () => {
    setIsFixing(true);
    try {
      const response = await post(`/api/admin/cohorts/${cohortId}/fix-statuses`, {});
      setResults(response.data);
      toast.success(`Fixed ${response.data.fixed.length} enrollments`);
    } catch (error) {
      toast.error('Failed to fix statuses');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Completion Reconciliation</h3>

      <Button
        onClick={fixStuckStatuses}
        disabled={isFixing}
      >
        {isFixing ? 'Fixing...' : 'Fix Stuck Completion Statuses'}
      </Button>

      {results && (
        <div className="mt-4">
          <p className="text-green-600">Fixed: {results.fixed.length}</p>
          <p className="text-yellow-600">Skipped: {results.skipped.length}</p>
        </div>
      )}
    </Card>
  );
}
```

**File**: `components/bootcamp-completion/index.ts`

```typescript
export * from './CertificateClaimButton';
export * from './CompletionBadge';
```

---

## Operational Resilience

### Claim Lock Management

**TTL Pattern**:
- Flag `certificate_claim_in_progress` respected only if `updated_at > now() - 5 minutes`
- Stale flags (>5 min) automatically ignored by claim logic (inline check)
- No separate cleanup job needed

**Admin Force-Unlock**:
```sql
-- Available via admin API endpoint
SELECT force_clear_claim_lock('enrollment-uuid');
```

**User Messaging**:
- If in progress (fresh flag): "Certificate claim already in progress. If stuck for >5 minutes, try again."
- If stale flag: Proceed with claim (user doesn't see the stale flag)

### Lock Address Validation

**Admin UI** (when setting `bootcamp_programs.lock_address`):
- Validate address format: `/^0x[a-fA-F0-9]{40}$/`
- Test checklist: Admin should test-claim in staging before production
- No on-chain validation for MVP (defer if wrong addresses become pattern)

**Claim API Behavior**:
- `lock_address IS NULL` → 400: "Certificate not configured yet - contact support"
- Grant failures → 500: "Unable to verify certificate status. You may already have this certificate. Check wallet before retrying."

### Error Messages (User-Facing)

| Scenario | Message |
|----------|---------|
| Lock missing | "Certificate not configured yet - please try again later or contact support." |
| Timeout on key check | "Unable to verify certificate status. You may already have this certificate. Please check your wallet before retrying." |
| Concurrent claim | "Certificate claim already in progress. If stuck for more than 5 minutes, try again." |
| Attestation failure | "Certificate issued successfully. Attestation pending - retry available on your dashboard." |
| Feature disabled | "Certificate feature not enabled." |
| Not completed | "Complete all milestones to claim certificate." |

### Monitoring

**Structured Logging**:
```typescript
// All claim attempts logged via getLogger
log.info('certificate_claim_started', { enrollmentId, userId, cohortId });
log.error('certificate_claim_failed', {
  enrollmentId,
  userId,
  step: 'key_grant' | 'attestation',
  error
});
log.info('certificate_claim_success', {
  enrollmentId,
  txHash,
  attestationUid
});
```

**Weekly Review Process**:
1. Query logs for failure patterns
2. Check stuck flags:
   ```sql
   SELECT id, cohort_id, user_profile_id, updated_at
   FROM bootcamp_enrollments
   WHERE certificate_claim_in_progress = TRUE
     AND updated_at < now() - interval '10 minutes'
   ORDER BY updated_at DESC;
   ```
3. Review failed certificate attempts:
   ```sql
   SELECT id, cohort_id, certificate_last_error, certificate_retry_count
   FROM bootcamp_enrollments
   WHERE certificate_issued = FALSE
     AND certificate_last_error IS NOT NULL
   ORDER BY certificate_last_error_at DESC
   LIMIT 50;
   ```

**Performance Threshold**:
- **Trigger execution**: Monitor via Supabase query insights
- **Alert threshold**: p95 > 500ms OR DB CPU > 10% during completion spikes
- **Action items**:
  - Consider cached cohort milestone counts (denormalized)
  - Consider async queue for completion checks (notify + background job)

**No Real-Time Monitoring for MVP**:
- No "moving counter" or automated failure rate tracking
- No external monitoring service integration required
- Add alerting infrastructure later if failure patterns emerge

### Rollback Procedure

**Disable Feature** (instant):
```bash
# Set environment variable
BOOTCAMP_CERTIFICATES_ENABLED=false

# Redeploy or restart services
```

**Remove Trigger** (if needed):
```sql
-- Safe to run - does not affect existing data
DROP TRIGGER IF EXISTS trg_check_bootcamp_completion
  ON public.user_milestone_progress;

DROP FUNCTION IF EXISTS public.check_bootcamp_completion();
```

**Safe Rollback Characteristics**:
- Leave added columns in place (safe, just unused)
- Completion status data remains intact (non-breaking for other features)
- Users cannot claim certificates (buttons hidden by feature flag)
- No data loss or corruption

**Re-enable Process**:
1. Fix issue in code
2. Redeploy application
3. Set `BOOTCAMP_CERTIFICATES_ENABLED=true`
4. If trigger was dropped: Re-run migration 079 to restore trigger
5. Verify with test claim in staging

---

## Testing Strategy

### Unit Tests

**Trigger Logic**:
- ✅ All milestones complete → `enrollment_status` updates to 'completed'
- ✅ Partial completion → no status change
- ✅ Concurrent trigger executions → idempotent (WHERE clause prevents double-update)
- ✅ User completes milestone for different cohort → doesn't affect other enrollments

**Claim Service**:
- ✅ Happy path: complete → claim → key granted → attestation created
- ✅ Key failure: grant fails → error recorded → user sees actionable message
- ✅ Attestation failure: key granted → attestation fails → `certificate_issued=true`, retry available
- ✅ Idempotent recovery: key exists → reconcile DB → proceed to attestation

**Lock TTL**:
- ✅ Flag set 3 minutes ago → claim blocked with "in progress" message
- ✅ Flag set 6 minutes ago → claim proceeds (flag ignored as stale)

### Integration Tests

**Concurrent Claims** (Critical):
```typescript
// Simulate double-click or parallel requests
await Promise.all([
  claimCertificate({ enrollmentId }),
  claimCertificate({ enrollmentId }),
]);

// Expected outcomes:
// - One request succeeds with certificate issued
// - Other request returns "already issued" or "in progress"
// - Verify: Only one key granted on-chain
// - Verify: Database in consistent state
```

**Admin Reconciliation**:
- ✅ Fix status → eligibility check → status updated → cache tags revalidated
- ✅ Retry attestation → existing attestation found → DB reconciled → no duplicate attestation
- ✅ Bulk fix → 100 enrollments → results returned → per-enrollment tags revalidated

**Attestation Retry Flow**:
- ✅ User claim → attestation fails → user sees retry button on dashboard
- ✅ Admin retries via admin panel → success → user's UI updates (cache invalidated)
- ✅ User retries → attestation already exists → DB updated → user sees success

### Mocks

**Blockchain/RPC**:
- Mock `UserKeyService.grantKeyToUser` responses (success, failure, timeout)
- Mock `AttestationService.attest` responses (success, failure)
- Mock `checkUserKeyOwnership` with timeout scenario (>5s)

**Database**:
- Use test database instance or transaction rollback pattern
- Seed test data: enrollments, cohorts, milestones, user progress records
- Verify database state after operations (idempotency checks)

### Edge Cases

**Trigger Race Conditions**:
- Two milestones marked complete simultaneously by different admins
- Both triggers fire for same user/cohort
- Verify: Only one UPDATE succeeds (WHERE clause ensures idempotency)
- Verify: Database remains consistent (no double-completion activities logged)

**Key Grant Partial Failure**:
- Scenario: Key granted on-chain → DB write fails (network issue)
- User retries claim
- Verify: Existing key detected → DB reconciled → attestation proceeds
- Verify: No duplicate key on-chain

**Attestation Schema Not Deployed**:
- Claim certificate without schema deployed
- Attestation fails (schema UID invalid)
- Verify: Key issued successfully
- Verify: Error recorded with clear message
- Verify: Retry button available to user

**Lock Address Missing**:
- User tries to claim when `lock_address` is NULL
- Verify: Clear error message: "Certificate not configured yet"
- Verify: No attempt to call blockchain services

### Performance

**Trigger Execution Time**:
- Measure p95 latency under load (100 concurrent milestone completions)
- Baseline: <200ms acceptable for MVP
- Alert threshold: >500ms indicates need for optimization
- Load test: Simulate cohort of 1000 users all completing final milestone within 1 hour

**Bulk Operations**:
- Test bulk fix with 500 enrollments
- Measure processing time (target <60s to avoid HTTP timeout)
- Verify idempotency: safe to retry on timeout
- Test error handling: Mix of eligible and ineligible enrollments

**Cache Invalidation**:
- Verify revalidation happens after admin operations
- Test: Admin fixes status → User refreshes page → Sees updated state
- Measure: Time from admin action to user seeing update

---

## Pre-Deployment Checklist

### 1. Attestation Schema
- [ ] Deploy `BOOTCAMP_COMPLETION_SCHEMA_V2` to EAS using `npm run deploy:attestation-schema`
- [ ] Capture and verify schema UID from deployment output
- [ ] Set `BOOTCAMP_COMPLETION_SCHEMA_UID` in environment (staging + production)
- [ ] Register schema in `lib/attestation/schemas/registry.ts`
- [ ] Verify schema visible in EAS explorer

### 2. Pre-Flight Gate
- [ ] Create `scripts/preflight-certificates.ts` with certificate count check
- [ ] Test script locally: `npm run preflight:certificates`
- [ ] Add to CI/CD pipeline before deployment step
- [ ] Verify script fails build if certificates found
- [ ] Document bypass procedure for authorized migrations

### 3. Database Migration
- [ ] Run migration 079 in staging environment
- [ ] Verify columns added successfully (check schema)
- [ ] Test trigger fires on milestone completion (complete test milestone)
- [ ] Verify trigger idempotency (mark same milestone complete twice)
- [ ] Generate updated TypeScript types: `npm run db:types`
- [ ] Commit generated types to repository

### 4. Lock Address Configuration
- [ ] Audit all active `bootcamp_programs` have `lock_address` set
   ```sql
   SELECT id, name, lock_address
   FROM bootcamp_programs
   WHERE lock_address IS NULL;
   ```
- [ ] Validate format for all lock addresses: `/^0x[a-fA-F0-9]{40}$/`
- [ ] Test claim flow with at least one bootcamp in staging
- [ ] Verify NFT minting works for configured lock

### 5. Feature Flag
- [ ] Set `BOOTCAMP_CERTIFICATES_ENABLED=false` initially in production
- [ ] Deploy code with flag disabled
- [ ] Test in staging with flag enabled
- [ ] Create runbook for enabling flag in production
- [ ] Document flag location in environment configuration

### 6. Monitoring Setup
- [ ] Verify structured logging configured (`LOG_LEVEL`, `NEXT_PUBLIC_LOG_LEVEL`)
- [ ] Test log output for claim attempts (success and failure)
- [ ] Document admin queries for:
   - Stuck flags (>10 minutes)
   - Failed certificate attempts
   - Completion rate per cohort
- [ ] Set up Supabase query insights for trigger performance
- [ ] Create weekly review checklist for ops team

### 7. Testing
- [ ] Run full integration test suite
- [ ] Manual test: Complete bootcamp → claim certificate → verify NFT in wallet
- [ ] Test error paths:
   - Missing lock address
   - Attestation failure → retry
   - Concurrent claim attempts
- [ ] Admin panel testing:
   - Fix stuck status
   - Grant key directly
   - Bulk fix operations
   - Force-unlock claim
- [ ] Load test trigger with 100+ concurrent completions

### 8. Documentation
- [ ] Update API documentation with new endpoints and schemas
- [ ] Document admin reconciliation procedures in wiki/runbook
- [ ] Create troubleshooting guide:
   - "Certificate not configured" → Check lock_address
   - "Claim stuck" → Admin force-unlock procedure
   - "Attestation failed" → Retry procedure
- [ ] Update user-facing docs (how to claim certificates, what to do if fails)
- [ ] Add deployment notes to release documentation

### 9. Rollback Plan
- [ ] Document rollback procedure (set feature flag false)
- [ ] Test rollback in staging (enable → disable → verify state)
- [ ] Document trigger removal SQL (if needed)
- [ ] Verify rollback doesn't corrupt data
- [ ] Define criteria for rollback decision

### 10. Post-Deployment Verification
- [ ] Enable `BOOTCAMP_CERTIFICATES_ENABLED=true` in production
- [ ] Monitor logs for first 10 certificate claims
- [ ] Verify attestations appearing in EAS explorer
- [ ] Check stuck flags query returns empty (no immediate issues)
- [ ] Test one claim from staging wallet
- [ ] Monitor trigger performance in Supabase insights

---

## File Structure

### New Files (Backend)

```
supabase/
  migrations/
    079_bootcamp_completion_system.sql

lib/
  bootcamp-completion/
    certificate/
      service.ts
      types.ts
    index.ts

scripts/
  deploy-bootcamp-attestation-schema.ts
  preflight-certificates.ts

lib/attestation/schemas/
  definitions.ts (updated with V2 schema)
```

### New Files (API)

```
pages/api/
  bootcamp/
    certificate/
      claim.ts
      retry-attestation.ts

app/api/
  user/
    bootcamp/
      [cohortId]/
        completion-status/
          route.ts
  admin/
    bootcamp-completion/
      route.ts  # grant-key, fix-status, retry-attestation, force-unlock
    cohorts/
      [cohortId]/
        fix-statuses/
          route.ts
```

### New Files (Frontend)

```
hooks/
  bootcamp-completion/
    useBootcampCompletionStatus.ts
    useCertificateClaim.ts
    index.ts

components/
  bootcamp-completion/
    CertificateClaimButton.tsx
    CompletionBadge.tsx
    index.ts
  admin/
    bootcamp-completion/
      ReconciliationPanel.tsx
```

### Modified Files

```
app/api/admin/milestones/route.ts
  - Add certificate-issued constraint before milestone creation

pages/lobby/bootcamps/[cohortId].tsx
  - Add completion status section
  - Show CertificateClaimButton when eligible
  - Show CompletionBadge when completed

pages/admin/cohorts/[cohortId]/applications.tsx
  - Add "Completion" tab/section
  - Integrate ReconciliationPanel component
  - Show eligible vs claimed vs failed certificate counts

lib/attestation/schemas/registry.ts
  - Register BOOTCAMP_COMPLETION_SCHEMA_V2

.env.example
  - Add BOOTCAMP_CERTIFICATES_ENABLED
  - Add BOOTCAMP_COMPLETION_SCHEMA_UID

package.json
  - Add scripts for schema deployment and preflight checks
```

---

## Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Completion Timing** | Immediate (no end_date wait) | Milestones already enforce pacing via due dates + prerequisites |
| **Certificate Scope** | Bootcamp-level (shared lock across cohorts) | Simplifies lock management; cohort tracked in attestation metadata |
| **Attestation** | Optional enrichment | Failure doesn't block certificate issuance; provides retry path |
| **Locking Pattern** | Two-transaction with TTL flag | Avoids long DB locks during blockchain calls (10-30s) |
| **Bulk Limit** | 500 enrollments | Balances UX and HTTP timeout risk (50-75s processing) |
| **Attestation Migration** | Block deployment if certs exist | Clean cutover for MVP; no dual-schema complexity |
| **Feature Flag** | BOOTCAMP_CERTIFICATES_ENABLED | Safe rollout with instant disable capability |
| **Monitoring** | Structured logs + weekly review | Avoids premature infrastructure; add alerting later if needed |
| **Cleanup Job** | None (TTL check inline) | Sufficient without extra infrastructure |
| **Lock Validation** | Format check only | On-chain validation deferred to post-MVP |
| **Table Reference** | cohort_milestones | Verified in migrations 004/055/056 |
| **Key Management** | Admin-managed (like milestones) | Certificates are credentials, non-transferable |

---

## Implementation Notes

### Critical Path

1. **Database** → 2. **Attestation Schema** → 3. **Backend Services** → 4. **API Endpoints** → 5. **Frontend**

### Dependencies

- Attestation schema must be deployed before any claims
- Migration 079 must run before feature flag enabled
- Lock addresses must be configured per bootcamp
- Pre-flight check must pass in CI/CD

### Verification Points

After each phase, verify:
1. Database: Trigger fires correctly on milestone completion
2. Schema: Visible in EAS explorer, correct schema definition
3. Services: Unit tests pass for claim flow and idempotency
4. APIs: Integration tests pass for concurrent claims
5. Frontend: Manual test claim flow in staging

### Risk Mitigation

- Feature flag allows instant disable
- Rollback procedure documented and tested
- Idempotent operations prevent data corruption
- TTL pattern prevents permanent stuck states
- Detailed error messages aid troubleshooting

---

## Post-MVP Enhancements (Future Consideration)

### Performance Optimizations

- Cache cohort milestone counts (denormalized column)
- Async completion queue (notify + background worker)
- Batch attestation creation for multiple certificates

### Feature Additions

- Certificate revocation mechanism (with remarks)
- Certificate transfer/upgrade paths
- Analytics dashboard (completion rates, time-to-certificate)
- Automated completion notifications (email/on-chain)

### Infrastructure

- Real-time monitoring with alerting (Datadog, Sentry)
- Automated failure recovery (scheduled reconciliation job)
- Background job for bulk operations (>500 enrollments)

### User Experience

- Certificate showcase page (public profile)
- Social sharing integration (Twitter, LinkedIn)
- Certificate verification API (third-party verification)
- Mobile-optimized claim flow

---

**Document Version**: 2.0
**Last Updated**: 2025-10-13
**Status**: Implementation Ready
