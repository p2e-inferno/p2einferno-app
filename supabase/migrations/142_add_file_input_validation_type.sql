-- Add 'file' to input_validation check constraint for quest tasks
-- This enables file upload support for submit_proof task type

-- Drop the existing constraint
ALTER TABLE public.quest_tasks
DROP CONSTRAINT IF EXISTS quest_tasks_input_validation_check;

-- Add the new constraint with 'file' included
ALTER TABLE public.quest_tasks
ADD CONSTRAINT quest_tasks_input_validation_check
CHECK (input_validation IN ('url', 'text', 'email', 'number', 'textarea', 'file'));
