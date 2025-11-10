-- 099_recreate_milestone_progress_triggers.sql
-- Recreate missing milestone progress triggers and reconcile existing data
--
-- Context: Investigation revealed that the triggers created in migration 045
-- are missing in production, even though the functions exist (updated in migration 079).
-- This migration:
-- 1. Verifies function definitions match migration 079 (secured versions)
-- 2. Recreates the missing triggers
-- 3. Reconciles existing user_task_progress data to create missing user_milestone_progress records
--
-- The triggers that should exist:
-- - update_milestone_progress_on_task_change (on user_task_progress)
-- - update_task_progress_on_submission_change (on task_submissions)

-- ============================================================================
-- STEP 1: Verify and ensure function definitions are correct
-- ============================================================================

-- Ensure update_user_milestone_progress() matches migration 079 (secured version)
CREATE OR REPLACE FUNCTION public.update_user_milestone_progress()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  milestone_record RECORD;
  total_tasks_count INTEGER;
  completed_tasks_count INTEGER;
  new_progress_percentage DECIMAL(5,2);
  total_reward INTEGER;
  existing_started_at TIMESTAMPTZ;
BEGIN
  -- Get milestone info
  SELECT * INTO milestone_record
  FROM public.cohort_milestones
  WHERE id = COALESCE(NEW.milestone_id, OLD.milestone_id);

  -- Count total tasks for this milestone
  SELECT COUNT(*) INTO total_tasks_count
  FROM public.milestone_tasks
  WHERE milestone_id = milestone_record.id;

  -- Count completed tasks for this user and milestone
  SELECT COUNT(*) INTO completed_tasks_count
  FROM public.user_task_progress
  WHERE user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND milestone_id = milestone_record.id
  AND status = 'completed';

  -- Calculate progress percentage
  new_progress_percentage := CASE
    WHEN total_tasks_count > 0 THEN (completed_tasks_count * 100.0 / total_tasks_count)
    ELSE 0
  END;

  -- Calculate total reward earned
  SELECT COALESCE(SUM(mt.reward_amount), 0) INTO total_reward
  FROM public.user_task_progress utp
  JOIN public.milestone_tasks mt ON utp.task_id = mt.id
  WHERE utp.user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND utp.milestone_id = milestone_record.id
  AND utp.status = 'completed';

  -- Get existing started_at if record exists
  SELECT started_at INTO existing_started_at
  FROM public.user_milestone_progress
  WHERE user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND milestone_id = milestone_record.id;

  -- Upsert milestone progress
  INSERT INTO public.user_milestone_progress (
    user_profile_id,
    milestone_id,
    status,
    tasks_completed,
    total_tasks,
    progress_percentage,
    started_at,
    completed_at,
    reward_amount
  ) VALUES (
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    milestone_record.id,
    CASE
      WHEN completed_tasks_count = total_tasks_count AND total_tasks_count > 0 THEN 'completed'
      WHEN completed_tasks_count > 0 THEN 'in_progress'
      ELSE 'not_started'
    END,
    completed_tasks_count,
    total_tasks_count,
    new_progress_percentage,
    CASE WHEN completed_tasks_count > 0 THEN COALESCE(existing_started_at, NOW()) ELSE NULL END,
    CASE WHEN completed_tasks_count = total_tasks_count AND total_tasks_count > 0 THEN NOW() ELSE NULL END,
    total_reward
  )
  ON CONFLICT (user_profile_id, milestone_id)
  DO UPDATE SET
    status = CASE
      WHEN EXCLUDED.tasks_completed = EXCLUDED.total_tasks AND EXCLUDED.total_tasks > 0 THEN 'completed'
      WHEN EXCLUDED.tasks_completed > 0 THEN 'in_progress'
      ELSE 'not_started'
    END,
    tasks_completed = EXCLUDED.tasks_completed,
    total_tasks = EXCLUDED.total_tasks,
    progress_percentage = EXCLUDED.progress_percentage,
    started_at = COALESCE(user_milestone_progress.started_at, EXCLUDED.started_at),
    completed_at = EXCLUDED.completed_at,
    reward_amount = EXCLUDED.reward_amount,
    updated_at = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Ensure update_task_progress_on_submission() matches migration 079 (secured version)
CREATE OR REPLACE FUNCTION public.update_task_progress_on_submission()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  task_record RECORD;
  user_profile_record RECORD;
