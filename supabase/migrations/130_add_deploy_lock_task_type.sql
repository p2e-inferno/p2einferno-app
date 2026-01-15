-- Migration: Add deploy_lock task type to quest_tasks
-- Purpose: Enable automatic verification of Unlock Protocol lock deployments across multiple networks
-- Related PRD: docs/LOCKSMITH_QUEST_PRD.md

-- Add deploy_lock to the quest_tasks.task_type constraint
ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_task_type_check;

ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_task_type_check
CHECK (task_type IN (
  'link_email',
  'link_wallet',
  'link_farcaster',
  'sign_tos',
  'submit_url',
  'submit_text',
  'submit_proof',
  'complete_external',
  'custom',
  'vendor_buy',
  'vendor_sell',
  'vendor_light_up',
  'vendor_level_up',
  'deploy_lock'  -- NEW: Multi-network lock deployment verification
));

-- Note: quest_verified_transactions table already supports multi-chain transactions
-- via the chain_id column (added in migration 116). No additional schema changes needed.

-- Comment on the new task type for documentation
COMMENT ON CONSTRAINT quest_tasks_task_type_check ON public.quest_tasks IS
  'Allowed task types including deploy_lock for automatic verification of Unlock Protocol lock deployments';
