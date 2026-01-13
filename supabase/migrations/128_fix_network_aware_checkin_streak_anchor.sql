-- 128_fix_network_aware_checkin_streak_anchor.sql
-- Align get_user_checkin_streak_v2 with anchored streak behavior (today/yesterday)
-- so streaks display before today's check-in when the last check-in was yesterday.

CREATE OR REPLACE FUNCTION public.get_user_checkin_streak_v2(
  user_address TEXT,
  p_network TEXT
)
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
  v_network TEXT := COALESCE(NULLIF(p_network, ''), 'base-sepolia');
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  last_attestation_date DATE;
BEGIN
  v_checkin_schema_uid := public.get_schema_uid('daily_checkin', v_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  SELECT DATE(MAX(created_at)) INTO last_attestation_date
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND network = v_network
    AND is_revoked = false;

  IF last_attestation_date IS NOT NULL THEN
    IF last_attestation_date = CURRENT_DATE THEN
      current_date_check := CURRENT_DATE;
    ELSIF last_attestation_date = (CURRENT_DATE - INTERVAL '1 day')::date THEN
      current_date_check := (CURRENT_DATE - INTERVAL '1 day')::date;
    ELSE
      RETURN 0;
    END IF;

    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.attestations
        WHERE recipient = user_address
          AND schema_uid = v_checkin_schema_uid
          AND network = v_network
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

  profile_id := public.get_user_profile_id_from_address(user_address);
  IF profile_id IS NOT NULL THEN
    streak_count := public.get_user_checkin_streak_from_activities(profile_id);
  END IF;

  RETURN streak_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_checkin_streak_v2(TEXT, TEXT) IS
  'Network-aware streak calculation with anchored behavior. Uses get_schema_uid(schema_key, network) with fallback, filters attestations by network, and anchors at today/yesterday when applicable. Secured with fixed search_path per advisory 0011.';
