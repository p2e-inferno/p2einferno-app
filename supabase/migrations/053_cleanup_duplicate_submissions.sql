-- 053_cleanup_duplicate_submissions.sql
-- Clean up existing duplicate task submissions before enforcing unique constraint

-- First, let's create a temporary table to identify duplicates
CREATE TEMP TABLE duplicate_submissions AS
SELECT 
    task_id,
    user_id,
    array_agg(id ORDER BY submitted_at DESC) as submission_ids,
    count(*) as submission_count
FROM task_submissions
GROUP BY task_id, user_id
HAVING count(*) > 1;

-- For each duplicate group, keep only the most recent submission (first in the array)
-- and delete the older ones
DO $$
DECLARE
    dup_record RECORD;
    id_to_delete UUID;
BEGIN
    FOR dup_record IN SELECT * FROM duplicate_submissions LOOP
        -- Delete all but the first (most recent) submission
        FOR i IN 2..array_length(dup_record.submission_ids, 1) LOOP
            id_to_delete := dup_record.submission_ids[i];
            DELETE FROM task_submissions WHERE id = id_to_delete;
            RAISE NOTICE 'Deleted duplicate submission: % for task: % user: %', 
                id_to_delete, dup_record.task_id, dup_record.user_id;
        END LOOP;
    END LOOP;
END $$;

-- Drop the existing trigger and function that prevented duplicates
DROP TRIGGER IF EXISTS prevent_duplicate_submissions ON public.task_submissions;
DROP FUNCTION IF EXISTS check_duplicate_submission();

-- Create updated function to ensure only one submission per user per task
-- This allows updating existing submissions but prevents multiple entries
CREATE OR REPLACE FUNCTION check_single_submission_per_user_task()
RETURNS TRIGGER AS $$
BEGIN
  -- For INSERT operations, check if user already has any submission for this task
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM task_submissions
      WHERE task_id = NEW.task_id 
      AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'User already has a submission for this task. Use UPDATE instead of INSERT.';
    END IF;
  END IF;
  
  -- For UPDATE operations, ensure we're not changing task_id or user_id to create duplicates
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.task_id != NEW.task_id OR OLD.user_id != NEW.user_id) THEN
      IF EXISTS (
        SELECT 1 FROM task_submissions
        WHERE task_id = NEW.task_id 
        AND user_id = NEW.user_id
        AND id != NEW.id
      ) THEN
        RAISE EXCEPTION 'Cannot change task_id or user_id: would create duplicate submission';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create new trigger with updated function
CREATE TRIGGER ensure_single_submission_per_user_task
BEFORE INSERT OR UPDATE ON task_submissions
FOR EACH ROW
EXECUTE FUNCTION check_single_submission_per_user_task();

-- Now add the unique index to enforce one submission per user per task at database level
-- This will prevent any potential race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_submissions_user_task_unique 
ON public.task_submissions(task_id, user_id);

-- Add a comment to document the constraint
COMMENT ON INDEX idx_task_submissions_user_task_unique IS 
'Ensures one submission per user per task. Users can only have one submission record per task, which gets updated for resubmissions.';
