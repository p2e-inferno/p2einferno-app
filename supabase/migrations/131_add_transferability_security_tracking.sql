-- Migration: Add transferability security tracking
-- Description: Track whether locks are configured as non-transferable (soul-bound) by enforcing transferFeeBasisPoints = 10000.
-- This prevents users from transferring keys between wallets, which would undermine hasValidKey-based gating.

-- Bootcamps: certificate/access locks should be non-transferable
ALTER TABLE public.bootcamp_programs
  ADD COLUMN IF NOT EXISTS transferability_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transferability_failure_reason TEXT;

COMMENT ON COLUMN public.bootcamp_programs.transferability_secured IS 'True if transferFeeBasisPoints is 10000 on-chain (non-transferable)';
COMMENT ON COLUMN public.bootcamp_programs.transferability_failure_reason IS 'Error message if transferability update/check failed';

-- Cohorts: enrollment locks should be non-transferable
ALTER TABLE public.cohorts
  ADD COLUMN IF NOT EXISTS transferability_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transferability_failure_reason TEXT;

COMMENT ON COLUMN public.cohorts.transferability_secured IS 'True if transferFeeBasisPoints is 10000 on-chain (non-transferable)';
COMMENT ON COLUMN public.cohorts.transferability_failure_reason IS 'Error message if transferability update/check failed';

-- Milestones: completion locks should be non-transferable
ALTER TABLE public.cohort_milestones
  ADD COLUMN IF NOT EXISTS transferability_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transferability_failure_reason TEXT;

COMMENT ON COLUMN public.cohort_milestones.transferability_secured IS 'True if transferFeeBasisPoints is 10000 on-chain (non-transferable)';
COMMENT ON COLUMN public.cohort_milestones.transferability_failure_reason IS 'Error message if transferability update/check failed';

-- Quests: completion locks should be non-transferable
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS transferability_secured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transferability_failure_reason TEXT;

COMMENT ON COLUMN public.quests.transferability_secured IS 'True if transferFeeBasisPoints is 10000 on-chain (non-transferable)';
COMMENT ON COLUMN public.quests.transferability_failure_reason IS 'Error message if transferability update/check failed';

