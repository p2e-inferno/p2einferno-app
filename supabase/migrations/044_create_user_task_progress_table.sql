-- 044_create_user_task_progress_table.sql
-- Create table to track individual task completions

-- Create user_task_progress table
CREATE TABLE IF NOT EXISTS public.user_task_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.cohort_milestones(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.milestone_tasks(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'failed', 'expired')),
  submission_id UUID REFERENCES public.task_submissions(id),
  completed_at TIMESTAMP WITH TIME ZONE,
  reward_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_profile_id, task_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_task_progress_user_profile_id ON public.user_task_progress(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_task_progress_task_id ON public.user_task_progress(task_id);
CREATE INDEX IF NOT EXISTS idx_user_task_progress_status ON public.user_task_progress(status);

-- Enable RLS
ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own task progress" 
    ON public.user_task_progress
    FOR SELECT 
    USING (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));

CREATE POLICY "Users can create their own task progress" 
    ON public.user_task_progress
    FOR INSERT
    WITH CHECK (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));

CREATE POLICY "Users can update their own task progress" 
    ON public.user_task_progress
    FOR UPDATE
    USING (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));

CREATE POLICY "Service role can manage all task progress" 
    ON public.user_task_progress
    FOR ALL 
    USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE TRIGGER update_user_task_progress_updated_at  
BEFORE UPDATE ON user_task_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT SELECT ON public.user_task_progress TO authenticated;