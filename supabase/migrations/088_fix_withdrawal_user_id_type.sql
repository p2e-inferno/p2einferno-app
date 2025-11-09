-- Fix user_id type mismatch in dg_token_withdrawals table
-- The user_id should store Privy DID strings (text), not UUIDs

-- 1. Drop RLS policy first (depends on the column)
DROP POLICY IF EXISTS "Users can view own withdrawals" ON public.dg_token_withdrawals;

-- 2. Drop the foreign key constraint to auth.users (not used in this app)
ALTER TABLE public.dg_token_withdrawals
  DROP CONSTRAINT IF EXISTS dg_token_withdrawals_user_id_fkey;

-- 3. Change user_id column from uuid to text
ALTER TABLE public.dg_token_withdrawals
  ALTER COLUMN user_id TYPE text USING user_id::text;

-- 4. Update index for user_id (recreate after type change)
DROP INDEX IF EXISTS idx_dg_withdrawals_user_id;
CREATE INDEX idx_dg_withdrawals_user_id ON public.dg_token_withdrawals(user_id);

-- 5. Update index for daily limit calculation
DROP INDEX IF EXISTS idx_dg_withdrawals_daily_limit;
CREATE INDEX idx_dg_withdrawals_daily_limit ON public.dg_token_withdrawals(user_id, created_at)
  WHERE status = 'completed';

-- 6. Recreate RLS policy with text comparison
CREATE POLICY "Users can view own withdrawals"
  ON public.dg_token_withdrawals
  FOR SELECT
  USING (auth.jwt() ->> 'sub' = user_id);

-- 6. Update initiate_withdrawal function signature to accept text
CREATE OR REPLACE FUNCTION public.initiate_withdrawal(
  p_user_id text,  -- Changed from uuid to text
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
  v_min_amount integer;
  v_max_daily integer;
BEGIN
  -- Get dynamic limits from config
  v_min_amount := get_config_int('dg_withdrawal_min_amount', 3000);
  v_max_daily := get_config_int('dg_withdrawal_max_daily_amount', 100000);

  -- Check if signature already used (idempotency)
  SELECT id INTO v_withdrawal_id
  FROM public.dg_token_withdrawals
  WHERE signature = p_signature;

  IF FOUND THEN
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

  -- Validate minimum amount (using dynamic config)
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

  -- Check daily limit (using dynamic config)
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

  -- Deduct XP and create withdrawal record
  UPDATE public.user_profiles
  SET experience_points = experience_points - p_amount_dg,
      updated_at = now()
  WHERE id = v_profile_id;

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
