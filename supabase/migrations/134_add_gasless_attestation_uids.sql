-- Migration: Add attestation UID tracking columns for gasless attestations
-- Description: Add columns to track on-chain attestation UIDs for various user actions
--              This supports Phase 1 of the gasless attestation integration plan
-- Date: 2026-01-23

-- ============================================================================
-- Transaction/Config Attestations
-- ============================================================================

-- XP Subscription Renewals
ALTER TABLE subscription_renewal_attempts
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

COMMENT ON COLUMN subscription_renewal_attempts.attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain audit trail of XP renewal transaction';

-- DG Token Withdrawals
ALTER TABLE dg_token_withdrawals
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

COMMENT ON COLUMN dg_token_withdrawals.attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain audit trail of token withdrawal';

-- Config Audit Log (Admin changes)
ALTER TABLE config_audit_log
  ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

COMMENT ON COLUMN config_audit_log.attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain governance audit trail';

-- ============================================================================
-- Milestone/Quest KEY Claim Attestations (on-chain key grants)
-- ============================================================================

-- Milestone Key Claims (progression keys)
ALTER TABLE user_milestone_progress
  ADD COLUMN IF NOT EXISTS key_claim_attestation_uid TEXT;

COMMENT ON COLUMN user_milestone_progress.key_claim_attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain record of milestone key grant. Distinct from task reward claims.';

-- Quest Key Claims (completion keys)
ALTER TABLE user_quest_progress
  ADD COLUMN IF NOT EXISTS key_claim_attestation_uid TEXT;

COMMENT ON COLUMN user_quest_progress.key_claim_attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain record of quest key grant. Distinct from task reward claims.';

-- ============================================================================
-- Milestone/Quest TASK REWARD Claim Attestations (XP awards)
-- ============================================================================

-- Milestone Task Reward Claims (individual task XP)
ALTER TABLE user_task_progress
  ADD COLUMN IF NOT EXISTS reward_claim_attestation_uid TEXT;

COMMENT ON COLUMN user_task_progress.reward_claim_attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain audit trail of task XP reward claim. Distinct from milestone key claim.';

-- Quest Task Reward Claims (individual task XP)
ALTER TABLE user_task_completions
  ADD COLUMN IF NOT EXISTS reward_claim_attestation_uid TEXT;

COMMENT ON COLUMN user_task_completions.reward_claim_attestation_uid IS
  'EAS attestation UID (bytes32) for on-chain audit trail of quest task XP reward claim. Distinct from quest key claim.';

-- ============================================================================
-- Indexes for Efficient Attestation Lookups
-- ============================================================================

-- Transaction/config attestation indexes
CREATE INDEX IF NOT EXISTS idx_renewal_attempts_attestation
  ON subscription_renewal_attempts(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_attestation
  ON dg_token_withdrawals(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_config_audit_attestation
  ON config_audit_log(attestation_uid)
  WHERE attestation_uid IS NOT NULL;

-- Milestone/quest key claim indexes
CREATE INDEX IF NOT EXISTS idx_milestone_progress_key_claim
  ON user_milestone_progress(key_claim_attestation_uid)
  WHERE key_claim_attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quest_progress_key_claim
  ON user_quest_progress(key_claim_attestation_uid)
  WHERE key_claim_attestation_uid IS NOT NULL;

-- Milestone/quest task reward claim indexes
CREATE INDEX IF NOT EXISTS idx_task_progress_reward_claim
  ON user_task_progress(reward_claim_attestation_uid)
  WHERE reward_claim_attestation_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_completions_reward_claim
  ON user_task_completions(reward_claim_attestation_uid)
  WHERE reward_claim_attestation_uid IS NOT NULL;

-- ============================================================================
-- Notes
-- ============================================================================

-- Column Naming Convention:
--   - attestation_uid: General actions (renewals, withdrawals, config changes)
--   - key_claim_attestation_uid: Milestone/quest KEY claims (on-chain key grants)
--   - reward_claim_attestation_uid: Milestone/quest TASK REWARD claims (XP awards)
--
-- This distinction is important because milestones and quests have TWO separate
-- attestable actions:
--   1. Task reward claim: User claims XP for individual task completion
--   2. Key claim: User claims on-chain key after completing all tasks
--
-- Both create on-chain attestations for transparency and audit trails.

-- Note: bootcamp_enrollments already has certificate_attestation_uid TEXT column
