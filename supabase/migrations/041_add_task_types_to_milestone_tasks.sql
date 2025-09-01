-- 041_add_task_types_to_milestone_tasks.sql
-- Add task types and submission requirements to milestone_tasks table

-- Add task type column to milestone_tasks
ALTER TABLE public.milestone_tasks 
ADD COLUMN IF NOT EXISTS task_type VARCHAR(50) NOT NULL DEFAULT 'url_submission' 
CHECK (task_type IN ('file_upload', 'url_submission', 'contract_interaction', 'text_submission', 'external_verification'));

-- Add submission requirements and validation fields
ALTER TABLE public.milestone_tasks 
ADD COLUMN IF NOT EXISTS submission_requirements JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS validation_criteria JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN DEFAULT true;

-- Add index for task type
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_task_type ON public.milestone_tasks(task_type);