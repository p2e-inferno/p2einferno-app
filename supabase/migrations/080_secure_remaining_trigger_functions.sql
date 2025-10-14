-- 080_secure_remaining_trigger_functions.sql
-- Complete the security audit by adding search_path to remaining trigger functions
-- Preserves original function signatures and logic while adding security directives
-- This completes the work started in migrations 070-078 and 079

-- ============================================================================
-- SECURITY: Add search_path to application status functions
-- ============================================================================

-- Drop function to ensure clean recreation with security directive
DROP FUNCTION IF EXISTS public.compute_user_application_status(TEXT, TEXT);

-- Secure compute_user_application_status (from migration 025) with original signature
CREATE OR REPLACE FUNCTION public.compute_user_application_status(
  payment_status TEXT,
  application_status TEXT,
  enrollment_status TEXT DEFAULT NULL
) RETURNS TEXT
SET search_path = 'public'
AS $$
BEGIN
  -- Handle enrollment status first (if exists)
  IF enrollment_status IS NOT NULL THEN
    IF enrollment_status IN ('active', 'completed') THEN
      RETURN 'enrolled';
    END IF;
  END IF;

  -- Handle application status
  IF application_status = 'rejected' THEN RETURN 'rejected'; END IF;
  IF application_status = 'withdrawn' THEN RETURN 'withdrawn'; END IF;
  IF application_status = 'approved' AND payment_status = 'completed' THEN
    RETURN 'approved'; -- Ready for enrollment
  END IF;

  -- Handle payment status
  IF payment_status = 'failed' THEN RETURN 'payment_failed'; END IF;
  IF payment_status = 'processing' THEN RETURN 'payment_processing'; END IF;
  IF payment_status = 'completed' AND application_status != 'approved' THEN
    RETURN 'under_review';
  END IF;

  -- Default cases
  IF application_status = 'draft' THEN RETURN 'draft'; END IF;
  RETURN 'payment_pending';
