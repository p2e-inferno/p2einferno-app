-- 065_restore_user_milestone_progress_unique_constraint.sql
-- Restore the missing UNIQUE constraint on user_milestone_progress table
-- This constraint was lost during migrations 055/056 when milestone_id was converted to UUID
-- The constraint is required by the ON CONFLICT clause in update_user_milestone_progress() trigger

-- First check if any duplicate records exist and handle them
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_profile_id, milestone_id, COUNT(*) as cnt
    FROM public.user_milestone_progress
    GROUP BY user_profile_id, milestone_id
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % duplicate user_milestone_progress records. Cleaning up...', duplicate_count;

    -- Keep only the most recent record for each user_profile_id, milestone_id combination
    DELETE FROM public.user_milestone_progress
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_profile_id, milestone_id) id
      FROM public.user_milestone_progress
      ORDER BY user_profile_id, milestone_id, updated_at DESC
    );

    RAISE NOTICE 'Cleanup completed.';
  ELSE
    RAISE NOTICE 'No duplicate records found.';
  END IF;
END $$;

-- Add the missing UNIQUE constraint
-- Using ALTER TABLE ADD CONSTRAINT for clarity and explicit constraint naming
ALTER TABLE public.user_milestone_progress
ADD CONSTRAINT user_milestone_progress_user_profile_id_milestone_id_key
UNIQUE (user_profile_id, milestone_id);

-- Add a comment to document the constraint
COMMENT ON CONSTRAINT user_milestone_progress_user_profile_id_milestone_id_key
ON public.user_milestone_progress IS
'Ensures one milestone progress record per user per milestone. Required by ON CONFLICT clause in update_user_milestone_progress() trigger. This constraint was restored in migration 066 after being lost during UUID conversion in migrations 055/056.';
