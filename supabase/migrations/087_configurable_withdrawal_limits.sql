-- Configurable Withdrawal Limits System
-- Replaces hardcoded limits with database-driven configuration
-- Created: 2025-10-20

-- Generic system configuration table (key-value store)
CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Audit log for configuration changes
CREATE TABLE IF NOT EXISTS public.config_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text NOT NULL,
  old_value text,
  new_value text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Index for audit queries
CREATE INDEX idx_config_audit_log_key ON public.config_audit_log(config_key, changed_at DESC);
CREATE INDEX idx_config_audit_log_user ON public.config_audit_log(changed_by);

-- Helper function to get integer config values
CREATE OR REPLACE FUNCTION public.get_config_int(
  p_key text,
  p_default integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $$
DECLARE
  v_value text;
BEGIN
  SELECT value INTO v_value
  FROM public.system_config
  WHERE key = p_key;

  IF v_value IS NULL THEN
    RETURN p_default;
  END IF;

  RETURN v_value::integer;
EXCEPTION
  WHEN OTHERS THEN
    RETURN p_default;
END;
$$;

-- Trigger function to log config changes
CREATE OR REPLACE FUNCTION public.log_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.config_audit_log (
    config_key,
    old_value,
    new_value,
    changed_by
  ) VALUES (
    NEW.key,
    OLD.value,
    NEW.value,
    NEW.updated_by
  );

  RETURN NEW;
END;
$$;

-- Attach trigger to system_config
DROP TRIGGER IF EXISTS trigger_log_config_change ON public.system_config;
CREATE TRIGGER trigger_log_config_change
  AFTER UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.log_config_change();

-- Seed initial withdrawal limit values
INSERT INTO public.system_config (key, value, description) VALUES
  ('dg_withdrawal_min_amount', '3000', 'Minimum DG amount that can be withdrawn'),
  ('dg_withdrawal_max_daily_amount', '100000', 'Maximum DG amount that can be withdrawn in 24 hours')
ON CONFLICT (key) DO NOTHING;

-- Update initiate_withdrawal function to use dynamic config
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
  v_min_amount integer;
  v_max_daily integer;
BEGIN
  -- Get dynamic configuration values
  v_min_amount := get_config_int('dg_withdrawal_min_amount', 3000);
  v_max_daily := get_config_int('dg_withdrawal_max_daily_amount', 100000);

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

-- RLS Policies
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_audit_log ENABLE ROW LEVEL SECURITY;

-- Anyone can read config (needed for client-side validation)
CREATE POLICY "Anyone can read config"
  ON public.system_config
  FOR SELECT
  USING (true);

-- Only admins can view audit logs (implement admin check as needed)
CREATE POLICY "Admins can view audit logs"
  ON public.config_audit_log
  FOR SELECT
  USING (true); -- TODO: Add proper admin check when admin role system is implemented
