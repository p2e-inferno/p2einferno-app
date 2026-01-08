-- Add task_config for quest tasks and prevent tx replay for quest verification

-- 1) Add task_config to quest_tasks
ALTER TABLE public.quest_tasks
ADD COLUMN IF NOT EXISTS task_config JSONB DEFAULT '{}';

COMMENT ON COLUMN public.quest_tasks.task_config IS
'Flexible per-task configuration (e.g., vendor required_amount/required_token/target_stage).';

CREATE INDEX IF NOT EXISTS idx_quest_tasks_config
ON public.quest_tasks USING gin (task_config);

-- 2) Track verified quest transactions to prevent replay
CREATE TABLE IF NOT EXISTS public.quest_verified_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  transaction_hash TEXT NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 8453,

  user_id TEXT NOT NULL,
  task_id UUID NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,

  verified_amount TEXT,
  event_name TEXT,
  block_number BIGINT,
  log_index INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_quest_tx_hash UNIQUE (transaction_hash)
);

CREATE INDEX IF NOT EXISTS idx_quest_verified_tx_hash
ON public.quest_verified_transactions(transaction_hash);

CREATE INDEX IF NOT EXISTS idx_quest_verified_tx_user
ON public.quest_verified_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_quest_verified_tx_task
ON public.quest_verified_transactions(task_id);

ALTER TABLE public.quest_verified_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verified transactions"
  ON public.quest_verified_transactions
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- 3) Atomic registration function
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
BEGIN
  SELECT * INTO v_existing
  FROM public.quest_verified_transactions
  WHERE transaction_hash = p_tx_hash;

  IF FOUND THEN
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

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for quest verification (concurrent)'
    );
END;
$$;
