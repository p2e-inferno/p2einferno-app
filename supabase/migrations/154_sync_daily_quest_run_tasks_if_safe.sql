-- Atomic function to sync today's active run tasks with the latest template tasks.
-- Guards against syncing when users have already started or completed tasks.
-- Returns a JSONB status object matching the TS-side { attempted, status } shape.

CREATE OR REPLACE FUNCTION public.sync_daily_quest_run_tasks_if_safe(
  p_template_id uuid
)
RETURNS jsonb
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id uuid;
  v_today date := current_date;
  v_inserted int;
BEGIN
  -- 1. Find today's active run for this template
  SELECT id INTO v_run_id
  FROM daily_quest_runs
  WHERE daily_quest_template_id = p_template_id
    AND run_date = v_today
    AND status = 'active';

  IF v_run_id IS NULL THEN
    RETURN jsonb_build_object('attempted', false, 'status', 'no_active_run');
  END IF;

  -- 2. Guard: any recorded task completions? (snapshot must be preserved)
  IF EXISTS (
    SELECT 1 FROM user_daily_task_completions
    WHERE daily_quest_run_id = v_run_id LIMIT 1
  ) THEN
    RETURN jsonb_build_object('attempted', true, 'status', 'skipped_existing_completions');
  END IF;

  -- 3. Guard: any progress rows? (user started the run but may not have completed tasks yet)
  IF EXISTS (
    SELECT 1 FROM user_daily_quest_progress
    WHERE daily_quest_run_id = v_run_id LIMIT 1
  ) THEN
    RETURN jsonb_build_object('attempted', true, 'status', 'skipped_progress_exists');
  END IF;

  -- 4. Atomic swap: delete old run tasks then insert from current template
  DELETE FROM daily_quest_run_tasks WHERE daily_quest_run_id = v_run_id;

  INSERT INTO daily_quest_run_tasks (
    daily_quest_run_id, daily_quest_template_task_id,
    title, description, task_type, verification_method,
    reward_amount, order_index, task_config,
    input_required, input_label, input_placeholder,
    input_validation, requires_admin_review
  )
  SELECT
    v_run_id, t.id,
    t.title, t.description, t.task_type, t.verification_method,
    t.reward_amount, t.order_index, COALESCE(t.task_config, '{}'::jsonb),
    COALESCE(t.input_required, false), t.input_label, t.input_placeholder,
    t.input_validation, COALESCE(t.requires_admin_review, false)
  FROM daily_quest_tasks t
  WHERE t.daily_quest_template_id = p_template_id
  ORDER BY t.order_index;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('attempted', true, 'status', 'synced_empty');
  END IF;

  RETURN jsonb_build_object('attempted', true, 'status', 'synced');
END;
$$;
