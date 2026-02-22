-- Enforce case-insensitive uniqueness and normalized registration for quest tx hashes

-- 1) Replace case-sensitive uniqueness with case-insensitive uniqueness
ALTER TABLE public.quest_verified_transactions
DROP CONSTRAINT IF EXISTS unique_quest_tx_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quest_verified_tx_hash_lower_unique
ON public.quest_verified_transactions (lower(transaction_hash));

DROP INDEX IF EXISTS public.idx_quest_verified_tx_hash;

-- 2) Update registration function to read/write normalized hashes
CREATE OR REPLACE FUNCTION public.register_quest_transaction(
  p_tx_hash TEXT,
  p_chain_id INTEGER,
  p_user_id TEXT,
  p_task_id UUID,
  p_task_type TEXT,
  p_verified_amount TEXT DEFAULT NULL,
  p_event_name TEXT DEFAULT NULL,
  p_block_number BIGINT DEFAULT NULL,
  p_log_index INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing RECORD;
  v_tx_hash_normalized TEXT;
BEGIN
  v_tx_hash_normalized := lower(trim(p_tx_hash));

  SELECT * INTO v_existing
  FROM public.quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    IF v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification',
      'existing_task_id', v_existing.task_id,
      'existing_task_type', v_existing.task_type
    );
  END IF;

  INSERT INTO public.quest_verified_transactions (
    transaction_hash,
    chain_id,
    user_id,
    task_id,
    task_type,
    verified_amount,
    event_name,
    block_number,
    log_index
  ) VALUES (
    v_tx_hash_normalized,
    p_chain_id,
    p_user_id,
    p_task_id,
    p_task_type,
    p_verified_amount,
    p_event_name,
    p_block_number,
    p_log_index
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_registered', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.quest_verified_transactions
    WHERE lower(transaction_hash) = v_tx_hash_normalized;

    IF FOUND AND v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification (concurrent)'
    );
END;
$$;
