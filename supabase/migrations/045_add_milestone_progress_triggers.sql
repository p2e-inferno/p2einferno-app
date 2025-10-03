-- 045_add_milestone_progress_triggers.sql
-- Add triggers and functions to automatically update milestone progress

-- Create function to update milestone progress when task progress changes
CREATE OR REPLACE FUNCTION update_user_milestone_progress()
RETURNS TRIGGER AS $$
DECLARE
  milestone_record RECORD;
  total_tasks_count INTEGER;
  completed_tasks_count INTEGER;
  new_progress_percentage DECIMAL(5,2);
  total_reward INTEGER;
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
    CASE WHEN completed_tasks_count > 0 THEN NOW() ELSE NULL END,
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
-- Create trigger to update milestone progress when task progress changes
CREATE TRIGGER update_milestone_progress_on_task_change
AFTER INSERT OR UPDATE OR DELETE ON user_task_progress
FOR EACH ROW
EXECUTE FUNCTION update_user_milestone_progress();
-- Create function to update task progress when submission status changes
CREATE OR REPLACE FUNCTION update_task_progress_on_submission()
RETURNS TRIGGER AS $$
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
-- Create trigger to update task progress when submission changes
CREATE TRIGGER update_task_progress_on_submission_change
AFTER INSERT OR UPDATE ON task_submissions
FOR EACH ROW
EXECUTE FUNCTION update_task_progress_on_submission();
