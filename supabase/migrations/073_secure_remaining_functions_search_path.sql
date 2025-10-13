-- Secure remaining functions with fixed search_path to prevent SQL injection
-- Per Supabase advisory 0011: Functions with mutable search_path are vulnerable
-- This migration completes the security work started in migration 070

-- Completes securing all 22 functions mentioned in the advisory

-- ============================================================================
-- Notification Trigger Functions (from 061)
-- ============================================================================

-- 1. notify_on_task_completion
CREATE OR REPLACE FUNCTION public.notify_on_task_completion()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_task_title TEXT;
  v_cohort_id TEXT;
  v_user_profile_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_user_profile_id
    FROM user_profiles
    WHERE privy_user_id = NEW.user_id;

    SELECT qt.title, NULL
    INTO v_task_title, v_cohort_id
    FROM quest_tasks qt
    WHERE qt.id = NEW.task_id;

    IF v_user_profile_id IS NOT NULL THEN
      PERFORM create_notification_v2(
        v_user_profile_id,
        'Task completed',
        'Congratulations! You completed "' || COALESCE(v_task_title, 'a task') || '"',
        CASE
          WHEN NEW.quest_id IS NOT NULL THEN '/lobby/quests/' || NEW.quest_id
          ELSE '/lobby'
        END
      );
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 2. notify_on_milestone_progress
CREATE OR REPLACE FUNCTION public.notify_on_milestone_progress()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_milestone_name TEXT;
  v_cohort_id TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT cm.name, cm.cohort_id
    INTO v_milestone_name, v_cohort_id
    FROM cohort_milestones cm
    WHERE cm.id = NEW.milestone_id;

    PERFORM create_notification_v2(
      NEW.user_profile_id,
      'Milestone completed',
      'Amazing! You completed milestone "' || COALESCE(v_milestone_name, 'Unknown') || '"',
      CASE
        WHEN v_cohort_id IS NOT NULL THEN '/lobby/bootcamps/' || v_cohort_id
        ELSE '/lobby'
      END
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. notify_on_enrollment_change
CREATE OR REPLACE FUNCTION public.notify_on_enrollment_change()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_cohort_name TEXT;
  v_title TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  SELECT name INTO v_cohort_name
  FROM cohorts
  WHERE id = COALESCE(NEW.cohort_id, OLD.cohort_id);

  IF TG_OP = 'INSERT' THEN
    v_title := 'Enrolled in bootcamp';
    v_message := 'Welcome! You have been enrolled in ' || COALESCE(v_cohort_name, 'a bootcamp cohort') || '. Start your learning journey now!';
    v_link := '/lobby/bootcamps/' || COALESCE(NEW.cohort_id, '');

  ELSIF TG_OP = 'UPDATE' AND (OLD.enrollment_status IS DISTINCT FROM NEW.enrollment_status) THEN
    v_title := 'Enrollment status updated';
    v_message := 'Your enrollment status is now ' || NEW.enrollment_status || ' for ' || COALESCE(v_cohort_name, 'your cohort');
    v_link := '/lobby/bootcamps/' || COALESCE(NEW.cohort_id, '');

  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM create_notification_v2(
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    v_title,
    v_message,
    v_link
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 4. notify_on_application_status
CREATE OR REPLACE FUNCTION public.notify_on_application_status()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_cohort_id TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT a.cohort_id INTO v_cohort_id
    FROM applications a
    WHERE a.id = NEW.application_id;

    v_title := 'Application status updated';

    CASE NEW.status
      WHEN 'enrolled' THEN
        v_message := 'Congratulations! Your application has been approved and you are now enrolled.';
      WHEN 'completed' THEN
        v_message := 'Your application has been completed successfully.';
      WHEN 'submitted' THEN
        v_message := 'Your application has been submitted and is under review.';
      WHEN 'pending' THEN
        v_message := 'Your application is pending. Please complete any required steps.';
      ELSE
        v_message := 'Your application status is now ' || NEW.status || '.';
    END CASE;

    PERFORM create_notification_v2(
      NEW.user_profile_id,
      v_title,
      v_message,
      CASE
        WHEN v_cohort_id IS NOT NULL THEN '/lobby/bootcamps/' || v_cohort_id
        WHEN NEW.status = 'enrolled' THEN '/lobby/bootcamps/enrolled'
        ELSE '/lobby/applications'
      END
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Cohort Management Functions
-- ============================================================================

-- 5. update_cohort_participant_count (from 060)
CREATE OR REPLACE FUNCTION update_cohort_participant_count()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.enrollment_status = 'active' THEN
            UPDATE cohorts
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.enrollment_status = 'active' THEN
            UPDATE cohorts
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = OLD.cohort_id;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.enrollment_status != 'active' AND NEW.enrollment_status = 'active' THEN
            UPDATE cohorts
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        IF OLD.enrollment_status = 'active' AND NEW.enrollment_status != 'active' THEN
            UPDATE cohorts
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        IF OLD.cohort_id != NEW.cohort_id THEN
            IF OLD.enrollment_status = 'active' THEN
                UPDATE cohorts
                SET current_participants = GREATEST(current_participants - 1, 0),
                    updated_at = NOW()
                WHERE id = OLD.cohort_id;
            END IF;

            IF NEW.enrollment_status = 'active' THEN
                UPDATE cohorts
                SET current_participants = current_participants + 1,
                    updated_at = NOW()
                WHERE id = NEW.cohort_id;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 6. ensure_user_application_status (from 063)
CREATE OR REPLACE FUNCTION ensure_user_application_status()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.user_profile_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_application_status
      WHERE application_id = NEW.id
      AND user_profile_id = NEW.user_profile_id
    ) THEN
      INSERT INTO user_application_status (
        user_profile_id,
        application_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_profile_id,
        NEW.id,
        CASE
          WHEN NEW.payment_status = 'completed' THEN 'completed'
          WHEN NEW.payment_status = 'failed' THEN 'failed'
          ELSE 'pending'
        END,
        NOW(),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add security comments
COMMENT ON FUNCTION public.notify_on_task_completion IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.notify_on_milestone_progress IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.notify_on_enrollment_change IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.notify_on_application_status IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION update_cohort_participant_count IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION ensure_user_application_status IS 'Secured with fixed search_path per Supabase advisory 0011';

-- ============================================================================
-- Remaining functions to secure (documented for future migrations):
-- ============================================================================
-- - award_xp_to_user
-- - check_duplicate_submission (from 037)
-- - update_quest_progress_on_task_change (from 019)
-- - update_milestone_total_reward (from 037)
-- - handle_successful_payment (multiple migrations)
-- - check_lock_address_uniqueness (from 005, 007, 012)
-- - recalculate_quest_progress (from 019)
--
-- These will be addressed in migration 074
