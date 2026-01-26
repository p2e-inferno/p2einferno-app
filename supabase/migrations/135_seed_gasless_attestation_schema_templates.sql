-- 135_seed_gasless_attestation_schema_templates.sql
-- Seed DB templates for gasless attestation schemas so they appear in /admin/eas-schemas
-- Networks: base-sepolia + base
--
-- NOTE:
-- - These template rows use non-bytes32 placeholder schema_uids so the Admin UI shows "Not on-chain".
-- - Deploy via "Deploy to EAS & Update UID" (redeploy) from the schema details page.
-- - Categories must satisfy the existing CHECK constraint from migration 062.

-- ============================================================================
-- 1) Ensure schema keys exist
-- ============================================================================

INSERT INTO public.eas_schema_keys (key, label, description, active)
VALUES
  ('daily_checkin', 'Daily Check-in', 'Daily check-in attestations', true),
  ('quest_completion', 'Quest Completion', 'Quest completion attestations', true),
  ('bootcamp_completion', 'Bootcamp Completion', 'Bootcamp completion attestations', true),
  ('milestone_achievement', 'Milestone Achievement', 'Milestone achievement attestations', true),
  ('xp_renewal', 'XP Renewal', 'XP subscription renewals', true),
  ('dg_withdrawal', 'DG Withdrawal', 'DG token withdrawals', true),
  ('dg_config_change', 'DG Config Change', 'DG withdrawal config audit changes', true),
  ('milestone_task_reward_claim', 'Milestone Task Reward Claim', 'XP reward claims for milestone tasks', true),
  ('quest_task_reward_claim', 'Quest Task Reward Claim', 'XP reward claims for quest tasks', true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  active = EXCLUDED.active,
  updated_at = now();

-- ============================================================================
-- 2) Update existing core schema definitions where present (dev-friendly)
-- ============================================================================

-- Align Daily Check-in schema: remove userDid, use address for walletAddress
UPDATE public.attestation_schemas
SET schema_definition = 'address walletAddress,string greeting,uint256 timestamp,uint256 xpGained',
    updated_at = now()
WHERE schema_key = 'daily_checkin'
  AND network IN ('base-sepolia', 'base');

-- Update existing schemas to include chain-relevant fields (dev templates).
-- These are "definition templates" only; deploy will create a new on-chain UID.
UPDATE public.attestation_schemas
SET schema_definition = 'string milestoneId,string milestoneTitle,address userAddress,address cohortLockAddress,address milestoneLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 achievementDate,uint256 xpEarned,string skillLevel',
    updated_at = now()
WHERE schema_key = 'milestone_achievement'
  AND network IN ('base-sepolia', 'base');

UPDATE public.attestation_schemas
SET schema_definition = 'string questId,string questTitle,address userAddress,address questLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 completionDate,uint256 xpEarned,string difficulty',
    updated_at = now()
WHERE schema_key = 'quest_completion'
  AND network IN ('base-sepolia', 'base');

UPDATE public.attestation_schemas
SET schema_definition = 'string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,address cohortLockAddress,address certificateLockAddress,uint256 certificateTokenId,bytes32 certificateTxHash,uint256 completionDate,uint256 totalXpEarned',
    updated_at = now()
WHERE schema_key = 'bootcamp_completion'
  AND network IN ('base-sepolia', 'base');

-- ============================================================================
-- 3) Insert missing schema templates for each network
-- ============================================================================

-- Helper: insert a template row (id is generated). We use schema_uid placeholders that are stable and unique.

INSERT INTO public.attestation_schemas (
  schema_uid,
  name,
  description,
  schema_definition,
  category,
  revocable,
  network,
  schema_key
)
SELECT
  v.schema_uid,
  v.name,
  v.description,
  v.schema_definition,
  v.category,
  v.revocable,
  v.network,
  v.schema_key
