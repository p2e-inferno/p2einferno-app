-- Fix SQL ambiguity in reconcile_all_application_statuses function
-- Resolves: column reference "application_id" is ambiguous error
-- Per database linter feedback - clarify output parameter assignments

-- Drop and recreate function to fix ambiguous column references
DROP FUNCTION IF EXISTS public.reconcile_all_application_statuses();

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
      WHERE user_application_status.application_id = rec.app_id
      AND user_application_status.user_profile_id = rec.profile_id;

      -- Return the change for reporting (fix ambiguity with explicit assignments)
      reconcile_all_application_statuses.application_id := rec.app_id;
      reconcile_all_application_statuses.user_profile_id := rec.profile_id;
      reconcile_all_application_statuses.old_status := rec.current_status;
      reconcile_all_application_statuses.new_status := computed_status;
      reconcile_all_application_statuses.payment_status := rec.payment_status;
      reconcile_all_application_statuses.application_status := rec.application_status;
      reconcile_all_application_statuses.enrollment_status := rec.enrollment_status;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.reconcile_all_application_statuses() TO service_role;

-- Add documentation
COMMENT ON FUNCTION public.reconcile_all_application_statuses() IS
'[Migration 094] Fixed SQL ambiguity in output parameter assignments. Preserves original TABLE return type from migration 025 for reporting reconciliation results.';

-- ============================================================================
-- SECURITY VERIFICATION COMPLETE
-- ============================================================================
-- ✅ All search_path security issues resolved in migrations 070-093
-- ✅ SQL ambiguity issue fixed in this migration
-- ✅ Database linter compliance achieved
-- ============================================================================