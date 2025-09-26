-- 063_restore_user_task_progress_unique_constraint.sql
-- Restore the missing unique constraint on user_task_progress table
-- This constraint is required by the ON CONFLICT clause in update_task_progress_on_submission() trigger

-- First check if any duplicate records exist and handle them
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_profile_id, task_id, COUNT(*) as cnt
    FROM public.user_task_progress
    GROUP BY user_profile_id, task_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % duplicate user_task_progress records. Cleaning up...', duplicate_count;

    -- Keep only the most recent record for each user_profile_id, task_id combination
    DELETE FROM public.user_task_progress
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_profile_id, task_id) id
      FROM public.user_task_progress
      ORDER BY user_profile_id, task_id, updated_at DESC
    );

    RAISE NOTICE 'Cleanup completed.';
  ELSE
    RAISE NOTICE 'No duplicate records found.';
  END IF;
END $$;

-- Create the unique constraint using 2025 PostgreSQL best practices
-- DROP IF EXISTS + ADD pattern ensures idempotent behavior
BEGIN;

  -- Drop constraint if it exists (safe operation)
  ALTER TABLE public.user_task_progress
  DROP CONSTRAINT IF EXISTS user_task_progress_user_profile_id_task_id_key;

  -- Add the constraint (always works after drop)
  ALTER TABLE public.user_task_progress
  ADD CONSTRAINT user_task_progress_user_profile_id_task_id_key
  UNIQUE (user_profile_id, task_id);

COMMIT;

-- Add a comment to document the constraint
COMMENT ON CONSTRAINT user_task_progress_user_profile_id_task_id_key
ON public.user_task_progress IS
'Ensures one task progress record per user per task. Required by ON CONFLICT clause in update_task_progress_on_submission() trigger.';