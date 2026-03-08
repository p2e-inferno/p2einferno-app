Schema Deployment Process
For Each New Schema (via /admin/eas-schemas admin UI):

Add schema definition to /lib/attestation/schemas/definitions.ts with schema key
Navigate to /admin/eas-schemas in browser
Click "Deploy New Schema"
Fill in schema details from definition
Admin wallet signs deployment transaction
Schema UID automatically saved to attestation_schemas table with:
schema_uid (on-chain bytes32 UID)
schema_key (e.g., 'xp_renewal')
network (e.g., 'base-sepolia')
schema_definition (field types string)
Verify on EAS Scan (link shown in admin UI)
Test resolution: resolveSchemaUID('xp_renewal', 'base-sepolia') should return the UID
Test end-to-end attestation with the new schema
Existing Schemas:

✅ daily_checkin - Update schema to remove `userDid` and use `address` for walletAddress for consistency
Schemas Requiring Updates (redeploy with new fields):

⚠️ milestone_achievement - Add milestoneLockAddress, keyTokenId, grantTxHash
⚠️ quest_completion - Add questLockAddress, keyTokenId, grantTxHash
⚠️ bootcamp_completion - Add certificateLockAddress, certificateTokenId, fix certificateTxHash type
NOTE: EAS schemas are immutable once deployed. Updating means deploying a NEW schema with a NEW UID, then updating the database to point to the new UID for the same schema key.

New Schemas (need deployment):

❌ xp_renewal - Define → deploy via admin UI → auto-saved to DB
❌ dg_withdrawal - Define → deploy via admin UI → auto-saved to DB
❌ dg_config_change - Define → deploy via admin UI → auto-saved to DB
❌ milestone_task_reward_claim - Define → deploy via admin UI → auto-saved to DB
❌ quest_task_reward_claim - Define → deploy via admin UI → auto-saved to DB
No Environment Variables Needed:

All schema UIDs are database-driven
Runtime resolution via resolveSchemaUID(schemaKey, network)
Multi-chain support (different UIDs per network)
Admin UI manages deployment and DB persistence
Error Handling & Graceful Degradation
Pattern (from check-in API lines 115-210):

EAS enabled check: isEASEnabled()
Graceful degrade flag: CHECKIN_EAS_GRACEFUL_DEGRADE (per-schema flags possible)
If attestation fails + graceful degrade enabled: Log error, continue main action
If attestation fails + graceful degrade disabled: Block main action, return error
Logging:


log.info('Creating delegated attestation', { schemaKey, recipient });
log.info('Delegated attestation created', { uid, txHash });
log.error('Attestation failed', { error, gracefulDegrade: true });
Database:

Save null for attestation_uid if attestation fails with graceful degrade
Schema UIDs are resolved from attestation_schemas table (not env vars)
If resolveSchemaUID() returns null, schema not deployed for that network
Verification & Testing
Unit Tests
Test useGaslessAttestation() hook with mock wallet/signer
Test handleGaslessAttestation() helper with various scenarios:
EAS disabled → early return
No signature provided → early return
Signature validation failure → error
Successful attestation → UID returned
Failed attestation + graceful degrade → main action continues
Test schema encoding for each schema type
Integration Tests
Do NOT modify existing check-in tests (avoid regression)
Add NEW API tests for each new integration:
With attestation signature → success, UID saved
Without attestation signature → main action succeeds, no UID
With invalid signature → main action fails (if graceful degrade off)
Test backward compatibility for bootcamp completion
E2E Testing (Manual)
Milestone Task Reward Claim: Complete milestone task → claim XP reward → verify task reward attestation UID on EAS Scan
Milestone Key Claim: Complete all milestone tasks → claim milestone key → verify key claim attestation UID on EAS Scan
Quest Task Reward Claim: Complete quest task → claim XP reward → verify task reward attestation UID on EAS Scan
Quest Key Claim: Complete all quest tasks → claim quest key → verify key claim attestation UID on EAS Scan
XP Renewal: Renew subscription → verify attestation created
DG Withdrawal: Withdraw tokens → verify attestation created
DG Config: Change limits as admin → verify attestation created
Bootcamp: Complete bootcamp → claim certificate with gasless attestation
Verification Queries:


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
Critical Files Summary
New Files:

/hooks/attestation/useGaslessAttestation.ts - Generic client hook
/lib/attestation/api/helpers.ts - API helper function
/lib/attestation/api/types.ts - Shared type definitions
/supabase/migrations/123_add_gasless_attestation_uids.sql - Database schema
Modified Files:

/lib/attestation/schemas/definitions.ts - Add 5 new schema definitions (UIDs stored in DB, not code)
/pages/api/subscriptions/renew-with-xp.ts - XP renewal integration
/app/api/token/withdraw/route.ts - DG withdrawal integration
/app/api/admin/config/withdrawal-limits/route.ts - DG config integration
/pages/api/user/task/[taskId]/claim.ts - Milestone task reward claim integration
/pages/api/milestones/claim.ts - Milestone key claim integration
/pages/api/quests/claim-task-reward.ts - Quest task reward claim integration
/pages/api/quests/complete-quest.ts - Quest key claim integration
/pages/api/quests/get-trial.ts - Activation quest integration
/pages/api/bootcamp/certificate/claim.ts - Bootcamp migration
/hooks/useMilestoneClaim.ts - Add attestation signing for key claims
/hooks/useQuests.ts - Add attestation signing for task reward claims and key claims
/hooks/bootcamp-completion/useCertificateClaim.ts - Migrate to gasless
Reference Files (Do NOT Modify - Copy Pattern Only):

/lib/attestation/core/delegated.ts - Core service (already perfect)
/pages/api/checkin/index.ts - Reference implementation (lines 112-210)
/hooks/checkin/useDelegatedAttestationCheckin.ts - Pattern to copy (DO NOT MODIFY OR REFACTOR)
Success Criteria
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

Why This is KISS, DRY, and Scalable
KISS (Keep It Simple):

Clear flow: Client encodes+signs → Server validates+submits → Save UID
Each action integration = 5 lines client + 5 lines server
One hook + one helper for ALL actions
Graceful degradation keeps actions working even if attestation fails
DRY (Don't Repeat Yourself):

ONE client hook: useGaslessAttestation() for all 8 actions
ONE API helper: handleGaslessAttestation() for all 8 actions
Schema encoding logic shared via hook
Error handling shared via helper
Per-action code is just simple data structures
