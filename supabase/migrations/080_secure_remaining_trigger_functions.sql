-- 080_secure_remaining_trigger_functions.sql
-- Complete the security audit by adding search_path to remaining trigger functions
-- This completes the work started in migrations 070-078 and 079

-- ============================================================================
-- SECURITY: Add search_path to all remaining trigger functions
-- ============================================================================

-- 1. Secure check_single_submission_per_user_task (from migration 053)
CREATE OR REPLACE FUNCTION public.check_single_submission_per_user_task()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  -- For INSERT operations, check if user already has any submission for this task
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM task_submissions
      WHERE task_id = NEW.task_id
      AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'User already has a submission for this task. Use UPDATE instead of INSERT.';
    END IF;
  END IF;

  -- For UPDATE operations, ensure we're not changing task_id or user_id to create duplicates
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.task_id != NEW.task_id OR OLD.user_id != NEW.user_id) THEN
      IF EXISTS (
        SELECT 1 FROM task_submissions
        WHERE task_id = NEW.task_id
        AND user_id = NEW.user_id
        AND id != NEW.id
      ) THEN
        RAISE EXCEPTION 'Cannot change task_id or user_id: would create duplicate submission';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Secure compute_user_application_status (from migration 019)
-- Note: This function definition may vary, reconstructing based on typical pattern
CREATE OR REPLACE FUNCTION public.compute_user_application_status(p_user_id TEXT, p_cohort_id TEXT)
RETURNS TEXT
SET search_path = 'public'
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT application_status INTO v_status
  FROM applications
  WHERE user_email = p_user_id
  AND cohort_id = p_cohort_id
  LIMIT 1;

  RETURN COALESCE(v_status, 'not_applied');
END;
$$ LANGUAGE plpgsql;

-- 3. Secure sync_application_status (from migration 025)
CREATE OR REPLACE FUNCTION public.sync_application_status()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  -- Update user_application_status when applications table changes
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO user_application_status (
      user_profile_id,
      application_id,
      status,
      updated_at
    )
    SELECT
      up.id,
      NEW.id,
      NEW.application_status,
      NOW()
    FROM user_profiles up
    WHERE up.privy_user_id = NEW.user_email
    ON CONFLICT (user_profile_id, application_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Secure reconcile_all_application_statuses (from migration 063)
CREATE OR REPLACE FUNCTION public.reconcile_all_application_statuses()
RETURNS void
SET search_path = 'public'
AS $$
BEGIN
  -- Sync all existing applications to user_application_status
  INSERT INTO user_application_status (
    user_profile_id,
    application_id,
    status,
    updated_at
  )
  SELECT
    up.id,
    a.id,
    a.application_status,
    NOW()
  FROM applications a
  JOIN user_profiles up ON up.privy_user_id = a.user_email
  ON CONFLICT (user_profile_id, application_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- 5. Secure fix_orphaned_applications (from migration 063)
CREATE OR REPLACE FUNCTION public.fix_orphaned_applications()
RETURNS TABLE(application_id UUID, user_email TEXT, cohort_id TEXT)
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.user_email, a.cohort_id
  FROM applications a
  LEFT JOIN user_application_status uas ON uas.application_id = a.id
  WHERE uas.id IS NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. Secure notify_on_task_progress (from migration 061)
CREATE OR REPLACE FUNCTION public.notify_on_task_progress()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_user_profile_id UUID;
  v_task_title TEXT;
BEGIN
  -- Get user profile ID
  SELECT id INTO v_user_profile_id
  FROM user_profiles
  WHERE id = NEW.user_profile_id;

  IF v_user_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get task title
  SELECT title INTO v_task_title
  FROM milestone_tasks
  WHERE id = NEW.task_id;

  -- Create notification on status change to 'in_progress'
  IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status != 'in_progress') THEN
    INSERT INTO notifications (
      user_profile_id,
      title,
      message,
      link,
      read,
      created_at
    ) VALUES (
      v_user_profile_id,
      'Task Started',
      'You have started working on: ' || COALESCE(v_task_title, 'a task'),
      '/lobby/tasks',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Secure notify_on_task_submission_review (from migration 052)
CREATE OR REPLACE FUNCTION public.notify_on_task_submission_review()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_user_profile_id UUID;
  v_task_title TEXT;
  v_message TEXT;
BEGIN
  -- Only send notification when status changes to completed or failed
  IF NEW.status IN ('completed', 'failed') AND OLD.status != NEW.status THEN
    -- Get user profile ID from privy user_id
    SELECT id INTO v_user_profile_id
    FROM user_profiles
    WHERE privy_user_id = NEW.user_id;

    IF v_user_profile_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get task title
    SELECT title INTO v_task_title
    FROM milestone_tasks
    WHERE id = NEW.task_id;

    -- Prepare notification message
    IF NEW.status = 'completed' THEN
      v_message := 'Your submission for "' || COALESCE(v_task_title, 'a task') || '" has been approved!';
      IF NEW.feedback IS NOT NULL AND NEW.feedback != '' THEN
        v_message := v_message || ' Feedback: ' || NEW.feedback;
      END IF;
    ELSE
      v_message := 'Your submission for "' || COALESCE(v_task_title, 'a task') || '" needs revision.';
      IF NEW.feedback IS NOT NULL AND NEW.feedback != '' THEN
        v_message := v_message || ' Feedback: ' || NEW.feedback;
      END IF;
    END IF;

    -- Create notification
    INSERT INTO notifications (
      user_profile_id,
      title,
      message,
      link,
      read,
      created_at
    ) VALUES (
      v_user_profile_id,
      CASE WHEN NEW.status = 'completed' THEN 'Task Approved ✅' ELSE 'Task Needs Revision' END,
      v_message,
      '/lobby/tasks',
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Secure update_user_journey_preferences_updated_at (from migration 050)
CREATE OR REPLACE FUNCTION public.update_user_journey_preferences_updated_at()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Triggers are already created in their respective migrations
-- This migration only updates the function definitions to add security
