-- Status Synchronization Triggers Migration
-- This migration adds triggers to automatically synchronize status across tables

-- Function to compute user application status from component statuses
CREATE OR REPLACE FUNCTION compute_user_application_status(
  payment_status TEXT,
  application_status TEXT,
  enrollment_status TEXT DEFAULT NULL
) RETURNS TEXT AS $$
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
-- Function to sync application status after changes
CREATE OR REPLACE FUNCTION sync_application_status() RETURNS TRIGGER AS $$
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
    SELECT payment_status, application_status 
    INTO current_payment_status, current_application_status
    FROM applications 
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
-- Create triggers for automatic status synchronization
DROP TRIGGER IF EXISTS sync_status_on_application_update ON applications;
CREATE TRIGGER sync_status_on_application_update
  AFTER UPDATE OF payment_status, application_status ON applications
  FOR EACH ROW
  WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status OR 
        OLD.application_status IS DISTINCT FROM NEW.application_status)
  EXECUTE FUNCTION sync_application_status();
DROP TRIGGER IF EXISTS sync_status_on_user_app_status_update ON user_application_status;
CREATE TRIGGER sync_status_on_user_app_status_update
  AFTER UPDATE OF status ON user_application_status
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION sync_application_status();
DROP TRIGGER IF EXISTS sync_status_on_enrollment_change ON bootcamp_enrollments;
CREATE TRIGGER sync_status_on_enrollment_change
  AFTER INSERT OR UPDATE OF enrollment_status ON bootcamp_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION sync_application_status();
-- Function to reconcile all inconsistent statuses (for one-time cleanup)
CREATE OR REPLACE FUNCTION reconcile_all_application_statuses() RETURNS TABLE(
  application_id UUID,
  user_profile_id UUID,
  old_status TEXT,
  new_status TEXT,
  payment_status TEXT,
  application_status TEXT,
  enrollment_status TEXT
) AS $$
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
-- Add helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_application_status_sync 
ON user_application_status(application_id, user_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_bootcamp_enrollments_sync 
ON bootcamp_enrollments(user_profile_id, cohort_id, enrollment_status);
CREATE INDEX IF NOT EXISTS idx_applications_status_sync 
ON applications(id, payment_status, application_status);
-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION compute_user_application_status(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_all_application_statuses() TO service_role;
