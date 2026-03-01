-- Daily Quests: templates, daily runs, progress, replay prevention, notifications

-- Domain tables
CREATE TABLE IF NOT EXISTS public.daily_quest_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  image_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Bonus XP awarded only after a successful daily completion key claim (not a sum of task rewards).
  completion_bonus_reward_amount integer NOT NULL DEFAULT 0,
  lock_address text NULL,
  lock_manager_granted boolean NOT NULL DEFAULT false,
  grant_failure_reason text NULL,
  eligibility_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_quest_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  task_type text NOT NULL,
  verification_method text NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  task_config jsonb DEFAULT '{}'::jsonb,
  input_required boolean DEFAULT false,
  input_label text NULL,
  input_placeholder text NULL,
  input_validation text NULL,
  requires_admin_review boolean DEFAULT false,
  -- v1: daily quests intentionally support a small, fully server-verifiable subset of TaskType.
  -- This avoids having to re-implement/link all account-link + submission/review flows in a new daily domain.
  CHECK(task_type IN (
    'vendor_buy',
    'vendor_sell',
    'vendor_light_up',
    'vendor_level_up',
    'deploy_lock',
    'uniswap_swap',
    'daily_checkin'
  )),
  UNIQUE(daily_quest_template_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text CHECK(status IN ('active','closed')) DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(daily_quest_template_id, run_date)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_run_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  daily_quest_template_task_id uuid REFERENCES public.daily_quest_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  task_type text NOT NULL,
  verification_method text NOT NULL,
  reward_amount integer NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  task_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_required boolean DEFAULT false,
  input_label text NULL,
  input_placeholder text NULL,
  input_validation text NULL,
  requires_admin_review boolean DEFAULT false,
  UNIQUE(daily_quest_run_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.user_daily_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz NULL,
  -- Final completion key claim (on-chain grant) for the run.
  reward_claimed boolean DEFAULT false,
  key_claim_tx_hash text NULL,
  key_claim_token_id numeric NULL,
  -- Bonus XP claim (DB gate + server-side XP award). Separate from reward_claimed so bonus XP can be retried without re-granting the key.
  completion_bonus_claimed boolean NOT NULL DEFAULT false,
  completion_bonus_amount integer NOT NULL DEFAULT 0,
  completion_bonus_claimed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, daily_quest_run_id)
);

CREATE TABLE IF NOT EXISTS public.user_daily_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  daily_quest_run_id uuid NOT NULL REFERENCES public.daily_quest_runs(id) ON DELETE CASCADE,
  daily_quest_run_task_id uuid NOT NULL REFERENCES public.daily_quest_run_tasks(id) ON DELETE CASCADE,
  completed_at timestamptz DEFAULT now(),
  verification_data jsonb NULL,
  submission_data jsonb NULL,
  submission_status text DEFAULT 'completed' CHECK(submission_status IN ('pending','completed','failed','retry')),
  reward_claimed boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, daily_quest_run_id, daily_quest_run_task_id)
);

