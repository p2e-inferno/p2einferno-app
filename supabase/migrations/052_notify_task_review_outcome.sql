-- Notify users when admin marks a task submission as failed or needs retry
CREATE OR REPLACE FUNCTION public.notify_on_task_submission_review()
RETURNS TRIGGER AS $$
DECLARE
  v_task_title TEXT;
  v_user_profile_id UUID;
  v_milestone_id UUID;
BEGIN
  -- Only on status change
  IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Map privy user id to user_profile_id
    SELECT id INTO v_user_profile_id FROM public.user_profiles WHERE privy_user_id = NEW.user_id;
    IF v_user_profile_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get task title and milestone id
    SELECT title, milestone_id INTO v_task_title, v_milestone_id FROM public.milestone_tasks WHERE id = NEW.task_id;

    IF NEW.status = 'completed' THEN
      PERFORM public.create_notification(
        v_user_profile_id,
        'task_reviewed',
        'Task approved',
        'Your submission for ' || COALESCE(v_task_title,'the task') || ' has been approved. You can now claim your reward.',
        jsonb_build_object('task_id', NEW.task_id, 'submission_id', NEW.id, 'status', NEW.status, 'milestone_id', v_milestone_id)
      );
    ELSIF NEW.status = 'failed' OR NEW.status = 'retry' THEN
      PERFORM public.create_notification(
        v_user_profile_id,
        'task_reviewed',
        CASE WHEN NEW.status = 'failed' THEN 'Task failed' ELSE 'Task needs retry' END,
        'Your submission for ' || COALESCE(v_task_title,'the task') || ' was reviewed. Please check feedback and resubmit.',
        jsonb_build_object('task_id', NEW.task_id, 'submission_id', NEW.id, 'status', NEW.status, 'milestone_id', v_milestone_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_on_task_submission_review ON public.task_submissions;
CREATE TRIGGER trigger_notify_on_task_submission_review
AFTER UPDATE OF status ON public.task_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_task_submission_review();


