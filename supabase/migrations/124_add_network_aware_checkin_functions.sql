-- 124_add_network_aware_checkin_functions.sql
-- Adds network-aware v2 check-in functions (explicit network parameter).
-- Purpose: production-safe multi-network support without changing v1 signatures.
-- Security: no SECURITY DEFINER; fixed search_path; fully qualified tables.

-- ============================================================
-- get_user_checkin_streak_v2(user_address, p_network)
-- ============================================================
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
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
  attestation_count INTEGER;
  profile_id UUID;
  v_checkin_schema_uid TEXT;
  v_network TEXT := COALESCE(NULLIF(p_network, ''), 'base-sepolia');
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
BEGIN
  v_checkin_schema_uid := public.get_schema_uid('daily_checkin', v_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  SELECT COUNT(*) INTO attestation_count
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND network = v_network
    AND is_revoked = false
  LIMIT 1;

  IF attestation_count > 0 THEN
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
  ELSE
    profile_id := public.get_user_profile_id_from_address(user_address);
    IF profile_id IS NOT NULL THEN
      streak_count := public.get_user_checkin_streak_from_activities(profile_id);
    END IF;
  END IF;

  RETURN streak_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_checkin_streak_v2(TEXT, TEXT) IS
  'Network-aware streak calculation. Uses get_schema_uid(schema_key, network) with fallback and filters attestations by network. Secured with fixed search_path per advisory 0011.';

-- ============================================================
-- has_checked_in_today_v2(user_address, p_network)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_checked_in_today_v2(
  user_address TEXT,
  p_network TEXT
)
RETURNS BOOLEAN
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  has_attestation BOOLEAN;
  last_checkin TIMESTAMP WITH TIME ZONE;
  v_checkin_schema_uid TEXT;
  v_network TEXT := COALESCE(NULLIF(p_network, ''), 'base-sepolia');
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
BEGIN
  v_checkin_schema_uid := public.get_schema_uid('daily_checkin', v_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE recipient = user_address
      AND schema_uid = v_checkin_schema_uid
      AND network = v_network
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  ) INTO has_attestation;

  IF has_attestation THEN
    RETURN TRUE;
  END IF;

  -- EAS-disabled fallback: use existing SECURITY DEFINER helper (migration 097)
  -- This avoids relying on user_activities RLS inside an invoker function.
  last_checkin := public.get_last_checkin_date(user_address);
  IF last_checkin IS NOT NULL THEN
    RETURN DATE(last_checkin) = CURRENT_DATE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.has_checked_in_today_v2(TEXT, TEXT) IS
  'Network-aware check-in status. Uses get_schema_uid(schema_key, network) with fallback and filters attestations by network. Secured with fixed search_path per advisory 0011.';
