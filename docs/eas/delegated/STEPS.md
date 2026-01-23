Implementation Order (Phased Rollout with Review Gates)
Phase 1: Foundation (Reusable Components + Tests)
Goal: Build and test all reusable components BEFORE any action integration
Risk: None - no existing functionality modified
Review Gate: User reviews foundation code and tests before proceeding to any integration

Step 1.1: Type Definitions
File: /lib/attestation/api/types.ts

Create DelegatedAttestationSignature interface
Create SchemaFieldData interface
Create WithAttestationSignature interface
Validation: Types compile without errors
Step 1.2: Generic Client Hook
File: /hooks/attestation/useGaslessAttestation.ts

Copy pattern from /hooks/checkin/useDelegatedAttestationCheckin.ts
Remove "checkin" branding
Make schemaKey parameter-based (not hardcoded)
Keep all EAS SDK logic unchanged
Validation: Hook compiles without errors
Test File: /hooks/attestation/useGaslessAttestation.test.ts

Mock wallet/signer
Test successful signature generation
Test error handling (no wallet, invalid schema, etc.)
Test signature format normalization
Validation: All unit tests pass
Step 1.3: API Helper
File: /lib/attestation/api/helpers.ts

Copy pattern from /pages/api/checkin/index.ts (lines 115-210)
Extract into reusable handleGaslessAttestation() function
Generic schema key resolution
Graceful degradation support
Validation: Function compiles without errors
Test File: /lib/attestation/api/helpers.test.ts

Mock EAS enabled/disabled states
Test signature validation
Test graceful degradation behavior
Test schema UID resolution
Test successful attestation flow
Validation: All unit tests pass
Step 1.4: Schema Definitions
File: /lib/attestation/schemas/definitions.ts

Add 5 new schema definitions (keys only, no UIDs yet):
xp_renewal
dg_withdrawal
dg_config_change
milestone_task_reward_claim
quest_task_reward_claim
Validation: Schema definitions follow correct format
Step 1.5: Database Migration
File: /supabase/migrations/123_add_gasless_attestation_uids.sql

Add attestation UID columns to all relevant tables
Create indexes for efficient lookups
Apply migration to local database: supabase migration up --local
Validation: Migration applies cleanly, columns exist, no FK violations
Step 1.6: Foundation Review Gate
Deliverables for Review:

Generic hook with unit tests passing
API helper with unit tests passing
Type definitions
Schema definitions (not deployed)
Database migration applied locally
User Action: Review all foundation code, run tests, verify quality
Proceed Only When: User approves foundation and all tests pass

Phase 2: Schema Deployment
Goal: Deploy 5 new schemas + redeploy 3 updated existing schemas to EAS via admin UI
Risk: Low - schemas are immutable, updates get new UIDs
Prerequisites: Phase 1 approved

Step 2.1: Deploy New Schemas
For Each New Schema (via /admin/eas-schemas):

Navigate to admin UI
Deploy schema on-chain (admin wallet signs)
Schema UID automatically saved to database
Verify on EAS Scan
Test resolution: resolveSchemaUID(schemaKey, network) returns UID
New Schemas to Deploy:

xp_renewal
dg_withdrawal
dg_config_change
milestone_task_reward_claim
quest_task_reward_claim
Step 2.2: Redeploy Updated Existing Schemas
For Each Updated Schema:

Deploy NEW schema with updated field list (new UID generated)
Update database to point schema key to new UID
Old UID remains in database for historical attestations
New attestations use new UID with additional fields
Schemas to Redeploy:

milestone_achievement - Add lockAddress, keyTokenId, grantTxHash
quest_completion - Add lockAddress, keyTokenId, grantTxHash
bootcamp_completion - Add lockAddress, certificateTokenId, fix txHash type
IMPORTANT: Existing attestations with old UIDs remain valid. Database tracks both old and new UIDs for same schema key. New attestations use new schema with richer blockchain data.

Validation: All 8 schemas deployed/redeployed, UIDs saved in database, resolution works

Phase 3: Milestone Task Reward Claim Integration
Goal: First action integration - lowest risk (DB-only, no blockchain)
Risk: Very Low - DB transaction only, low volume
Prerequisites: Phases 1-2 complete
Files Modified:

