-- 129_fix_v1_checkin_streak_anchor.sql
-- Align get_user_checkin_streak (v1) with anchored streak behavior (today/yesterday)
-- to restore functional parity with the working baseline from migration 098.
--
-- CONTEXT:
-- - Migration 098 added anchoring to user_activities path (yesterday check-ins show streak)
-- - Migration 123 re-introduced attestations but forgot to add anchoring to that path
-- - Migration 128 added anchoring to v2
-- - This migration adds anchoring to v1 to restore parity with old v1 behavior
--
-- REGRESSION FIX:
-- Old v1 (097-098): Always had anchoring (only used user_activities)
-- New v1 (123): Lost anchoring in attestation path
-- New v1 (129): Restores anchoring in attestation path

CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE;
  checkin_exists BOOLEAN;
  profile_id UUID;
  v_checkin_schema_uid TEXT;
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  c_network CONSTANT TEXT := 'base-sepolia';
  last_attestation_date DATE;
BEGIN
  v_checkin_schema_uid := public.get_schema_uid('daily_checkin', c_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  -- Get the most recent attestation date to determine anchoring
  SELECT DATE(MAX(created_at)) INTO last_attestation_date
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND is_revoked = false;

  IF last_attestation_date IS NOT NULL THEN
    -- Anchoring logic: start from today or yesterday based on last check-in
    IF last_attestation_date = CURRENT_DATE THEN
      current_date_check := CURRENT_DATE;
    ELSIF last_attestation_date = (CURRENT_DATE - INTERVAL '1 day')::date THEN
      current_date_check := (CURRENT_DATE - INTERVAL '1 day')::date;
    ELSE
      -- Last check-in older than yesterday, streak is broken
      RETURN 0;
    END IF;

    -- Count consecutive days backward from anchor date
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.attestations
        WHERE recipient = user_address
          AND schema_uid = v_checkin_schema_uid
          AND is_revoked = false
          AND DATE(created_at) = current_date_check
      ) INTO checkin_exists;

      IF checkin_exists THEN
        streak_count := streak_count + 1;
        current_date_check := current_date_check - INTERVAL '1 day';
      ELSE
        EXIT;
      END IF;

      IF streak_count > 365 THEN
        EXIT;
      END IF;
    END LOOP;

    RETURN streak_count;
  END IF;

  -- No attestations found, fallback to user_activities
  profile_id := public.get_user_profile_id_from_address(user_address);
  IF profile_id IS NOT NULL THEN
    streak_count := public.get_user_checkin_streak_from_activities(profile_id);
  END IF;

  RETURN streak_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_checkin_streak(TEXT) IS
  '[Migration 129] Restored anchored behavior (today/yesterday) to attestation path for functional parity with migration 098 baseline. Uses dynamic schema lookup via get_schema_uid(). Secured with fixed search_path per Supabase advisory 0011.';
