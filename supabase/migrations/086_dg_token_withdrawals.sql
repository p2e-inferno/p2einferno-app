-- DG Token Withdrawal System
-- Simplified: Use signature as idempotency key, store amounts as DG integers (not wei)
-- Created: 2025-10-20

-- Track all withdrawal transactions
CREATE TABLE IF NOT EXISTS public.dg_token_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_profile_id uuid REFERENCES public.user_profiles(id),
  wallet_address text NOT NULL,

  -- Amounts (stored as DG integers, converted to wei only for blockchain)
  amount_dg integer NOT NULL,           -- DG amount (e.g., 5000)
  xp_balance_before integer NOT NULL,   -- Audit trail

  -- Signature data (signature is the idempotency key)
  signature text NOT NULL UNIQUE,       -- EIP712 signature - prevents replays
  deadline bigint NOT NULL,             -- Unix timestamp (seconds) when signature expires

  -- Blockchain data
  transaction_hash text,

  -- Status tracking
  status text NOT NULL DEFAULT 'pending',
  error_message text,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'failed')),
  CONSTRAINT positive_amount CHECK (amount_dg > 0)
);

-- Indexes for performance
CREATE INDEX idx_dg_withdrawals_user_id ON public.dg_token_withdrawals(user_id);
CREATE INDEX idx_dg_withdrawals_status ON public.dg_token_withdrawals(status);
CREATE INDEX idx_dg_withdrawals_wallet ON public.dg_token_withdrawals(wallet_address);
CREATE INDEX idx_dg_withdrawals_created_at ON public.dg_token_withdrawals(created_at DESC);
CREATE UNIQUE INDEX idx_dg_withdrawals_signature ON public.dg_token_withdrawals(signature);

-- Index for daily limit calculation (rolling 24-hour window)
CREATE INDEX idx_dg_withdrawals_daily_limit ON public.dg_token_withdrawals(user_id, created_at)
  WHERE status = 'completed';

-- RLS Policies (users can only see their own withdrawals)
ALTER TABLE public.dg_token_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own withdrawals"
  ON public.dg_token_withdrawals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Atomic function to initiate withdrawal
-- Handles validation, XP deduction, and record creation in one transaction
CREATE OR REPLACE FUNCTION public.initiate_withdrawal(
  p_user_id uuid,
  p_amount_dg integer,
  p_signature text,
  p_deadline bigint,
  p_wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_current_xp integer;
  v_withdrawal_id uuid;
  v_daily_total integer;
  v_min_amount integer := 3000;  -- From env DG_WITHDRAWAL_MIN_AMOUNT
  v_max_daily integer := 100000; -- From env DG_WITHDRAWAL_MAX_DAILY_AMOUNT
BEGIN
  -- Check if signature already used (idempotency)
  SELECT id INTO v_withdrawal_id
  FROM public.dg_token_withdrawals
  WHERE signature = p_signature;

  IF FOUND THEN
    -- Return existing withdrawal (idempotent)
    RETURN jsonb_build_object(
      'success', true,
      'withdrawal_id', v_withdrawal_id,
      'idempotent', true
    );
  END IF;

  -- Lock user profile row and get current XP
  SELECT id, experience_points INTO v_profile_id, v_current_xp
  FROM public.user_profiles
  WHERE privy_user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Validate minimum amount
  IF p_amount_dg < v_min_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum withdrawal is %s DG', v_min_amount)
    );
  END IF;

  -- Validate sufficient balance
  IF v_current_xp < p_amount_dg THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance. You have %s DG available', v_current_xp)
    );
  END IF;

  -- Check daily limit (rolling 24-hour window)
  SELECT COALESCE(SUM(amount_dg), 0) INTO v_daily_total
  FROM public.dg_token_withdrawals
  WHERE user_id = p_user_id
    AND status = 'completed'
    AND created_at > now() - interval '24 hours';

  IF v_daily_total + p_amount_dg > v_max_daily THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Daily limit exceeded. You can withdraw up to %s DG more today',
                      v_max_daily - v_daily_total)
    );
  END IF;

  -- Deduct XP from user profile
  UPDATE public.user_profiles
  SET experience_points = experience_points - p_amount_dg,
      updated_at = now()
  WHERE id = v_profile_id;

  -- Create withdrawal record
  INSERT INTO public.dg_token_withdrawals (
    user_id,
    user_profile_id,
    wallet_address,
    amount_dg,
    xp_balance_before,
    signature,
    deadline,
    status
  ) VALUES (
    p_user_id,
    v_profile_id,
    p_wallet_address,
    p_amount_dg,
    v_current_xp,
    p_signature,
    p_deadline,
    'pending'
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'xp_deducted', p_amount_dg
  );
END;
$$;

-- Function to complete a successful withdrawal
CREATE OR REPLACE FUNCTION public.complete_withdrawal(
  p_withdrawal_id uuid,
  p_tx_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.dg_token_withdrawals
  SET
    status = 'completed',
    transaction_hash = p_tx_hash,
    completed_at = now()
  WHERE id = p_withdrawal_id
    AND status = 'pending';
END;
$$;

-- Function to rollback a failed withdrawal
CREATE OR REPLACE FUNCTION public.rollback_withdrawal(
  p_withdrawal_id uuid,
  p_error_message text DEFAULT 'Transfer failed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_amount integer;
  v_profile_id uuid;
BEGIN
  -- Get withdrawal details
  SELECT amount_dg, user_profile_id INTO v_amount, v_profile_id
  FROM public.dg_token_withdrawals
  WHERE id = p_withdrawal_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN; -- Already processed or doesn't exist
  END IF;

  -- Restore XP to user profile
  UPDATE public.user_profiles
  SET experience_points = experience_points + v_amount,
      updated_at = now()
  WHERE id = v_profile_id;

  -- Mark withdrawal as failed
  UPDATE public.dg_token_withdrawals
  SET
    status = 'failed',
    error_message = p_error_message,
    completed_at = now()
  WHERE id = p_withdrawal_id;
END;
$$;
