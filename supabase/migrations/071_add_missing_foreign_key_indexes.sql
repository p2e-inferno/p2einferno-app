-- Add missing foreign key indexes for performance optimization
-- Per Supabase advisory: Unindexed foreign keys lead to slower JOINs and constraint checks
-- Reference: docs/supabase-security-performance-advisory.md

-- These indexes improve:
-- 1. JOIN performance when querying related tables
-- 2. Foreign key constraint check speed on INSERT/UPDATE
-- 3. CASCADE operation performance on DELETE/UPDATE

-- ============================================================================
-- Missing Foreign Key Indexes
-- ============================================================================

-- 1. bootcamp_enrollments.cohort_id
CREATE INDEX IF NOT EXISTS idx_bootcamp_enrollments_cohort_id
  ON bootcamp_enrollments(cohort_id);

-- 2. cohort_milestones.prerequisite_milestone_id
CREATE INDEX IF NOT EXISTS idx_cohort_milestones_prerequisite_id
  ON cohort_milestones(prerequisite_milestone_id);

-- 3. cohorts.bootcamp_program_id
CREATE INDEX IF NOT EXISTS idx_cohorts_bootcamp_program_id
  ON cohorts(bootcamp_program_id);

-- 4. milestone_tasks.milestone_id
CREATE INDEX IF NOT EXISTS idx_milestone_tasks_milestone_id
  ON milestone_tasks(milestone_id);

-- 5. user_application_status.application_id
CREATE INDEX IF NOT EXISTS idx_user_application_status_application_id
  ON user_application_status(application_id);

-- 6. user_milestone_progress.milestone_id
CREATE INDEX IF NOT EXISTS idx_user_milestone_progress_milestone_id
  ON user_milestone_progress(milestone_id);

-- 7. user_milestones.milestone_id
CREATE INDEX IF NOT EXISTS idx_user_milestones_milestone_id
  ON user_milestones(milestone_id);

COMMENT ON INDEX idx_bootcamp_enrollments_cohort_id IS 'Foreign key index for bootcamp_enrollments_cohort_id_fkey';
COMMENT ON INDEX idx_cohort_milestones_prerequisite_id IS 'Foreign key index for cohort_milestones_prerequisite_milestone_id_fkey';
COMMENT ON INDEX idx_cohorts_bootcamp_program_id IS 'Foreign key index for cohorts_bootcamp_program_id_fkey';
COMMENT ON INDEX idx_milestone_tasks_milestone_id IS 'Foreign key index for milestone_tasks_milestone_id_fkey';
COMMENT ON INDEX idx_user_application_status_application_id IS 'Foreign key index for user_application_status_application_id_fkey';
COMMENT ON INDEX idx_user_milestone_progress_milestone_id IS 'Foreign key index for user_milestone_progress_milestone_id_fkey';
COMMENT ON INDEX idx_user_milestones_milestone_id IS 'Foreign key index for user_milestones_milestone_id_fkey';
