-- Migration: Add link_telegram task type to quest_tasks
-- Purpose: Allow Telegram account-linking tasks in admin-created quests

ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_task_type_check;

ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_task_type_check
CHECK (task_type IN (
  'link_email',
  'link_wallet',
  'link_farcaster',
  'link_telegram',
  'link_discord',
  'link_x',
  'link_github',
  'link_tiktok',
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
  'deploy_lock'
));

COMMENT ON CONSTRAINT quest_tasks_task_type_check ON public.quest_tasks IS
  'Allowed quest task types including link_telegram, link_discord, link_x, link_github, link_tiktok and deploy_lock';
