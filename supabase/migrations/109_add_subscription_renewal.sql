-- Subscription Renewal Foundation
-- Creates tables and RPC functions for XP/Crypto subscription renewals

-- ============================================================================
-- 1. RENEWAL ATTEMPTS TABLE - Tracks all renewal attempts
-- ============================================================================
CREATE TABLE subscription_renewal_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL REFERENCES user_profiles(privy_user_id) ON DELETE CASCADE,
  user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  lock_address VARCHAR(42) NOT NULL,
  token_id BIGINT,
  renewal_method VARCHAR(50) NOT NULL,        -- 'crypto' | 'xp' | 'paystack'
  amount_value DECIMAL(20, 8),                -- eth/usdc/xp amount
  service_fee_amount DECIMAL(20, 8),          -- only for xp method
  service_fee_percent DECIMAL(5, 2),          -- actual % applied
  duration_days INTEGER,                       -- 30 | 90 | 365
  expected_new_expiration TIMESTAMP,
  actual_new_expiration TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed' | 'reverted'
  transaction_hash VARCHAR(66),
  paystack_reference VARCHAR(255),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_renewal_method CHECK (renewal_method IN ('crypto', 'xp', 'paystack')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'success', 'failed', 'reverted'))
);

-- Indexes for subscription_renewal_attempts (foreign keys and common filters)
CREATE INDEX IF NOT EXISTS idx_subscription_renewal_attempts_user_created
  ON subscription_renewal_attempts (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_subscription_renewal_attempts_lock_status
  ON subscription_renewal_attempts (lock_address, status);

CREATE INDEX IF NOT EXISTS idx_subscription_renewal_attempts_method_status
  ON subscription_renewal_attempts (renewal_method, status);

CREATE INDEX IF NOT EXISTS idx_subscription_renewal_attempts_created
  ON subscription_renewal_attempts (created_at);

-- Foreign key coverage for user_profile_id
CREATE INDEX IF NOT EXISTS idx_subscription_renewal_attempts_user_profile
  ON subscription_renewal_attempts (user_profile_id);

-- ============================================================================
-- 2. XP ROLLBACKS TABLE - Audit trail for XP rollbacks on failure
-- ============================================================================
CREATE TABLE subscription_xp_rollbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_attempt_id UUID NOT NULL REFERENCES subscription_renewal_attempts(id) ON DELETE CASCADE,
  original_xp_balance INTEGER,
  xp_deducted INTEGER,
  reason VARCHAR(255),
  rolled_back_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_xp_rollbacks_renewal_attempt
  ON subscription_xp_rollbacks (renewal_attempt_id);

-- ============================================================================
-- 3. TREASURY TABLE - Service fees accumulation
-- ============================================================================
CREATE TABLE subscription_treasury (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xp_fees_accumulated INTEGER DEFAULT 0,
  burned_xp INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize treasury with single row
INSERT INTO subscription_treasury DEFAULT VALUES;

-- ============================================================================
-- 4. TREASURY BURNS TABLE - Audit trail for fee burns
-- ============================================================================
CREATE TABLE subscription_treasury_burns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xp_amount_burned INTEGER NOT NULL,
  burned_by VARCHAR(255) NOT NULL,
  reason VARCHAR(500),
  transaction_details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_treasury_burns_burned_by
  ON subscription_treasury_burns (burned_by);

CREATE INDEX IF NOT EXISTS idx_subscription_treasury_burns_created
  ON subscription_treasury_burns (created_at);

-- ============================================================================
-- 5. UPDATE user_activation_grants - Add renewal tracking columns
-- ============================================================================
ALTER TABLE user_activation_grants
  ADD COLUMN IF NOT EXISTS renewal_attempt_id UUID REFERENCES subscription_renewal_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS original_grant_id UUID;

-- Index for new foreign key on user_activation_grants
CREATE INDEX IF NOT EXISTS idx_user_activation_grants_renewal_attempt
  ON user_activation_grants (renewal_attempt_id);

-- ============================================================================
-- 6. RLS POLICIES: Restrict writes to service_role, allow users to see own history
-- ============================================================================

ALTER TABLE subscription_renewal_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_xp_rollbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_treasury ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_treasury_burns ENABLE ROW LEVEL SECURITY;

-- Service role has full control over all subscription renewal tables
CREATE POLICY "Service role manages subscription renewals"
  ON subscription_renewal_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages subscription xp rollbacks"
  ON subscription_xp_rollbacks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages subscription treasury"
  ON subscription_treasury
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages subscription treasury burns"
  ON subscription_treasury_burns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can view their own subscription renewal history
CREATE POLICY "Users can view own subscription renewals"
  ON subscription_renewal_attempts
  FOR SELECT
  USING (user_id = auth.uid()::text);

-- ============================================================================
-- 6. RPC FUNCTION: deduct_xp_for_renewal
-- ============================================================================
CREATE OR REPLACE FUNCTION deduct_xp_for_renewal(
  p_user_id VARCHAR(255),
  p_xp_amount INTEGER,
  p_service_fee_xp INTEGER,
  p_renewal_attempt_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  new_xp_balance INTEGER,
  error_message TEXT
)
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id UUID;
  v_current_xp INTEGER;
  v_total_xp INTEGER;
BEGIN
  -- Get user profile
  SELECT id INTO v_profile_id FROM user_profiles WHERE privy_user_id = p_user_id;

  IF v_profile_id IS NULL THEN
    RETURN QUERY SELECT false, 0::INTEGER, 'User not found'::TEXT;
    RETURN;
  END IF;

  -- Get current XP
  SELECT experience_points INTO v_current_xp FROM user_profiles WHERE id = v_profile_id;

  -- Calculate total to deduct (base + fee)
  v_total_xp := p_xp_amount + p_service_fee_xp;

  -- Check if sufficient XP
  IF v_current_xp < v_total_xp THEN
    RETURN QUERY SELECT false, v_current_xp, 'Insufficient XP'::TEXT;
    RETURN;
  END IF;

  -- Deduct XP from user (atomic)
  UPDATE user_profiles SET experience_points = experience_points - v_total_xp
  WHERE id = v_profile_id;

  -- Accumulate service fee to treasury
  UPDATE subscription_treasury SET
    xp_fees_accumulated = xp_fees_accumulated + p_service_fee_xp,
    updated_at = NOW()
  WHERE id = (SELECT id FROM subscription_treasury ORDER BY created_at LIMIT 1);

  -- Log renewal attempt as in-progress
  UPDATE subscription_renewal_attempts SET status = 'pending'
  WHERE id = p_renewal_attempt_id;

  -- Get new balance
  SELECT experience_points INTO v_current_xp FROM user_profiles WHERE id = v_profile_id;

  RETURN QUERY SELECT true, v_current_xp, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. RPC FUNCTION: rollback_xp_renewal
-- ============================================================================
CREATE OR REPLACE FUNCTION rollback_xp_renewal(
  p_renewal_attempt_id UUID,
  p_reason VARCHAR(255)
)
RETURNS TABLE (
  success BOOLEAN,
  restored_xp INTEGER,
  restored_fee_xp INTEGER,
  error_message TEXT
)
SET search_path = 'public'
AS $$
DECLARE
  v_xp_deducted INTEGER;
  v_fee_deducted INTEGER;
  v_user_profile_id UUID;
  v_total_restored INTEGER;
BEGIN
  -- Get renewal attempt details
  SELECT user_profile_id, amount_value::INTEGER, service_fee_amount::INTEGER
  INTO v_user_profile_id, v_xp_deducted, v_fee_deducted
  FROM subscription_renewal_attempts
  WHERE id = p_renewal_attempt_id;

  IF v_user_profile_id IS NULL THEN
    RETURN QUERY SELECT false, 0::INTEGER, 0::INTEGER, 'Renewal attempt not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate total to restore (base + fee)
  v_total_restored := v_xp_deducted + COALESCE(v_fee_deducted, 0);

  -- Restore XP to user (atomic)
  UPDATE user_profiles SET experience_points = experience_points + v_total_restored
  WHERE id = v_user_profile_id;

  -- Rollback treasury fee (atomic)
  UPDATE subscription_treasury SET
    xp_fees_accumulated = xp_fees_accumulated - COALESCE(v_fee_deducted, 0),
    updated_at = NOW()
  WHERE id = (SELECT id FROM subscription_treasury ORDER BY created_at LIMIT 1);

  -- Log rollback
  INSERT INTO subscription_xp_rollbacks (renewal_attempt_id, xp_deducted, reason)
  VALUES (p_renewal_attempt_id, v_total_restored, p_reason);

  -- Update renewal status
  UPDATE subscription_renewal_attempts SET status = 'reverted'
  WHERE id = p_renewal_attempt_id;

  RETURN QUERY SELECT true, v_xp_deducted, COALESCE(v_fee_deducted, 0), NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. RPC FUNCTION: burn_subscription_treasury
-- ============================================================================
CREATE OR REPLACE FUNCTION burn_subscription_treasury(
  p_xp_amount INTEGER,
  p_admin_id VARCHAR(255),
  p_reason VARCHAR(500),
  p_transaction_details JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  remaining_treasury INTEGER,
  error_message TEXT
)
SET search_path = 'public'
AS $$
DECLARE
  v_current_treasury INTEGER;
BEGIN
  -- Get current treasury balance
  SELECT xp_fees_accumulated INTO v_current_treasury FROM subscription_treasury LIMIT 1;

  IF v_current_treasury IS NULL THEN
    RETURN QUERY SELECT false, 0::INTEGER, 'Treasury not initialized'::TEXT;
    RETURN;
  END IF;

  -- Check if sufficient balance
  IF v_current_treasury < p_xp_amount THEN
    RETURN QUERY SELECT false, v_current_treasury, 'Insufficient treasury balance'::TEXT;
    RETURN;
  END IF;

  -- Burn XP from treasury (atomic)
  UPDATE subscription_treasury SET
    xp_fees_accumulated = xp_fees_accumulated - p_xp_amount,
    burned_xp = burned_xp + p_xp_amount,
    updated_at = NOW()
  WHERE id = (SELECT id FROM subscription_treasury ORDER BY created_at LIMIT 1);

  -- Log burn in audit trail
  INSERT INTO subscription_treasury_burns (xp_amount_burned, burned_by, reason, transaction_details)
  VALUES (p_xp_amount, p_admin_id, p_reason, p_transaction_details);

  -- Get new treasury balance
  SELECT xp_fees_accumulated INTO v_current_treasury FROM subscription_treasury LIMIT 1;

  RETURN QUERY SELECT true, v_current_treasury, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. RPC FUNCTION: get_config_int (if not exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_config_int(p_key VARCHAR)
RETURNS INTEGER
SET search_path = 'public'
AS $$
DECLARE
  v_value INTEGER;
BEGIN
  SELECT (config_value::numeric)::INTEGER INTO v_value
  FROM system_config
  WHERE config_key = p_key AND is_active = true;

  RETURN COALESCE(v_value, NULL);
END;
$$ LANGUAGE plpgsql;
