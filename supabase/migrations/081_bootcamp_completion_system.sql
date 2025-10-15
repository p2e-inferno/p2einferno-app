-- 081_bootcamp_completion_system.sql
-- Bootcamp Completion & Certification System

-- Add certificate tracking fields and operational indexes
ALTER TABLE public.bootcamp_enrollments
  ADD COLUMN IF NOT EXISTS milestones_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS certificate_attestation_uid TEXT,
  ADD COLUMN IF NOT EXISTS certificate_last_error TEXT,
  ADD COLUMN IF NOT EXISTS certificate_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS certificate_retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certificate_claim_in_progress BOOLEAN DEFAULT FALSE;

-- Indexes for operational queries
CREATE INDEX IF NOT EXISTS idx_be_cert_failed
  ON public.bootcamp_enrollments (cohort_id)
  WHERE certificate_issued = FALSE AND certificate_last_error IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_be_completed_unclaimed
  ON public.bootcamp_enrollments (cohort_id, enrollment_status)
  WHERE enrollment_status = 'completed' AND certificate_issued = FALSE;

CREATE INDEX IF NOT EXISTS idx_be_claim_in_progress
  ON public.bootcamp_enrollments (id, updated_at)
  WHERE certificate_claim_in_progress = TRUE;

-- Trigger function: mark enrollment completed when all cohort milestones are completed
CREATE OR REPLACE FUNCTION public.check_bootcamp_completion()
RETURNS TRIGGER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_enrollment_id UUID;
  v_cohort_id TEXT;
  v_total_milestones INT;
  v_completed_milestones INT;
  v_current_status TEXT;
BEGIN
  -- Only when milestone transitions to completed
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get cohort for the milestone
  SELECT cohort_id INTO v_cohort_id
  FROM public.cohort_milestones
  WHERE id = NEW.milestone_id;

  IF v_cohort_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Enrollment for this user/cohort
  SELECT id, enrollment_status
  INTO v_enrollment_id, v_current_status
  FROM public.bootcamp_enrollments
  WHERE user_profile_id = NEW.user_profile_id
    AND cohort_id = v_cohort_id;

  IF v_enrollment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if already completed
  IF v_current_status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Count total vs completed milestones
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE ump.status = 'completed') as completed
  INTO v_total_milestones, v_completed_milestones
  FROM public.cohort_milestones cm
  LEFT JOIN public.user_milestone_progress ump
    ON cm.id = ump.milestone_id
    AND ump.user_profile_id = NEW.user_profile_id
  WHERE cm.cohort_id = v_cohort_id;

  -- If complete, mark enrollment
  IF v_completed_milestones = v_total_milestones AND v_total_milestones > 0 THEN
    UPDATE public.bootcamp_enrollments
    SET
      enrollment_status = 'completed',
      completion_date = now(),
      milestones_completed_at = now()
    WHERE id = v_enrollment_id
      AND enrollment_status != 'completed';

    IF FOUND THEN
      INSERT INTO public.user_activities (
        user_profile_id,
        activity_type,
        activity_data
      ) VALUES (
        NEW.user_profile_id,
        'bootcamp_completed',
        jsonb_build_object(
          'enrollment_id', v_enrollment_id,
          'cohort_id', v_cohort_id,
          'completion_type', 'automatic'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger on user_milestone_progress
DROP TRIGGER IF EXISTS trg_check_bootcamp_completion ON public.user_milestone_progress;
CREATE TRIGGER trg_check_bootcamp_completion
  AFTER UPDATE OF status ON public.user_milestone_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.check_bootcamp_completion();

-- Admin reconciliation utilities
CREATE OR REPLACE FUNCTION public.fix_completion_status(
  p_enrollment_id UUID
)
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id UUID;
  v_cohort_id TEXT;
  v_total INT;
  v_completed INT;
  v_current_status TEXT;
BEGIN
  SELECT user_profile_id, cohort_id, enrollment_status
  INTO v_user_id, v_cohort_id, v_current_status
  FROM public.bootcamp_enrollments
  WHERE id = p_enrollment_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Enrollment not found');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE ump.status = 'completed')
  INTO v_total, v_completed
  FROM public.cohort_milestones cm
  LEFT JOIN public.user_milestone_progress ump
    ON cm.id = ump.milestone_id AND ump.user_profile_id = v_user_id
  WHERE cm.cohort_id = v_cohort_id;

  IF v_completed = v_total AND v_total > 0 AND v_current_status != 'completed' THEN
    UPDATE public.bootcamp_enrollments
    SET enrollment_status = 'completed', completion_date = now(), milestones_completed_at = now()
    WHERE id = p_enrollment_id AND enrollment_status != 'completed';

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Status fixed successfully',
      'previous_status', v_current_status,
      'new_status', 'completed',
      'milestones_completed', v_completed,
      'total_milestones', v_total
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Not eligible for completion',
      'current_status', v_current_status,
      'milestones_completed', v_completed,
      'total_milestones', v_total,
      'reason', CASE
        WHEN v_total = 0 THEN 'No milestones found for cohort'
        WHEN v_completed < v_total THEN 'Not all milestones completed'
        WHEN v_current_status = 'completed' THEN 'Already marked complete'
        ELSE 'Unknown'
      END
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_clear_claim_lock(
  p_enrollment_id UUID
)
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.bootcamp_enrollments
  SET certificate_claim_in_progress = FALSE
  WHERE id = p_enrollment_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Claim lock cleared', 'enrollment_id', p_enrollment_id);
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Enrollment not found');
  END IF;
END;
$$;

-- Optional remarks table for post-completion notes
CREATE TABLE IF NOT EXISTS public.bootcamp_completion_remarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID REFERENCES public.bootcamp_enrollments(id) ON DELETE CASCADE,
  remark_type TEXT CHECK (remark_type IN ('feedback', 'misconduct', 'context', 'other')),
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remarks_enrollment
  ON public.bootcamp_completion_remarks(enrollment_id);

ALTER TABLE public.bootcamp_completion_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage remarks"
  ON public.bootcamp_completion_remarks
  FOR ALL USING (auth.role() = 'service_role');

