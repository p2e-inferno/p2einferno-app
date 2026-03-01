-- Migration: Add uniswap_swap task type to quest_tasks
-- Purpose: Allow Uniswap swap verification tasks in admin-created quests
--
-- Rollback (run manually if this migration must be reverted):
--   ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_task_type_check;
--   ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_task_type_check
--   CHECK (task_type IN (
--     'link_email','link_wallet','link_farcaster','link_telegram','link_discord',
--     'link_x','link_github','link_tiktok','sign_tos','submit_url','submit_text',
--     'submit_proof','complete_external','custom','vendor_buy','vendor_sell',
--     'vendor_light_up','vendor_level_up','deploy_lock'
--   ));
--   NOTE: First ensure no rows with task_type='uniswap_swap' exist before rolling back.

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
  'deploy_lock',
  'uniswap_swap'
));

COMMENT ON CONSTRAINT quest_tasks_task_type_check ON public.quest_tasks IS
  'Allowed quest task types including uniswap_swap for on-chain swap verification';
