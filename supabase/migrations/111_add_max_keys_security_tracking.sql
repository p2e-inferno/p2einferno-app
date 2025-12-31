-- Migration: Add maxKeysPerAddress Security Tracking
-- Description: Add columns to track whether grant-based locks have maxKeysPerAddress set to 0
-- This prevents users from bypassing requirements by directly purchasing keys

-- Add maxKeysPerAddress security tracking to quests
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS max_keys_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_keys_failure_reason TEXT;

COMMENT ON COLUMN public.quests.max_keys_secured IS 'True if maxKeysPerAddress has been verified as 0 on-chain to prevent unauthorized purchases';
COMMENT ON COLUMN public.quests.max_keys_failure_reason IS 'Error message if maxKeysPerAddress update failed during deployment';

-- Add maxKeysPerAddress security tracking to cohort_milestones
ALTER TABLE public.cohort_milestones
  ADD COLUMN IF NOT EXISTS max_keys_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_keys_failure_reason TEXT;

COMMENT ON COLUMN public.cohort_milestones.max_keys_secured IS 'True if maxKeysPerAddress has been verified as 0 on-chain to prevent unauthorized purchases';
COMMENT ON COLUMN public.cohort_milestones.max_keys_failure_reason IS 'Error message if maxKeysPerAddress update failed during deployment';

-- Add maxKeysPerAddress security tracking to bootcamp_programs
ALTER TABLE public.bootcamp_programs
  ADD COLUMN IF NOT EXISTS max_keys_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_keys_failure_reason TEXT;

COMMENT ON COLUMN public.bootcamp_programs.max_keys_secured IS 'True if maxKeysPerAddress has been verified as 0 on-chain to prevent unauthorized purchases';
COMMENT ON COLUMN public.bootcamp_programs.max_keys_failure_reason IS 'Error message if maxKeysPerAddress update failed during deployment';

-- Note: Cohorts are payment-based (maxKeysPerAddress: 1) so they don't need these columns
