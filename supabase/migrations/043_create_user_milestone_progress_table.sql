-- 043_create_user_milestone_progress_table.sql
-- Create table to track user progress through milestones

-- Create user_milestone_progress table
CREATE TABLE IF NOT EXISTS public.user_milestone_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  milestone_id UUID NOT NULL REFERENCES public.cohort_milestones(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'expired')),
  tasks_completed INTEGER DEFAULT 0,
  total_tasks INTEGER DEFAULT 0,
  progress_percentage DECIMAL(5,2) DEFAULT 0.00,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  reward_claimed BOOLEAN DEFAULT false,
  reward_amount INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_profile_id, milestone_id)
);
-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_milestone_progress_user_profile_id ON public.user_milestone_progress(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_milestone_progress_milestone_id ON public.user_milestone_progress(milestone_id);
CREATE INDEX IF NOT EXISTS idx_user_milestone_progress_status ON public.user_milestone_progress(status);
-- Enable RLS
ALTER TABLE public.user_milestone_progress ENABLE ROW LEVEL SECURITY;
-- RLS Policies
CREATE POLICY "Users can view their own milestone progress" 
    ON public.user_milestone_progress
    FOR SELECT 
    USING (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));
CREATE POLICY "Users can create their own milestone progress" 
    ON public.user_milestone_progress
    FOR INSERT
    WITH CHECK (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));
CREATE POLICY "Users can update their own milestone progress" 
    ON public.user_milestone_progress
    FOR UPDATE
    USING (user_profile_id IN (
      SELECT id FROM public.user_profiles WHERE privy_user_id = auth.uid()::text
    ));
CREATE POLICY "Service role can manage all milestone progress" 
    ON public.user_milestone_progress
    FOR ALL 
    USING (auth.role() = 'service_role');
-- Add updated_at trigger
CREATE TRIGGER update_user_milestone_progress_updated_at
BEFORE UPDATE ON user_milestone_progress
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
-- Grant permissions
GRANT SELECT ON public.user_milestone_progress TO authenticated;
