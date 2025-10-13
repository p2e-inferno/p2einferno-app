-- Secure all functions with fixed search_path to prevent SQL injection
-- Per Supabase security advisory: functions with mutable search_path are vulnerable
-- Solution: Add "SET search_path = 'public'" to all function definitions

-- Note: This migration recreates existing functions with security improvements
-- All function logic remains unchanged, only search_path is added

-- ============================================================================
-- SECURITY: Set search_path on all functions
-- ============================================================================

-- 1. create_notification_v2 (from 064)
CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_user_profile_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  IF p_link IS NOT NULL THEN
    v_metadata := jsonb_build_object('link', p_link);
  END IF;

  INSERT INTO notifications (
    user_profile_id,
    title,
    message,
    link,
    body,
    metadata,
    read,
    created_at
  )
  VALUES (
    p_user_profile_id,
    p_title,
    p_message,
    p_link,
    p_message,
    v_metadata,
    false,
    NOW()
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_notification_v2(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 2. is_admin (from 009)
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  admin_role BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE id = user_id
    AND metadata->>'role' = 'admin'
  ) INTO admin_role;

  RETURN admin_role;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;

-- 3. update_updated_at_column (from 001, 003, 062)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. get_user_checkin_streak (from 062)
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER
SET search_path = 'public'
AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
BEGIN
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM attestations
      WHERE recipient = user_address
        AND schema_uid = '0xp2e_daily_checkin_001'
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
END;
$$ LANGUAGE plpgsql;

-- 5. has_checked_in_today (from 062)
CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM attestations
    WHERE recipient = user_address
      AND schema_uid = '0xp2e_daily_checkin_001'
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;

-- 6. set_updated_at (from 004)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.create_notification_v2 IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION is_admin IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.update_updated_at_column IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.get_user_checkin_streak IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.has_checked_in_today IS 'Secured with fixed search_path per Supabase advisory 0011';
COMMENT ON FUNCTION public.set_updated_at IS 'Secured with fixed search_path per Supabase advisory 0011';

-- ============================================================================
-- Additional functions to secure (remaining from advisory list)
-- ============================================================================
-- The following functions also need SET search_path added:
-- - update_cohort_participant_count (059, 060)
-- - notify_on_task_completion (061)
-- - notify_on_milestone_progress (048, 061)
-- - notify_on_enrollment_change (048, 061)
-- - notify_on_application_status (048, 061)
-- - check_duplicate_submission (037)
-- - update_quest_progress_on_task_change (019)
-- - ensure_user_application_status (063)
-- - update_milestone_total_reward (037)
-- - handle_successful_payment (multiple migrations)
-- - check_lock_address_uniqueness (005, 007, 012)
-- - recalculate_quest_progress (019)
--
-- These will be addressed in subsequent migrations to keep changes manageable.