CREATE TABLE IF NOT EXISTS public.daily_quest_verified_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_hash text NOT NULL,
  chain_id integer NOT NULL DEFAULT 8453,
  user_id text NOT NULL,
  task_id uuid NOT NULL REFERENCES public.daily_quest_run_tasks(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  verified_amount text,
  created_at timestamptz DEFAULT now(),
  event_name text,
  block_number bigint,
  log_index integer
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_hash_lower_unique
ON public.daily_quest_verified_transactions (lower(transaction_hash));

-- Foreign key covering indexes (required per CLAUDE.md DB security guidelines)
CREATE INDEX IF NOT EXISTS idx_daily_quest_tasks_template_id
  ON public.daily_quest_tasks (daily_quest_template_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_runs_template_id
  ON public.daily_quest_runs (daily_quest_template_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_run_tasks_run_id
  ON public.daily_quest_run_tasks (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_run_tasks_template_task_id
  ON public.daily_quest_run_tasks (daily_quest_template_task_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_run_id
  ON public.user_daily_quest_progress (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_key_claim_tx_hash
  ON public.user_daily_quest_progress (key_claim_tx_hash);
CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_key_claim_token_id
  ON public.user_daily_quest_progress (key_claim_token_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_task_completions_run_id
  ON public.user_daily_task_completions (daily_quest_run_id);
CREATE INDEX IF NOT EXISTS idx_user_daily_task_completions_run_task_id
  ON public.user_daily_task_completions (daily_quest_run_task_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_user_id
  ON public.daily_quest_verified_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_verified_tx_task_id
  ON public.daily_quest_verified_transactions (task_id);

CREATE TABLE IF NOT EXISTS public.daily_quest_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_quest_template_id uuid NOT NULL REFERENCES public.daily_quest_templates(id),
  run_date date NOT NULL,
  notification_type text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(daily_quest_template_id, run_date, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_quest_notifications_template_id
  ON public.daily_quest_notifications (daily_quest_template_id);

-- Triggers to auto-update updated_at columns (reuses existing set_updated_at() function from migration 004)
CREATE TRIGGER trg_update_daily_quest_templates_updated
  BEFORE UPDATE ON public.daily_quest_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_daily_quest_runs_updated
  BEFORE UPDATE ON public.daily_quest_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_user_daily_quest_progress_updated
  BEFORE UPDATE ON public.user_daily_quest_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_user_daily_task_completions_updated
  BEFORE UPDATE ON public.user_daily_task_completions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS on all new tables (deny-by-default; no broad anon/authenticated policies in v1)
ALTER TABLE public.daily_quest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_run_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_verified_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_quest_notifications ENABLE ROW LEVEL SECURITY;

-- All access (reads and writes) goes through server-side API routes using the service-role
-- admin client, which bypasses RLS. No direct client access is required in v1.
-- NOTE: user_id columns store Privy DIDs (e.g. "did:privy:..."), not Supabase auth.uid()
-- UUIDs, so auth.uid()-based RLS policies cannot match them. If direct client reads are
-- added in a future iteration, use a privy_user_id → auth.uid() mapping table instead.

CREATE OR REPLACE FUNCTION public.register_daily_quest_transaction(
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

  -- 1) Check daily quest table first (same-domain idempotency).
  SELECT * INTO v_existing
  FROM public.daily_quest_verified_transactions
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
      'error', 'Transaction already used for daily quest verification',
      'existing_task_id', v_existing.task_id,
      'existing_task_type', v_existing.task_type
    );
  END IF;

  -- 2) Cross-domain check: reject tx hashes already used for standard quest tasks.
  --    Prevents double-dipping across quest domains (same on-chain action credited twice).
  PERFORM 1 FROM public.quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for standard quest verification'
    );
  END IF;

  INSERT INTO public.daily_quest_verified_transactions (
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
    FROM public.daily_quest_verified_transactions
    WHERE lower(transaction_hash) = v_tx_hash_normalized;

    IF FOUND AND v_existing.user_id = p_user_id AND v_existing.task_id = p_task_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true
      );
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for daily quest verification (concurrent)'
    );
END;
$$;

-- SECURITY: this RPC is server-only. Prevent client-side callers from burning tx hashes.
REVOKE EXECUTE ON FUNCTION public.register_daily_quest_transaction(
  TEXT,
  INTEGER,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_daily_quest_transaction(
  TEXT,
  INTEGER,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  INTEGER
) TO service_role;

-- Cross-domain replay prevention: update the existing register_quest_transaction
-- (from migration 116) to also reject tx hashes already used in daily quests.
-- This prevents a user from completing a daily quest task first, then reusing the
-- same tx hash for a standard quest task.
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
  -- IMPORTANT: preserve lower(trim()) normalization from migration 149.
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

  -- Cross-domain check: reject tx hashes already used for daily quest tasks.
  PERFORM 1 FROM public.daily_quest_verified_transactions
  WHERE lower(transaction_hash) = v_tx_hash_normalized;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction already used for daily quest verification'
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

-- SECURITY: award_xp_to_user is server-only (SECURITY DEFINER).
REVOKE EXECUTE ON FUNCTION public.award_xp_to_user(uuid, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_xp_to_user(uuid, integer, text, jsonb) TO service_role;