BEGIN
  -- Get task info
  SELECT * INTO task_record
  FROM public.milestone_tasks
  WHERE id = NEW.task_id;

  -- Get user profile ID from privy user_id
  SELECT * INTO user_profile_record
  FROM public.user_profiles
  WHERE privy_user_id = NEW.user_id;

  IF user_profile_record.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Update or create task progress
  INSERT INTO public.user_task_progress (
    user_profile_id,
    milestone_id,
    task_id,
    status,
    submission_id,
    completed_at
  ) VALUES (
    user_profile_record.id,
    task_record.milestone_id,
    task_record.id,
    CASE
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'pending' THEN 'in_progress'
      WHEN NEW.status = 'failed' THEN 'failed'
      ELSE 'in_progress'
    END,
    NEW.id,
    CASE WHEN NEW.status = 'completed' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (user_profile_id, task_id)
  DO UPDATE SET
    status = CASE
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'pending' THEN 'in_progress'
      WHEN NEW.status = 'failed' THEN 'failed'
      ELSE 'in_progress'
    END,
    submission_id = NEW.id,
    completed_at = CASE WHEN NEW.status = 'completed' THEN NOW() ELSE user_task_progress.completed_at END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 2: Recreate the missing triggers
-- ============================================================================

-- Drop triggers if they exist (idempotent)
DROP TRIGGER IF EXISTS update_milestone_progress_on_task_change ON public.user_task_progress;
DROP TRIGGER IF EXISTS update_task_progress_on_submission_change ON public.task_submissions;

-- Create trigger to update milestone progress when task progress changes
CREATE TRIGGER update_milestone_progress_on_task_change
AFTER INSERT OR UPDATE OR DELETE ON public.user_task_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_user_milestone_progress();

-- Create trigger to update task progress when submission changes
CREATE TRIGGER update_task_progress_on_submission_change
AFTER INSERT OR UPDATE ON public.task_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_task_progress_on_submission();

-- ============================================================================
-- STEP 2.5: Fix create_notification_v2 function (removes non-existent body column)
-- ============================================================================
-- The create_notification_v2 function tries to insert into a 'body' column that
-- doesn't exist in the notifications table. This fix removes that column reference.

CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_user_profile_id uuid,
  p_title text,
  p_message text,
  p_link text DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  IF p_link IS NOT NULL THEN
    v_metadata := jsonb_build_object('link', p_link);
  END IF;

  INSERT INTO notifications (
    user_profile_id,
    title,
    message,
    link,
    metadata,
    read,
    created_at
  )
  VALUES (
    p_user_profile_id,
    p_title,
    p_message,
    p_link,
    v_metadata,
    false,
    NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: Reconcile existing data
-- ============================================================================
-- Touch existing user_task_progress records to fire the trigger and create
-- missing user_milestone_progress records. This will recalculate milestone
-- progress for all users who have completed tasks but are missing milestone
-- progress records.

DO $$
DECLARE
  v_records_count INT;
  v_start_time TIMESTAMPTZ;
  v_duration INTERVAL;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'Starting milestone progress reconciliation...';

  -- Touch all existing user_task_progress records to fire the trigger
  -- This will create/update user_milestone_progress records for all users
  UPDATE public.user_task_progress
  SET updated_at = NOW()
  WHERE status = 'completed';

  GET DIAGNOSTICS v_records_count = ROW_COUNT;

  v_duration := clock_timestamp() - v_start_time;

  RAISE NOTICE 'Reconciliation complete:';
  RAISE NOTICE '  - Task progress records processed: %', v_records_count;
  RAISE NOTICE '  - Duration: %', v_duration;
  RAISE NOTICE '  - Trigger fired: update_milestone_progress_on_task_change';
  RAISE NOTICE '  - Created/updated user_milestone_progress records for affected users';
END $$;

-- ============================================================================
-- Verification queries (commented out - can be run manually to verify)
-- ============================================================================
-- Verify triggers exist:
-- SELECT tgname, tgrelid::regclass, proname
-- FROM pg_trigger t
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE tgname IN ('update_milestone_progress_on_task_change', 'update_task_progress_on_submission_change');
--
-- Verify milestone progress was created:
-- SELECT 
--   COUNT(*) as total_records,
--   COUNT(DISTINCT user_profile_id) as unique_users,
--   COUNT(DISTINCT milestone_id) as unique_milestones,
--   COUNT(*) FILTER (WHERE status = 'completed') as completed_count
-- FROM public.user_milestone_progress;