/pages/api/user/task/[taskId]/claim.ts
Frontend hook/component that calls this API
Integration Steps:
API Integration (line ~125-140):
Add attestationSignature to request body type
Call handleGaslessAttestation() after XP award
Save UID to user_task_progress.reward_claim_attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Complete milestone task
Claim reward with attestation
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved
Test WITHOUT signature → claim succeeds, no UID
Check logs for errors
Verify no regression to existing functionality
Proceed Only When: Phase 3 validated and working

Phase 4: Quest Task Reward Claim Integration
Goal: Second action integration - similar to Phase 3
Risk: Very Low - DB transaction only, similar pattern
Prerequisites: Phase 3 complete and validated
Files Modified:

/pages/api/quests/claim-task-reward.ts
Frontend hook/component that calls this API
Integration Steps:
API Integration (line ~133-140):
Add attestationSignature to request body type
Call handleGaslessAttestation() after XP award
Save UID to user_task_completions.reward_claim_attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Complete quest task
Claim reward with attestation
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved
Test WITHOUT signature → claim succeeds, no UID
Check logs for errors
Verify Phase 3 still works (no regression)
Proceed Only When: Phase 4 validated and Phase 3 unaffected

Phase 5: DG Config Change Integration
Goal: Third action integration - admin only, very low volume
Risk: Low - Admin-only, low volume, clear audit trail
Prerequisites: Phase 4 complete and validated
Files Modified:

/app/api/admin/config/withdrawal-limits/route.ts
Admin UI component
Integration Steps:
API Integration (line ~150):
Add attestationSignature to request body type
Call handleGaslessAttestation() after config update
Save UID to config_audit_log.attestation_uid
Client Integration:
Add useGaslessAttestation() hook to admin UI
Sign attestation before API call
Pass signature in request body
E2E Test:
Change withdrawal limits as admin
Verify UID saved in config_audit_log
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved
Test WITHOUT signature → config update succeeds, no UID
Check logs for errors
Verify Phases 3-4 still work (no regression)
Proceed Only When: Phase 5 validated and Phases 3-4 unaffected

Phase 6: Milestone Key Claim Integration
Goal: Fourth action integration - on-chain key grant
Risk: Medium - On-chain transaction, moderate volume
Prerequisites: Phase 5 complete and validated
Files Modified:

/pages/api/milestones/claim.ts
Frontend hook/component that calls this API
Integration Steps:
API Integration (line ~126):
Add attestationSignature to request body type
Call handleGaslessAttestation() after key grant
Save UID to user_milestone_progress.key_claim_attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Complete all milestone tasks
Claim milestone key with attestation
Verify key granted on-chain
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved, key granted
Test WITHOUT signature → key granted, no UID
Check gas costs
Verify graceful degradation works
Verify Phases 3-5 still work (no regression)
Proceed Only When: Phase 6 validated and Phases 3-5 unaffected

Phase 7: Quest Key Claim Integration
Goal: Fifth action integration - on-chain key grant
Risk: Medium - On-chain transaction, moderate volume
Prerequisites: Phase 6 complete and validated
Files Modified:

/pages/api/quests/complete-quest.ts
/pages/api/quests/get-trial.ts (activation quests)
Frontend hook/component
Integration Steps:
API Integration (line ~138 in complete-quest, ~200 in get-trial):
Add attestationSignature to request body type
Call handleGaslessAttestation() after key grant
Save UID to user_quest_progress.key_claim_attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Complete all quest tasks
Claim quest key with attestation
Verify key granted on-chain
Verify UID saved in database
Verify UID on EAS Scan
Test activation quests (grants 2 keys)
Validation:
Test WITH signature → UID saved, key granted
Test WITHOUT signature → key granted, no UID
Check gas costs
Verify graceful degradation works
Verify Phases 3-6 still work (no regression)
Proceed Only When: Phase 7 validated and Phases 3-6 unaffected

Phase 8: XP Renewal Integration
Goal: Sixth action integration - transaction-based
Risk: Medium - Transaction flow, moderate volume
Prerequisites: Phase 7 complete and validated
Files Modified:

/pages/api/subscriptions/renew-with-xp.ts
Frontend renewal component
Integration Steps:
API Integration (line ~438):
Add attestationSignature to request body type
Call handleGaslessAttestation() after key extension
Save UID to subscription_renewal_attempts.attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Renew subscription with XP
Verify key extended
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved, renewal succeeds
Test WITHOUT signature → renewal succeeds, no UID
Check transaction flow
Verify graceful degradation works
Verify Phases 3-7 still work (no regression)
Proceed Only When: Phase 8 validated and Phases 3-7 unaffected

