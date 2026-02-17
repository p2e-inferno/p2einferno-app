-- Migration 146: Fix misleading "Task completed" notifications for Quest tasks requiring review
-- Purpose: Only send the persistent "Task completed" notification if the submission status is actually 'completed'
-- This handles auto-verified tasks. Tasks requiring manual review will get their notification 
-- when the admin approves them (handled by the Admin Review API).

CREATE OR REPLACE FUNCTION public.notify_on_task_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_task_title TEXT;
  v_cohort_id TEXT;
  v_user_profile_id UUID;
BEGIN
  -- Only notify when a task completion is inserted AND it is marked as 'completed'
  -- (e.g., auto-verified tasks like link_wallet, link_email, etc.)
  IF TG_OP = 'INSERT' AND NEW.submission_status = 'completed' THEN
    -- Get user_profile_id from user_id
    SELECT id INTO v_user_profile_id
    FROM public.user_profiles
    WHERE privy_user_id = NEW.user_id;

    -- Get task title and related cohort info
    SELECT qt.title, NULL -- quest tasks don't have direct cohort relation
    INTO v_task_title, v_cohort_id
    FROM public.quest_tasks qt
    WHERE qt.id = NEW.task_id;

    -- If we found a user profile, create notification
    IF v_user_profile_id IS NOT NULL THEN
      PERFORM public.create_notification_v2(
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

-- Add helpful comment for documentation
COMMENT ON FUNCTION public.notify_on_task_completion() IS 
'Creates notifications only when tasks are actually completed (status = completed). Prevents misleading notifications on submission for review.';
