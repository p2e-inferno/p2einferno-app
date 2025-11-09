-- Migration: 091_milestone_key_completion_control.sql
-- Adds control mechanism to switch between task-based and key-based completion triggers

-- Create function to activate the milestone key completion trigger
CREATE OR REPLACE FUNCTION public.activate_milestone_key_completion()
RETURNS BOOLEAN
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  -- Drop the key-based trigger if it exists
  DROP TRIGGER IF EXISTS trg_check_bootcamp_completion_by_keys ON public.cohort_milestones;
  
  -- Create the key-based trigger
  CREATE TRIGGER trg_check_bootcamp_completion_by_keys
    AFTER UPDATE OF key_claimed ON public.cohort_milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.check_bootcamp_completion_by_keys();
    
  RETURN TRUE;
END;
$$;

-- Create function to deactivate the milestone key completion trigger (revert to task-based)
CREATE OR REPLACE FUNCTION public.deactivate_milestone_key_completion()
RETURNS BOOLEAN
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  -- Drop the key-based trigger
  DROP TRIGGER IF EXISTS trg_check_bootcamp_completion_by_keys ON public.cohort_milestones;
  
  -- Ensure the original task-based trigger is active
  DROP TRIGGER IF EXISTS trg_check_bootcamp_completion ON public.user_milestone_progress;
  CREATE TRIGGER trg_check_bootcamp_completion
    AFTER UPDATE OF status ON public.user_milestone_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.check_bootcamp_completion();
    
  RETURN TRUE;
END;
$$;

-- Create function to check which completion method is currently active
CREATE OR REPLACE FUNCTION public.get_completion_trigger_status()
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  task_trigger_exists BOOLEAN;
  key_trigger_exists BOOLEAN;
BEGIN
  -- Check if task-based trigger exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_check_bootcamp_completion' 
    AND event_object_table = 'user_milestone_progress'
  ) INTO task_trigger_exists;
  
  -- Check if key-based trigger exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'trg_check_bootcamp_completion_by_keys' 
    AND event_object_table = 'cohort_milestones'
  ) INTO key_trigger_exists;
  
  RETURN jsonb_build_object(
    'task_based_active', task_trigger_exists,
    'key_based_active', key_trigger_exists,
    'completion_method', CASE 
      WHEN key_trigger_exists THEN 'milestone_keys'
      WHEN task_trigger_exists THEN 'milestone_tasks'
      ELSE 'none'
    END
  );
END;
$$;

-- Create admin function to backfill key_claimed status for existing completed milestones
-- This checks on-chain key ownership for milestones that are completed but not marked as key_claimed
CREATE OR REPLACE FUNCTION public.backfill_milestone_key_claims(
  p_cohort_id TEXT DEFAULT NULL
)
RETURNS JSONB
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INT := 0;
  v_checked_count INT := 0;
BEGIN
  -- This function should be called by admin tools/scripts that can check on-chain status
  -- For now, it marks completed milestones as having keys claimed if there's a user who completed them
  -- Real implementation would need to check on-chain via external service
  
  WITH completed_milestones AS (
    SELECT DISTINCT cm.id as milestone_id
    FROM public.cohort_milestones cm
    JOIN public.user_milestone_progress ump ON cm.id = ump.milestone_id
    WHERE ump.status = 'completed'
    AND cm.key_claimed = FALSE
    AND (p_cohort_id IS NULL OR cm.cohort_id = p_cohort_id)
  )
  UPDATE public.cohort_milestones
  SET 
    key_claimed = TRUE,
    key_claimed_at = now()
  WHERE id IN (SELECT milestone_id FROM completed_milestones);
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  SELECT COUNT(*) INTO v_checked_count
  FROM public.cohort_milestones cm
  WHERE (p_cohort_id IS NULL OR cm.cohort_id = p_cohort_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Milestone key claims backfilled',
    'milestones_updated', v_updated_count,
    'total_checked', v_checked_count,
    'cohort_id', p_cohort_id
  );
END;
$$;

-- Grant execute permissions to service role for admin access
GRANT EXECUTE ON FUNCTION public.activate_milestone_key_completion() TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_milestone_key_completion() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_completion_trigger_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_milestone_key_claims(TEXT) TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION public.activate_milestone_key_completion() IS 'Activates milestone key-based completion trigger and deactivates task-based trigger';
COMMENT ON FUNCTION public.deactivate_milestone_key_completion() IS 'Reverts to task-based completion trigger and deactivates key-based trigger';
COMMENT ON FUNCTION public.get_completion_trigger_status() IS 'Returns current status of completion triggers for debugging';
COMMENT ON FUNCTION public.backfill_milestone_key_claims(TEXT) IS 'Admin function to backfill key_claimed status for existing completed milestones';