FROM (
  VALUES
    -- base-sepolia templates (new gasless action schemas)
    ('template:xp_renewal:base-sepolia:v1', 'XP Subscription Renewal', 'On-chain attestation template for subscription renewals using XP.', 'address userAddress,address subscriptionLockAddress,uint256 amountXp,uint256 serviceFeeXp,uint256 durationDays,uint256 newExpirationTimestamp,bytes32 renewalTxHash', 'achievement', false, 'base-sepolia', 'xp_renewal'),
    ('template:dg_withdrawal:base-sepolia:v1', 'DG Token Withdrawal', 'On-chain attestation template for DG token withdrawals.', 'address userAddress,uint256 amountDg,uint256 withdrawalTimestamp,bytes32 withdrawalTxHash', 'achievement', false, 'base-sepolia', 'dg_withdrawal'),
    ('template:dg_config_change:base-sepolia:v1', 'DG Withdrawal Config Change', 'On-chain attestation template for admin changes to DG withdrawal limits.', 'address adminAddress,uint256 previousMinAmount,uint256 newMinAmount,uint256 previousMaxDaily,uint256 newMaxDaily,uint256 changeTimestamp,string changeReason', 'achievement', false, 'base-sepolia', 'dg_config_change'),
    ('template:milestone_task_reward_claim:base-sepolia:v1', 'Milestone Task Reward Claim', 'On-chain attestation template for claiming XP rewards for milestone task completions.', 'string milestoneId,address userAddress,address milestoneLockAddress,uint256 rewardAmount,uint256 claimTimestamp', 'achievement', false, 'base-sepolia', 'milestone_task_reward_claim'),
    ('template:quest_task_reward_claim:base-sepolia:v1', 'Quest Task Reward Claim', 'On-chain attestation template for claiming XP rewards for quest task completions.', 'string questId,string taskId,string taskType,address userAddress,address questLockAddress,uint256 rewardAmount,uint256 claimTimestamp', 'achievement', false, 'base-sepolia', 'quest_task_reward_claim'),

    -- base (mainnet) templates (same schema keys, separate network)
    ('template:daily_checkin:base:v2', 'Daily Check-in', 'Simple daily check-in attestation template for user engagement.', 'address walletAddress,string greeting,uint256 timestamp,uint256 xpGained', 'attendance', false, 'base', 'daily_checkin'),
    ('template:quest_completion:base:v2', 'Quest Completion', 'Attestation template for quest completion with chain data.', 'string questId,string questTitle,address userAddress,address questLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 completionDate,uint256 xpEarned,string difficulty', 'achievement', false, 'base', 'quest_completion'),
    ('template:bootcamp_completion:base:v2', 'Bootcamp Completion', 'Attestation template for bootcamp completion with chain certificate data.', 'string cohortId,string cohortName,string bootcampId,string bootcampTitle,address userAddress,address cohortLockAddress,address certificateLockAddress,uint256 certificateTokenId,bytes32 certificateTxHash,uint256 completionDate,uint256 totalXpEarned', 'achievement', false, 'base', 'bootcamp_completion'),
    ('template:milestone_achievement:base:v2', 'Milestone Achievement', 'Attestation template for milestone achievement with chain key data.', 'string milestoneId,string milestoneTitle,address userAddress,address cohortLockAddress,address milestoneLockAddress,uint256 keyTokenId,bytes32 grantTxHash,uint256 achievementDate,uint256 xpEarned,string skillLevel', 'achievement', false, 'base', 'milestone_achievement'),
    ('template:xp_renewal:base:v1', 'XP Subscription Renewal', 'On-chain attestation template for subscription renewals using XP.', 'address userAddress,address subscriptionLockAddress,uint256 amountXp,uint256 serviceFeeXp,uint256 durationDays,uint256 newExpirationTimestamp,bytes32 renewalTxHash', 'achievement', false, 'base', 'xp_renewal'),
    ('template:dg_withdrawal:base:v1', 'DG Token Withdrawal', 'On-chain attestation template for DG token withdrawals.', 'address userAddress,uint256 amountDg,uint256 withdrawalTimestamp,bytes32 withdrawalTxHash', 'achievement', false, 'base', 'dg_withdrawal'),
    ('template:dg_config_change:base:v1', 'DG Withdrawal Config Change', 'On-chain attestation template for admin changes to DG withdrawal limits.', 'address adminAddress,uint256 previousMinAmount,uint256 newMinAmount,uint256 previousMaxDaily,uint256 newMaxDaily,uint256 changeTimestamp,string changeReason', 'achievement', false, 'base', 'dg_config_change'),
    ('template:milestone_task_reward_claim:base:v1', 'Milestone Task Reward Claim', 'On-chain attestation template for claiming XP rewards for milestone task completions.', 'string milestoneId,address userAddress,address milestoneLockAddress,uint256 rewardAmount,uint256 claimTimestamp', 'achievement', false, 'base', 'milestone_task_reward_claim'),
    ('template:quest_task_reward_claim:base:v1', 'Quest Task Reward Claim', 'On-chain attestation template for claiming XP rewards for quest task completions.', 'string questId,string taskId,string taskType,address userAddress,address questLockAddress,uint256 rewardAmount,uint256 claimTimestamp', 'achievement', false, 'base', 'quest_task_reward_claim')
) AS v(schema_uid, name, description, schema_definition, category, revocable, network, schema_key)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.attestation_schemas s
  WHERE s.schema_uid = v.schema_uid
);
