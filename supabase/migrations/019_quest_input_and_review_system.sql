-- Add input fields and review system to quests
-- This migration adds support for input-based tasks and admin review functionality

-- Add input configuration columns to quest_tasks
ALTER TABLE public.quest_tasks 
ADD COLUMN IF NOT EXISTS input_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS input_label TEXT,
ADD COLUMN IF NOT EXISTS input_placeholder TEXT,
ADD COLUMN IF NOT EXISTS input_validation TEXT CHECK (input_validation IN ('url', 'text', 'email', 'number', 'textarea')),
ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN DEFAULT false;

-- Update task_type constraint to include new types
ALTER TABLE public.quest_tasks DROP CONSTRAINT IF EXISTS quest_tasks_task_type_check;
ALTER TABLE public.quest_tasks ADD CONSTRAINT quest_tasks_task_type_check 
CHECK (task_type IN (
  'link_email', 
  'link_wallet', 
  'link_farcaster', 
  'sign_tos', 
  'submit_url', 
  'submit_text', 
  'submit_proof', 
  'complete_external', 
  'custom'
));

-- Add submission status and review fields to user_task_completions
ALTER TABLE public.user_task_completions 
ADD COLUMN IF NOT EXISTS submission_status TEXT DEFAULT 'pending' 
  CHECK (submission_status IN ('pending', 'completed', 'failed', 'retry')),
ADD COLUMN IF NOT EXISTS submission_data JSONB,
ADD COLUMN IF NOT EXISTS admin_feedback TEXT,
ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster submission queries
CREATE INDEX IF NOT EXISTS idx_user_task_completions_status 
ON public.user_task_completions(submission_status);

CREATE INDEX IF NOT EXISTS idx_user_task_completions_quest_status 
ON public.user_task_completions(quest_id, submission_status);

-- Update the existing user_task_completions table structure
-- First, we need to fix the table structure to remove quest_progress_id dependency
-- and link directly to quest_id
DO $$
BEGIN
    -- Check if quest_progress_id column exists and quest_id doesn't
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_task_completions' 
        AND column_name = 'quest_progress_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_task_completions' 
        AND column_name = 'quest_id'
    ) THEN
        -- Add quest_id column
        ALTER TABLE public.user_task_completions 
        ADD COLUMN quest_id UUID REFERENCES public.quests(id) ON DELETE CASCADE;
        
        -- Migrate data from quest_progress_id to quest_id
        UPDATE public.user_task_completions utc
        SET quest_id = uqp.quest_id
        FROM public.user_quest_progress uqp
        WHERE utc.quest_progress_id = uqp.id;
        
        -- Drop the foreign key constraint if it exists
        ALTER TABLE public.user_task_completions 
        DROP CONSTRAINT IF EXISTS user_task_completions_quest_progress_id_fkey;
        
        -- Drop the quest_progress_id column
        ALTER TABLE public.user_task_completions 
        DROP COLUMN IF EXISTS quest_progress_id;
    END IF;
END $$;

-- Ensure quest_id is not null
ALTER TABLE public.user_task_completions 
ALTER COLUMN quest_id SET NOT NULL;

-- Update user_quest_progress to track completed tasks accurately
ALTER TABLE public.user_quest_progress
ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- Create a function to recalculate quest progress
CREATE OR REPLACE FUNCTION recalculate_quest_progress(p_user_id TEXT, p_quest_id UUID)
RETURNS void AS $$
DECLARE
    v_total_tasks INTEGER;
    v_completed_tasks INTEGER;
BEGIN
    -- Get total number of tasks for the quest
    SELECT COUNT(*) INTO v_total_tasks
    FROM public.quest_tasks
    WHERE quest_id = p_quest_id;
    
    -- Get number of completed tasks (only count 'completed' status)
    SELECT COUNT(*) INTO v_completed_tasks
    FROM public.user_task_completions
    WHERE user_id = p_user_id 
    AND quest_id = p_quest_id
    AND submission_status = 'completed';
    
    -- Update the progress
    UPDATE public.user_quest_progress
    SET 
        tasks_completed = v_completed_tasks,
        is_completed = (v_completed_tasks >= v_total_tasks AND v_total_tasks > 0),
        updated_at = NOW()
    WHERE user_id = p_user_id AND quest_id = p_quest_id;
    
    -- If no progress record exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.user_quest_progress (user_id, quest_id, tasks_completed, is_completed)
        VALUES (p_user_id, p_quest_id, v_completed_tasks, (v_completed_tasks >= v_total_tasks AND v_total_tasks > 0));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update progress when task completion status changes
CREATE OR REPLACE FUNCTION update_quest_progress_on_task_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate progress for the affected user and quest
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM recalculate_quest_progress(NEW.user_id, NEW.quest_id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM recalculate_quest_progress(OLD.user_id, OLD.quest_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_quest_progress ON public.user_task_completions;
CREATE TRIGGER trigger_update_quest_progress
AFTER INSERT OR UPDATE OF submission_status OR DELETE ON public.user_task_completions
FOR EACH ROW
EXECUTE FUNCTION update_quest_progress_on_task_change();

-- Create RLS policies for admin access to review submissions
CREATE POLICY "Admins can view all task completions" ON public.user_task_completions
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid()::text = user_id);

CREATE POLICY "Admins can update task completion status" ON public.user_task_completions
    FOR UPDATE
    USING (auth.jwt() ->> 'role' = 'admin')
    WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Create a view for quest statistics
CREATE OR REPLACE VIEW quest_statistics AS
SELECT 
    q.id as quest_id,
    q.title as quest_title,
    COUNT(DISTINCT uqp.user_id) as total_users,
    COUNT(DISTINCT CASE WHEN uqp.is_completed THEN uqp.user_id END) as completed_users,
    COUNT(DISTINCT utc.id) as total_submissions,
    COUNT(DISTINCT CASE WHEN utc.submission_status = 'pending' THEN utc.id END) as pending_submissions,
    COUNT(DISTINCT CASE WHEN utc.submission_status = 'completed' THEN utc.id END) as completed_submissions,
    COUNT(DISTINCT CASE WHEN utc.submission_status = 'failed' THEN utc.id END) as failed_submissions,
    CASE 
        WHEN COUNT(DISTINCT uqp.user_id) > 0 
        THEN ROUND((COUNT(DISTINCT CASE WHEN uqp.is_completed THEN uqp.user_id END)::NUMERIC / COUNT(DISTINCT uqp.user_id)) * 100, 2)
        ELSE 0
    END as completion_rate
FROM public.quests q
LEFT JOIN public.user_quest_progress uqp ON q.id = uqp.quest_id
LEFT JOIN public.user_task_completions utc ON q.id = utc.quest_id
GROUP BY q.id, q.title;

-- Grant access to the view
GRANT SELECT ON quest_statistics TO authenticated;