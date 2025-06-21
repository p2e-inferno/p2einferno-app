-- Create milestone_tasks table
CREATE TABLE IF NOT EXISTS public.milestone_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES public.cohort_milestones(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reward_amount INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task_submissions table
CREATE TABLE IF NOT EXISTS public.task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.milestone_tasks(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  submission_url TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'retry')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by VARCHAR(255),
  feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create program_highlights table
CREATE TABLE IF NOT EXISTS public.program_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create program_requirements table
CREATE TABLE IF NOT EXISTS public.program_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add duration_hours and total_reward to cohort_milestones
ALTER TABLE public.cohort_milestones
ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_reward INTEGER DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX idx_milestone_tasks_milestone_id ON public.milestone_tasks(milestone_id);
CREATE INDEX idx_task_submissions_task_id ON public.task_submissions(task_id);
CREATE INDEX idx_task_submissions_user_id ON public.task_submissions(user_id);
CREATE INDEX idx_task_submissions_status ON public.task_submissions(status);
CREATE INDEX idx_program_highlights_cohort_id ON public.program_highlights(cohort_id);
CREATE INDEX idx_program_requirements_cohort_id ON public.program_requirements(cohort_id);

-- Enable RLS on new tables
ALTER TABLE public.milestone_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for milestone_tasks
CREATE POLICY "Authenticated users can read milestone tasks" 
    ON public.milestone_tasks
    FOR SELECT 
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage milestone tasks" 
    ON public.milestone_tasks
    FOR ALL
    USING (auth.role() = 'authenticated');

-- RLS Policies for task_submissions
CREATE POLICY "Users can read their own submissions" 
    ON public.task_submissions
    FOR SELECT 
    USING (auth.role() = 'authenticated' AND (user_id = auth.uid()::text OR auth.role() = 'service_role'));

CREATE POLICY "Users can create their own submissions" 
    ON public.task_submissions
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid()::text);

CREATE POLICY "Authenticated users can update submissions" 
    ON public.task_submissions
    FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage all submissions" 
    ON public.task_submissions
    FOR ALL 
    USING (auth.role() = 'service_role');

-- RLS Policies for program_highlights
CREATE POLICY "Public can read program highlights" 
    ON public.program_highlights
    FOR SELECT 
    USING (true);

CREATE POLICY "Authenticated users can manage highlights" 
    ON public.program_highlights
    FOR ALL
    USING (auth.role() = 'authenticated');

-- RLS Policies for program_requirements
CREATE POLICY "Public can read program requirements" 
    ON public.program_requirements
    FOR SELECT 
    USING (true);

CREATE POLICY "Authenticated users can manage requirements" 
    ON public.program_requirements
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Create function to update total_reward when tasks change
CREATE OR REPLACE FUNCTION update_milestone_total_reward()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cohort_milestones
  SET total_reward = (
    SELECT COALESCE(SUM(reward_amount), 0)
    FROM milestone_tasks
    WHERE milestone_id = COALESCE(NEW.milestone_id, OLD.milestone_id)
  )
  WHERE id = COALESCE(NEW.milestone_id, OLD.milestone_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update total_reward
CREATE TRIGGER update_milestone_reward_on_task_change
AFTER INSERT OR UPDATE OR DELETE ON milestone_tasks
FOR EACH ROW
EXECUTE FUNCTION update_milestone_total_reward();

-- Create function to prevent duplicate submissions
CREATE OR REPLACE FUNCTION check_duplicate_submission()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_submissions
    WHERE task_id = NEW.task_id 
    AND user_id = NEW.user_id 
    AND status IN ('pending', 'completed')
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'User already has a pending or completed submission for this task';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to prevent duplicate submissions
CREATE TRIGGER prevent_duplicate_submissions
BEFORE INSERT OR UPDATE ON task_submissions
FOR EACH ROW
EXECUTE FUNCTION check_duplicate_submission();