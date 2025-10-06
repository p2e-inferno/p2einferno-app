-- Complete Notification System Fix
-- Adds all missing notification triggers that align with current schema (title, message, link)
-- Ensures non-breaking compatibility with existing notification usage

-- 1) Helper function to create notifications using current schema
CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_user_profile_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.notifications (user_profile_id, title, message, link, read, created_at)
  VALUES (p_user_profile_id, p_title, p_message, p_link, false, NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Grant permissions
GRANT EXECUTE ON FUNCTION public.create_notification_v2(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
-- 2) Trigger: Task completion notifications (using user_task_completions table)
CREATE OR REPLACE FUNCTION public.notify_on_task_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_task_title TEXT;
  v_cohort_id TEXT;
  v_user_profile_id UUID;
BEGIN
  -- Only notify when a task completion is inserted (new completed task)
  IF TG_OP = 'INSERT' THEN
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
-- Create trigger for task completions
DROP TRIGGER IF EXISTS trigger_notify_on_task_completion ON public.user_task_completions;
CREATE TRIGGER trigger_notify_on_task_completion
AFTER INSERT ON public.user_task_completions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_task_completion();
-- 3) Trigger: Milestone completion notifications
CREATE OR REPLACE FUNCTION public.notify_on_milestone_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_milestone_name TEXT;
  v_cohort_id TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Get milestone name and cohort
    SELECT cm.name, cm.cohort_id
    INTO v_milestone_name, v_cohort_id
    FROM public.cohort_milestones cm
    WHERE cm.id = NEW.milestone_id;

    PERFORM public.create_notification_v2(
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
-- Create trigger for milestone progress
DROP TRIGGER IF EXISTS trigger_notify_on_milestone_progress ON public.user_milestone_progress;
CREATE TRIGGER trigger_notify_on_milestone_progress
AFTER INSERT OR UPDATE OF status ON public.user_milestone_progress
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_milestone_progress();
-- 4) Trigger: Enrollment notifications (the main fix for bootcamp enrollments)
CREATE OR REPLACE FUNCTION public.notify_on_enrollment_change()
RETURNS TRIGGER AS $$
DECLARE
  v_cohort_name TEXT;
  v_title TEXT;
  v_message TEXT;
  v_link TEXT;
BEGIN
  -- Get cohort name
  SELECT name INTO v_cohort_name 
  FROM public.cohorts 
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

  PERFORM public.create_notification_v2(
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    v_title,
    v_message,
    v_link
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
-- Create trigger for enrollment changes
DROP TRIGGER IF EXISTS trigger_notify_on_enrollment_change ON public.bootcamp_enrollments;
CREATE TRIGGER trigger_notify_on_enrollment_change
AFTER INSERT OR UPDATE OF enrollment_status ON public.bootcamp_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_enrollment_change();
-- 5) Trigger: Application status notifications
CREATE OR REPLACE FUNCTION public.notify_on_application_status()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_cohort_id TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Get cohort info from application
    SELECT a.cohort_id INTO v_cohort_id
    FROM public.applications a
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

    PERFORM public.create_notification_v2(
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
-- Create trigger for application status
DROP TRIGGER IF EXISTS trigger_notify_on_application_status ON public.user_application_status;
CREATE TRIGGER trigger_notify_on_application_status
AFTER INSERT OR UPDATE OF status ON public.user_application_status
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_application_status();
-- Add helpful comments for future reference
COMMENT ON FUNCTION public.create_notification_v2(UUID, TEXT, TEXT, TEXT) IS 
'Helper function to create notifications using current schema (title, message, link). Updated version that aligns with app expectations.';
COMMENT ON FUNCTION public.notify_on_enrollment_change() IS 
'Creates notifications when bootcamp enrollments are created or status changes. Uses current notification schema.';
COMMENT ON FUNCTION public.notify_on_task_completion() IS 
'Creates notifications when tasks are completed. Uses current notification schema.';
COMMENT ON FUNCTION public.notify_on_milestone_progress() IS 
'Creates notifications when milestones are completed. Uses current notification schema.';
COMMENT ON FUNCTION public.notify_on_application_status() IS 
'Creates notifications when application status changes. Uses current notification schema.';
