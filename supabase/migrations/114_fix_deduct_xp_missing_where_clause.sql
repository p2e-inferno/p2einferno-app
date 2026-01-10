-- Fix missing WHERE clause in deduct_xp_for_renewal function
-- The UPDATE on subscription_treasury was missing a WHERE clause,
-- causing Supabase to reject it with error code 21000

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

  -- Accumulate service fee to treasury (with WHERE clause)
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
