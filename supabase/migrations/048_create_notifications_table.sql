-- 048_create_notifications_table.sql
-- Create notifications table, RLS, indexes, and triggers to generate notifications

-- Ensure uuid extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title TEXT,
  body TEXT,
  type VARCHAR(50), -- e.g. task_completed, milestone_completed, application_status, enrollment_status
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_profile_id ON public.notifications(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies
DO $$
BEGIN
  -- Drop if they exist to avoid conflicts on re-run
  DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
  DROP POLICY IF EXISTS "Users can read their notifications" ON public.notifications;
END $$;

CREATE POLICY "Service role can manage all notifications"
ON public.notifications FOR ALL
USING (auth.role() = 'service_role');

-- If non-admin clients ever need to read notifications
CREATE POLICY "Users can read their notifications"
ON public.notifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = user_profile_id
      AND up.privy_user_id = auth.uid()::text
  )
);

-- 2) Helper function to insert a notification
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.notifications (user_profile_id, type, title, body, metadata)
  VALUES (p_user_profile_id, p_type, p_title, p_body, COALESCE(p_metadata, '{}'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- 3) Trigger: on user_task_progress changes → notify task completion
CREATE OR REPLACE FUNCTION public.notify_on_task_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_task_title TEXT;
BEGIN
  -- Only notify when a task is marked completed (insert or update)
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' THEN
    SELECT title INTO v_task_title FROM public.milestone_tasks WHERE id = NEW.task_id;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'task_completed',
      'Task completed',
      COALESCE(v_task_title, 'A task') || ' has been completed.',
      jsonb_build_object('task_id', NEW.task_id, 'milestone_id', NEW.milestone_id, 'completed_at', NEW.completed_at)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_on_task_progress ON public.user_task_progress;
CREATE TRIGGER trigger_notify_on_task_progress
AFTER INSERT OR UPDATE OF status ON public.user_task_progress
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_task_progress();

-- 4) Trigger: on user_milestone_progress completion → notify milestone completion
CREATE OR REPLACE FUNCTION public.notify_on_milestone_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_milestone_name TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT name INTO v_milestone_name FROM public.cohort_milestones WHERE id = NEW.milestone_id;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'milestone_completed',
      'Milestone completed',
      'You have completed milestone ' || COALESCE(v_milestone_name, ''),
      jsonb_build_object('milestone_id', NEW.milestone_id, 'progress', NEW.progress_percentage, 'completed_at', NEW.completed_at)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_on_milestone_progress ON public.user_milestone_progress;
CREATE TRIGGER trigger_notify_on_milestone_progress
AFTER INSERT OR UPDATE OF status ON public.user_milestone_progress
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_milestone_progress();

-- 5) Trigger: on bootcamp_enrollments changes → notify enroll/complete
CREATE OR REPLACE FUNCTION public.notify_on_enrollment_change()
RETURNS TRIGGER AS $$
DECLARE
  v_cohort_name TEXT;
  v_event TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  SELECT name INTO v_cohort_name FROM public.cohorts WHERE id = COALESCE(NEW.cohort_id, OLD.cohort_id);

  IF TG_OP = 'INSERT' THEN
    v_event := 'enrollment_created';
    v_title := 'Enrolled in bootcamp';
    v_body := 'You have been enrolled in cohort ' || COALESCE(v_cohort_name, '');
  ELSIF TG_OP = 'UPDATE' AND (OLD.enrollment_status IS DISTINCT FROM NEW.enrollment_status) THEN
    v_event := 'enrollment_status';
    v_title := 'Enrollment status updated';
    v_body := 'Your enrollment status is now ' || NEW.enrollment_status || ' for cohort ' || COALESCE(v_cohort_name, '');
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.create_notification(
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    v_event,
    v_title,
    v_body,
    jsonb_build_object('cohort_id', COALESCE(NEW.cohort_id, OLD.cohort_id), 'status', COALESCE(NEW.enrollment_status, OLD.enrollment_status))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_on_enrollment_change ON public.bootcamp_enrollments;
CREATE TRIGGER trigger_notify_on_enrollment_change
AFTER INSERT OR UPDATE OF enrollment_status ON public.bootcamp_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_enrollment_change();

-- 6) Trigger: on user_application_status update → notify application status changes
CREATE OR REPLACE FUNCTION public.notify_on_application_status()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    v_title := 'Application status updated';
    v_body := 'Your application status is now ' || NEW.status;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'application_status',
      v_title,
      v_body,
      jsonb_build_object('application_id', NEW.application_id, 'status', NEW.status)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notify_on_application_status ON public.user_application_status;
CREATE TRIGGER trigger_notify_on_application_status
AFTER INSERT OR UPDATE OF status ON public.user_application_status
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_application_status();


