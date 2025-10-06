-- Create cohort_managers table to track who can manage cohorts
CREATE TABLE IF NOT EXISTS public.cohort_managers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  cohort_id TEXT REFERENCES public.cohorts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  -- Each user can only be a manager for a cohort once
  UNIQUE(user_profile_id, cohort_id)
);
-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_cohort_managers_updated_at ON public.cohort_managers;
CREATE TRIGGER update_cohort_managers_updated_at 
  BEFORE UPDATE ON public.cohort_managers 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Enable Row Level Security
ALTER TABLE public.cohort_managers ENABLE ROW LEVEL SECURITY;
-- Create RLS policies for cohort_managers
CREATE POLICY "Authenticated users can view cohort managers" 
  ON public.cohort_managers
  FOR SELECT 
  USING (auth.role() = 'authenticated');
CREATE POLICY "Service role can manage cohort managers" 
  ON public.cohort_managers
  FOR ALL 
  USING (auth.role() = 'service_role');
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cohort_managers_user_profile_id ON public.cohort_managers(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_cohort_managers_cohort_id ON public.cohort_managers(cohort_id);
-- Grant permissions
GRANT SELECT ON public.cohort_managers TO authenticated;
