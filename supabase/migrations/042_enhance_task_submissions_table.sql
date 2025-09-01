-- 042_enhance_task_submissions_table.sql
-- Enhance task_submissions table to support multiple submission types

-- Add new columns for different submission types
ALTER TABLE public.task_submissions 
ADD COLUMN IF NOT EXISTS submission_data JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS submission_type VARCHAR(50) DEFAULT 'url',
ADD COLUMN IF NOT EXISTS file_urls TEXT[],
ADD COLUMN IF NOT EXISTS submission_metadata JSONB DEFAULT '{}'::jsonb;

-- Make submission_url nullable since we now support different submission types
ALTER TABLE public.task_submissions 
ALTER COLUMN submission_url DROP NOT NULL;

-- Add index for submission type
CREATE INDEX IF NOT EXISTS idx_task_submissions_submission_type ON public.task_submissions(submission_type);