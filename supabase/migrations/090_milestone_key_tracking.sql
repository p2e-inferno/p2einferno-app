-- Migration: 090_milestone_key_tracking.sql
-- Adds milestone key claim tracking to enable completion flow based on key claims
-- instead of just task completion

-- Add key_claimed column to track when milestone keys are actually claimed on-chain
ALTER TABLE public.cohort_milestones
  ADD COLUMN IF NOT EXISTS key_claimed BOOLEAN DEFAULT FALSE;

-- Add index for completion queries (need to check all milestones for a cohort)
CREATE INDEX IF NOT EXISTS idx_cohort_milestones_key_claimed
  ON public.cohort_milestones (cohort_id, key_claimed);

-- Add timestamp for when key was claimed (for audit trail)
ALTER TABLE public.cohort_milestones
  ADD COLUMN IF NOT EXISTS key_claimed_at TIMESTAMPTZ;

-- Create new completion trigger function that checks milestone key claims
-- This will be an alternative to the existing task-based completion trigger
CREATE OR REPLACE FUNCTION public.check_bootcamp_completion_by_keys()
RETURNS TRIGGER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_enrollment_id UUID;
  v_cohort_id TEXT;
  v_total_milestones INT;
  v_claimed_milestones INT;
  v_current_status TEXT;
  v_user_profile_id UUID;
BEGIN
  -- Only when key_claimed transitions to true
  IF NEW.key_claimed != TRUE OR OLD.key_claimed = TRUE THEN
    RETURN NEW;
  END IF;

  v_cohort_id := NEW.cohort_id;

  -- Count total vs claimed milestone keys for this cohort
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE key_claimed = TRUE) as claimed
  INTO v_total_milestones, v_claimed_milestones
  FROM public.cohort_milestones
  WHERE cohort_id = v_cohort_id;

  -- If all milestone keys are claimed, check all enrolled users and mark them complete
  IF v_claimed_milestones = v_total_milestones AND v_total_milestones > 0 THEN
    -- Update all enrollments for this cohort that aren't already completed
    UPDATE public.bootcamp_enrollments
    SET
      enrollment_status = 'completed',
      completion_date = now(),
      milestones_completed_at = now()
    WHERE cohort_id = v_cohort_id
      AND enrollment_status IN ('enrolled', 'active')
    RETURNING user_profile_id INTO v_user_profile_id;

    -- Log completion activities for affected users
    INSERT INTO public.user_activities (
      user_profile_id,
      activity_type,
      activity_data
    )
    SELECT
      be.user_profile_id,
      'bootcamp_completed',
      jsonb_build_object(
        'enrollment_id', be.id,
        'cohort_id', v_cohort_id,
        'completion_type', 'milestone_keys_claimed'
      )
    FROM public.bootcamp_enrollments be
    WHERE be.cohort_id = v_cohort_id
      AND be.enrollment_status = 'completed'
      AND be.completion_date >= now() - interval '1 minute'; -- Only recent completions
  END IF;

  RETURN NEW;
END;
$$;

-- Note: We don't activate this trigger yet - it will be controlled by feature flag
-- The existing trigger will remain active during transition period

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_bootcamp_completion_by_keys() TO service_role;

-- Add helpful comments
COMMENT ON COLUMN public.cohort_milestones.key_claimed IS 'Tracks whether the milestone key has been successfully claimed on-chain by checking getHasValidKey after grant';
COMMENT ON COLUMN public.cohort_milestones.key_claimed_at IS 'Timestamp when the milestone key was successfully claimed and verified on-chain';
COMMENT ON FUNCTION public.check_bootcamp_completion_by_keys() IS 'Alternative completion trigger that activates when all milestone keys are claimed rather than when tasks are completed';