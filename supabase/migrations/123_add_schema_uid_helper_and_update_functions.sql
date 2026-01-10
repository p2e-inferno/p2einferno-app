-- 123_add_schema_uid_helper_and_update_functions.sql
-- Section 13: Schema UID Hardcoding Fix
--
-- PURPOSE: Replace hardcoded placeholder schema UIDs with dynamic (schema_key, network) lookups
-- to enable EAS schema deployment without code changes.
--
-- SECURITY NOTES (per Supabase Advisory 0011):
-- - All functions have SET search_path = 'public' to prevent search_path injection
-- - All table references are fully qualified (public.table_name)
-- - No SECURITY DEFINER used - not required for these functions
--
-- BACKWARD COMPATIBILITY:
-- - Same function signatures (text) - no changes to callers
-- - Hardcoded fallback UID if dynamic lookup fails
-- - No network filter on attestations table queries (Phase A2 will add network-aware v2 functions)

-- ============================================================
-- PART 1: Add Helper Function get_schema_uid(schema_key, network)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_schema_uid(
  p_schema_key TEXT,
  p_network TEXT
)
RETURNS TEXT
SET search_path = 'public'  -- Prevents search_path injection per Supabase advisory 0011
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema_uid TEXT;
BEGIN
  -- Returns latest schema UID for given (key, network)
  SELECT schema_uid INTO v_schema_uid
  FROM public.attestation_schemas  -- Fully qualified table reference
  WHERE schema_key = p_schema_key
    AND network = p_network
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_schema_uid;
END;
$$;

COMMENT ON FUNCTION public.get_schema_uid(TEXT, TEXT) IS
  '[Migration 123] Resolves latest schema UID for given key and network. Returns NULL if not found. Secured with fixed search_path per Supabase advisory 0011.';

-- Leave default EXECUTE permissions (do NOT restrict to service_role only)
-- Reason: streak functions run as the caller and must be able to call this helper

-- ============================================================
-- PART 2: Update get_user_checkin_streak (same signature, NO SECURITY DEFINER)
-- ============================================================
-- NOTE: The original function from migration 096 does NOT have SECURITY DEFINER,
-- it only has SET search_path = 'public'. We maintain that behavior.

CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER
SET search_path = 'public'  -- Keep this, but NO SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
  attestation_count INTEGER;
  profile_id UUID;
  v_checkin_schema_uid TEXT;
  -- HARDCODED FALLBACK for backward compatibility
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  -- Network fallback (testnet default)
  -- Phase A2 introduces v2 functions that accept an explicit p_network; this is just a safe fallback
  c_network CONSTANT TEXT := 'base-sepolia';
BEGIN
  -- Try dynamic schema UID lookup first
  v_checkin_schema_uid := get_schema_uid('daily_checkin', c_network);

  -- SAFETY: Fall back to hardcoded UID if lookup fails (prevents regression)
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
    -- No RAISE WARNING - these are hot-path functions, would spam logs
  END IF;

  -- Check if attestations exist (NO network filter - backward compatible)
  SELECT COUNT(*) INTO attestation_count
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND is_revoked = false
  LIMIT 1;

  IF attestation_count > 0 THEN
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
  ELSE
    -- Fallback to user_activities table (unchanged)
    profile_id := get_user_profile_id_from_address(user_address);
    IF profile_id IS NOT NULL THEN
      streak_count := get_user_checkin_streak_from_activities(profile_id);
    END IF;
  END IF;

  RETURN streak_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_checkin_streak(TEXT) IS
  '[Migration 123] Updated to use dynamic schema lookup via get_schema_uid(). Falls back to hardcoded UID for backward compatibility. Secured with fixed search_path per Supabase advisory 0011.';

-- ============================================================
-- PART 3: Update has_checked_in_today (same signature, NO SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN
SET search_path = 'public'  -- Keep this, but NO SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  has_attestation BOOLEAN;
  profile_id UUID;
  has_activity BOOLEAN;
  v_checkin_schema_uid TEXT;
  -- HARDCODED FALLBACK for backward compatibility
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  -- Network fallback (testnet default)
  -- Phase A2 introduces v2 functions that accept an explicit p_network; this is just a safe fallback
  c_network CONSTANT TEXT := 'base-sepolia';
BEGIN
  -- Try dynamic schema UID lookup first
  v_checkin_schema_uid := get_schema_uid('daily_checkin', c_network);

  -- SAFETY: Fall back to hardcoded UID if lookup fails
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
    -- No RAISE WARNING - hot-path function
  END IF;

  -- Check attestations (NO network filter - backward compatible)
  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE recipient = user_address
      AND schema_uid = v_checkin_schema_uid
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  ) INTO has_attestation;

  IF has_attestation THEN
    RETURN TRUE;
  END IF;

  -- Fallback to user_activities (unchanged)
  profile_id := get_user_profile_id_from_address(user_address);
  IF profile_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_activities
      WHERE user_profile_id = profile_id
        AND activity_type = 'daily_checkin'
        AND DATE(created_at) = CURRENT_DATE
    ) INTO has_activity;
    RETURN has_activity;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.has_checked_in_today(TEXT) IS
  '[Migration 123] Updated to use dynamic schema lookup via get_schema_uid(). Falls back to hardcoded UID for backward compatibility. Secured with fixed search_path per Supabase advisory 0011.';

-- ============================================================
-- OPS VERIFICATION QUERIES (Run manually after migration, NOT in migration)
-- ============================================================
-- The following queries should be run manually to verify the migration:
--
-- 1. Verify schema_key exists for daily_checkin:
--    SELECT schema_uid, schema_key, network FROM public.attestation_schemas
--    WHERE schema_key = 'daily_checkin';
--
-- 2. Test the new helper function:
--    SELECT get_schema_uid('daily_checkin', 'base-sepolia') AS resolved_uid;
--
-- 3. Verify no orphan placeholder schemas:
--    SELECT COUNT(*) FROM public.attestation_schemas
--    WHERE schema_key IS NULL AND schema_uid LIKE '0xp2e_%';
