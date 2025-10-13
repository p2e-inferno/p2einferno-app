-- Add missing foreign key indexes to user_task_progress table
-- This migration improves JOIN performance and foreign key constraint validation
-- Ref: Supabase Database Linter - Unindexed Foreign Keys Advisory

-- ============================================================================
-- Background
-- ============================================================================
-- The user_task_progress table has 4 foreign keys:
-- 1. user_profile_id → user_profiles (id)     [✓ INDEXED]
-- 2. task_id → milestone_tasks (id)           [✓ INDEXED]
-- 3. submission_id → task_submissions (id)    [✗ MISSING - fixed here]
-- 4. milestone_id → cohort_milestones (id)    [✗ MISSING - fixed here]
--
-- Missing indexes cause:
-- - Slower JOIN operations
-- - Slower foreign key constraint checks on INSERT/UPDATE
-- - Slower CASCADE operations on DELETE/UPDATE
-- ============================================================================

-- ============================================================================
-- 1. Index for submission_id foreign key
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_task_progress_submission_id
  ON public.user_task_progress(submission_id);

COMMENT ON INDEX idx_user_task_progress_submission_id IS
  'Foreign key index for user_task_progress_submission_id_fkey (references task_submissions.id). Improves JOIN performance and CASCADE operation speed.';

-- ============================================================================
-- 2. Index for milestone_id foreign key
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_task_progress_milestone_id
  ON public.user_task_progress(milestone_id);

COMMENT ON INDEX idx_user_task_progress_milestone_id IS
  'Foreign key index for user_task_progress_milestone_id_fkey (references cohort_milestones.id). Improves JOIN performance and CASCADE operation speed.';

-- ============================================================================
-- Performance Impact Summary
-- ============================================================================
-- After this migration:
-- - All foreign keys on user_task_progress are indexed (4/4 = 100%)
-- - JOIN queries involving task_submissions and cohort_milestones will be faster
-- - Foreign key constraint validation will be more efficient
-- - CASCADE DELETE/UPDATE operations will have better performance
-- ============================================================================
