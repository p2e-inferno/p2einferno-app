-- Atomically claim a verified quest transaction and persist task completion.
-- This closes the orphaned-claim window where a tx hash could be reserved
-- even if the subsequent completion INSERT/UPDATE failed.
-- Note: p_chain_id carries a DEFAULT to satisfy PostgreSQL's rule that
-- parameters following a defaulted parameter must also declare defaults.

CREATE OR REPLACE FUNCTION public.complete_quest_task_with_tx(
  p_user_id TEXT,
  p_quest_id UUID,
  p_task_id UUID,
  p_existing_completion_id UUID DEFAULT NULL,
  p_verification_data JSONB DEFAULT NULL,
  p_submission_data JSONB DEFAULT NULL,
  p_submission_status TEXT DEFAULT 'completed',
  p_admin_feedback TEXT DEFAULT NULL,
  p_chain_id INTEGER DEFAULT NULL,
  p_tx_hash TEXT DEFAULT NULL,
  p_task_type TEXT DEFAULT NULL,
  p_verified_amount TEXT DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_log_index INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_register_result JSONB;
BEGIN
  IF p_tx_hash IS NULL OR btrim(p_tx_hash) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'kind', 'invalid_input',
      'error', 'Transaction hash is required'
    );
  END IF;

  IF p_task_type IS NULL OR btrim(p_task_type) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'kind', 'invalid_input',
      'error', 'Task type is required'
    );
  END IF;

  v_register_result := public.register_quest_transaction(
    p_tx_hash,
    p_chain_id,
    p_user_id,
    p_task_id,
    p_task_type,
    p_verified_amount,
    p_event_name,
    p_block_number,
    p_log_index
  );

  IF COALESCE((v_register_result->>'success')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'kind', 'tx_conflict',
      'error', COALESCE(
        v_register_result->>'error',
        'Transaction already used for quest verification'
      )
    );
  END IF;

  IF p_existing_completion_id IS NOT NULL THEN
    UPDATE public.user_task_completions
    SET
      verification_data = p_verification_data,
      submission_data = p_submission_data,
      submission_status = p_submission_status,
      admin_feedback = p_admin_feedback,
      reviewed_at = NULL,
      reviewed_by = NULL,
      completed_at = NOW()
    WHERE id = p_existing_completion_id
      AND user_id = p_user_id
      AND task_id = p_task_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0002',
        MESSAGE = 'Existing task completion not found';
    END IF;
  ELSE
    INSERT INTO public.user_task_completions (
      user_id,
      quest_id,
      task_id,
      verification_data,
      submission_data,
      submission_status,
      admin_feedback,
      reward_claimed
    ) VALUES (
      p_user_id,
      p_quest_id,
      p_task_id,
      p_verification_data,
      p_submission_data,
      p_submission_status,
      p_admin_feedback,
      FALSE
    );
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN SQLSTATE 'P0002' THEN
    RETURN jsonb_build_object(
      'success', false,
      'kind', 'not_found',
      'error', 'Existing task completion not found'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'kind', 'db_error',
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_quest_task_with_tx(
  TEXT,
  UUID,
  UUID,
  UUID,
  JSONB,
  JSONB,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER
) TO service_role;
