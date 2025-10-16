-- 084_reconcile_milestone_progress.sql
-- Reconcile milestone progress for pre-migration-079 task submissions
--
-- Context: Migration 079 added search_path security to trigger functions that
-- automatically update user_task_progress and user_milestone_progress when
-- task submissions are created or updated. However, these triggers only fire
-- on new changes, not retroactively on existing data.
--
-- This migration touches existing task_submissions to fire the triggers and
-- recalculate progress for users who completed tasks before migration 079.
--
-- The triggers will:
-- 1. update_task_progress_on_submission_change -> updates user_task_progress
-- 2. update_milestone_progress_on_task_change -> recalculates user_milestone_progress
--
-- The recalculation is complete (not incremental), so it will correctly compute
-- progress even for old data.

DO $$
DECLARE
  v_submissions_count INT;
  v_start_time TIMESTAMPTZ;
  v_duration INTERVAL;
BEGIN
  v_start_time := clock_timestamp();

  RAISE NOTICE 'Starting milestone progress reconciliation...';

  -- Touch all existing task submissions to fire the triggers
  -- This will recalculate user_task_progress and user_milestone_progress
  -- Filter by date to only process submissions created before migration 079
  UPDATE public.task_submissions
  SET updated_at = NOW()
  WHERE updated_at < '2025-01-16'::timestamptz; -- Before migration 079 was applied

  GET DIAGNOSTICS v_submissions_count = ROW_COUNT;

  v_duration := clock_timestamp() - v_start_time;

  RAISE NOTICE 'Reconciliation complete:';
  RAISE NOTICE '  - Task submissions processed: %', v_submissions_count;
  RAISE NOTICE '  - Duration: %', v_duration;
  RAISE NOTICE '  - Triggers fired: update_task_progress_on_submission_change -> update_milestone_progress_on_task_change';
END $$;
