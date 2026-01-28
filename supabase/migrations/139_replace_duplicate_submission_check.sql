-- Migration 139: Replace check_duplicate_submission with check_single_submission_per_user_task
-- Purpose: Sync remote with local - local uses a more flexible implementation
-- Related: Original migration 053_cleanup_duplicate_submissions.sql
-- Feature: Prevents duplicate task submissions with better error handling

-- Note: Remote currently has check_duplicate_submission() (recreated in migration 074)
-- Local has check_single_submission_per_user_task() which provides better UX

-- Drop the old trigger and function
DROP TRIGGER IF EXISTS prevent_duplicate_submissions ON public.task_submissions;
DROP FUNCTION IF EXISTS check_duplicate_submission();

-- Create updated function to ensure only one submission per user per task
-- This allows updating existing submissions but prevents multiple entries
CREATE OR REPLACE FUNCTION check_single_submission_per_user_task()
RETURNS TRIGGER
SET search_path = pg_catalog, public
AS $$
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

-- Ensure the unique index exists (should already be there from migration 053)
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_submissions_user_task_unique
ON public.task_submissions(task_id, user_id);

-- Add helpful comments
COMMENT ON FUNCTION check_single_submission_per_user_task() IS
    'Ensures one submission per user per task. Provides clear error messages for duplicate attempts. Secured with fixed search_path.';

COMMENT ON INDEX idx_task_submissions_user_task_unique IS
    'Ensures one submission per user per task. Users can only have one submission record per task, which gets updated for resubmissions.';