Phase 9: DG Withdrawal Integration
Goal: Seventh action integration - transaction-based
Risk: Medium - Token transfer, moderate volume
Prerequisites: Phase 8 complete and validated
Files Modified:

/app/api/token/withdraw/route.ts
Frontend withdrawal component
Integration Steps:
API Integration (line ~203):
Add attestationSignature to request body type
Call handleGaslessAttestation() after transfer
Save UID to dg_token_withdrawals.attestation_uid
Client Integration:
Add useGaslessAttestation() hook
Sign attestation before API call
Pass signature in request body
E2E Test:
Withdraw DG tokens
Verify transfer succeeds
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test WITH signature → UID saved, withdrawal succeeds
Test WITHOUT signature → withdrawal succeeds, no UID
Check transaction flow
Verify graceful degradation works
Verify Phases 3-8 still work (no regression)
Proceed Only When: Phase 9 validated and Phases 3-8 unaffected

Phase 10: Bootcamp Completion Migration
Goal: Eighth action integration - BREAKING CHANGE (migrate from direct to gasless)
Risk: High - Changes existing user flow, requires coordination
Prerequisites: Phase 9 complete and validated
Files Modified:

/pages/api/bootcamp/certificate/claim.ts
/hooks/bootcamp-completion/useCertificateClaim.ts Files Deleted:
/pages/api/bootcamp/certificate/commit-attestation.ts (no longer needed)
Integration Steps:
API Integration (line ~113):
Add attestationSignature to request body type
Call handleGaslessAttestation() after key grant
Save UID to bootcamp_enrollments.certificate_attestation_uid
Remove direct attestation code
Client Migration:
Replace AttestationService.createAttestation() with useGaslessAttestation()
Update user flow (no gas payment needed)
Update UI messaging
Backward Compatibility Test:
Verify old certificates still work
Verify new certificates use gasless flow
E2E Test:
Complete bootcamp
Claim certificate with gasless attestation
Verify key granted
Verify UID saved in database
Verify UID on EAS Scan
Validation:
Test gasless flow works
Check user doesn't pay gas
Verify certificate validity
Verify Phases 3-9 still work (no regression)
Cleanup:
Delete /pages/api/bootcamp/certificate/commit-attestation.ts
Update documentation
Proceed Only When: Phase 10 validated and Phases 3-9 unaffected

Phase 11: Final Validation & Monitoring
Goal: Comprehensive validation across all actions
Prerequisites: Phase 10 complete

Validation Steps:
Coverage Analysis:

-- Check attestation coverage for each action
SELECT 'milestone_task_rewards' as action, COUNT(*) as total,
       COUNT(reward_claim_attestation_uid) as attested
FROM user_task_progress WHERE created_at > NOW() - INTERVAL '7 days';

-- Repeat for all other actions...
E2E Smoke Tests:
Test one instance of each action end-to-end
Verify all UIDs on EAS Scan
Check graceful degradation for each action
Performance Check:
Monitor API response times
Check gas costs for on-chain attestations
Verify no bottlenecks
Documentation:
Document the pattern for future actions
Add troubleshooting guide
Update API documentation
Success Criteria: All 8 actions attesting successfully, no regressions, tests passing

Critical Isolation Guarantees
Each phase modifies DIFFERENT files and database columns:

Phase 3: user_task_progress.reward_claim_attestation_uid
Phase 4: user_task_completions.reward_claim_attestation_uid
Phase 5: config_audit_log.attestation_uid
Phase 6: user_milestone_progress.key_claim_attestation_uid
Phase 7: user_quest_progress.key_claim_attestation_uid
Phase 8: subscription_renewal_attempts.attestation_uid
Phase 9: dg_token_withdrawals.attestation_uid
Phase 10: bootcamp_enrollments.certificate_attestation_uid
Regression Prevention:

Each phase touches different API endpoints
Each phase uses different database columns
Each phase can be tested independently
Graceful degradation ensures main actions always work
Later phases cannot break earlier phases (no shared code modified after Phase 1)
IMPORTANT: Do NOT touch the check-in flow to avoid regression. Leave /hooks/checkin/useDelegatedAttestationCheckin.ts and /pages/api/checkin/index.ts unchanged. Only COPY patterns from them.