END;
$$ LANGUAGE plpgsql;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.compute_user_application_status(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- SECURITY: Add search_path to sync_application_status
-- ============================================================================

-- Secure sync_application_status (from migration 025) with original multi-table logic
CREATE OR REPLACE FUNCTION public.sync_application_status()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  target_application_id UUID;
  target_user_profile_id UUID;
  current_payment_status TEXT;
  current_application_status TEXT;
  current_enrollment_status TEXT DEFAULT NULL;
  computed_status TEXT;
BEGIN
  -- Determine which table triggered this and extract relevant IDs
  IF TG_TABLE_NAME = 'applications' THEN
    target_application_id := COALESCE(NEW.id, OLD.id);
    current_payment_status := COALESCE(NEW.payment_status, OLD.payment_status);
    current_application_status := COALESCE(NEW.application_status, OLD.application_status);

    -- Get user profile ID from user_application_status
    SELECT user_profile_id INTO target_user_profile_id
    FROM user_application_status
    WHERE application_id = target_application_id
    LIMIT 1;

  ELSIF TG_TABLE_NAME = 'user_application_status' THEN
    target_application_id := COALESCE(NEW.application_id, OLD.application_id);
    target_user_profile_id := COALESCE(NEW.user_profile_id, OLD.user_profile_id);

    -- Get payment and application status from applications table
    SELECT a.payment_status, a.application_status
    INTO current_payment_status, current_application_status
    FROM applications a
    WHERE id = target_application_id;

  ELSIF TG_TABLE_NAME = 'bootcamp_enrollments' THEN
    target_user_profile_id := COALESCE(NEW.user_profile_id, OLD.user_profile_id);
    current_enrollment_status := COALESCE(NEW.enrollment_status, OLD.enrollment_status);

    -- Get application ID and statuses from related tables
    SELECT a.id, a.payment_status, a.application_status
    INTO target_application_id, current_payment_status, current_application_status
    FROM applications a
    JOIN user_application_status uas ON uas.application_id = a.id
    WHERE uas.user_profile_id = target_user_profile_id
    AND a.cohort_id = COALESCE(NEW.cohort_id, OLD.cohort_id)
    LIMIT 1;
  END IF;

  -- Skip if we don't have the required IDs
  IF target_application_id IS NULL OR target_user_profile_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Get enrollment status if not already set
  IF current_enrollment_status IS NULL AND TG_TABLE_NAME != 'bootcamp_enrollments' THEN
    SELECT be.enrollment_status INTO current_enrollment_status
    FROM bootcamp_enrollments be
    JOIN applications a ON a.cohort_id = be.cohort_id
    WHERE be.user_profile_id = target_user_profile_id
    AND a.id = target_application_id
    LIMIT 1;
  END IF;

  -- Compute the correct user application status
  computed_status := compute_user_application_status(
    current_payment_status,
    current_application_status,
    current_enrollment_status
  );

  -- Update user_application_status table with computed status
  UPDATE user_application_status
  SET
    status = computed_status,
    updated_at = NOW()
  WHERE application_id = target_application_id
  AND user_profile_id = target_user_profile_id
  AND status != computed_status; -- Only update if status actually changed

  -- Log the status change
  INSERT INTO user_activities (
    user_profile_id,
    activity_type,
    activity_data
  ) VALUES (
    target_user_profile_id,
    'auto_status_sync',
    jsonb_build_object(
      'application_id', target_application_id,
      'trigger_table', TG_TABLE_NAME,
      'new_status', computed_status,
      'payment_status', current_payment_status,
      'application_status', current_application_status,
      'enrollment_status', current_enrollment_status,
      'timestamp', NOW()
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECURITY: Add search_path to reconcile_all_application_statuses
-- ============================================================================

-- Drop function to ensure clean recreation with security directive
DROP FUNCTION IF EXISTS public.reconcile_all_application_statuses();

-- Secure reconcile_all_application_statuses (from migration 025) with original TABLE return type
CREATE OR REPLACE FUNCTION public.reconcile_all_application_statuses()
RETURNS TABLE(
  application_id UUID,
  user_profile_id UUID,
  old_status TEXT,
  new_status TEXT,
  payment_status TEXT,
  application_status TEXT,
  enrollment_status TEXT
)
SET search_path = 'public'
AS $$
DECLARE
  rec RECORD;
  computed_status TEXT;
BEGIN
  FOR rec IN
    SELECT
      a.id as app_id,
      uas.user_profile_id as profile_id,
      uas.status as current_status,
      a.payment_status,
      a.application_status,
      be.enrollment_status
    FROM applications a
    JOIN user_application_status uas ON uas.application_id = a.id
    LEFT JOIN bootcamp_enrollments be ON be.user_profile_id = uas.user_profile_id
      AND be.cohort_id = a.cohort_id
  LOOP
    -- Compute what the status should be
    computed_status := compute_user_application_status(
      rec.payment_status,
      rec.application_status,
      rec.enrollment_status
    );

    -- If it's different from current, update it
    IF rec.current_status != computed_status THEN
      UPDATE user_application_status
      SET
        status = computed_status,
        updated_at = NOW()
      WHERE application_id = rec.app_id
      AND user_profile_id = rec.profile_id;

      -- Return the change for reporting
      application_id := rec.app_id;
      user_profile_id := rec.profile_id;
      old_status := rec.current_status;
      new_status := computed_status;
      payment_status := rec.payment_status;
      application_status := rec.application_status;
      enrollment_status := rec.enrollment_status;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.reconcile_all_application_statuses() TO service_role;

-- ============================================================================
-- DOCUMENTATION: Add comments for secured functions
-- ============================================================================

COMMENT ON FUNCTION public.compute_user_application_status(TEXT, TEXT, TEXT) IS
'[Migration 080] Secured with SET search_path. Preserves original 3-parameter signature from migration 025 for computing application status based on payment, application, and enrollment status.';

COMMENT ON FUNCTION public.sync_application_status() IS
'[Migration 080] Secured with SET search_path. Preserves full multi-table sync logic from migration 025 for handling applications, user_application_status, and bootcamp_enrollments triggers.';

COMMENT ON FUNCTION public.reconcile_all_application_statuses() IS
'[Migration 080] Secured with SET search_path. Preserves original TABLE return type from migration 025 for reporting reconciliation results.';
