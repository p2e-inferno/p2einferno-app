-- 096_add_user_activities_streak_calculation.sql
-- Add streak calculation support for user_activities table when EAS attestations are disabled
--
-- CONTEXT: The system can run with or without on-chain attestations (controlled by ENABLE_EAS env var)
-- - When EAS is enabled: check-ins create attestations in the attestations table
-- - When EAS is disabled: check-ins are only recorded in user_activities table
--
-- PROBLEM: The existing get_user_checkin_streak() only queries attestations table,
-- so streaks don't work when EAS is disabled.
--
-- SOLUTION: Create a new function that calculates streaks from user_activities,
-- and update the existing function to check both sources.

-- Add index for better performance on user_activities streak queries
CREATE INDEX IF NOT EXISTS idx_user_activities_checkin_date 
  ON public.user_activities(user_profile_id, activity_type, created_at)
  WHERE activity_type = 'daily_checkin';

-- Create function to get user ID from wallet address
CREATE OR REPLACE FUNCTION public.get_user_profile_id_from_address(wallet_addr TEXT)
RETURNS UUID AS $$
DECLARE
  profile_id UUID;
BEGIN
  -- Normalize address to lowercase for matching
  SELECT id INTO profile_id
  FROM public.user_profiles
  WHERE LOWER(wallet_address) = LOWER(wallet_addr)
  LIMIT 1;
  
  RETURN profile_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.get_user_profile_id_from_address(TEXT) IS 
  'Maps a wallet address to a user profile ID. Secured with fixed search_path per Supabase advisory 0011';

-- Create function to calculate streak from user_activities
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak_from_activities(profile_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
BEGIN
  -- Check consecutive days from today backwards
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.user_activities 
      WHERE user_profile_id = profile_id
        AND activity_type = 'daily_checkin'
        AND DATE(created_at) = current_date_check
    ) INTO checkin_exists;
    
    IF checkin_exists THEN
      streak_count := streak_count + 1;
      current_date_check := current_date_check - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
    
    -- Prevent infinite loops
    IF streak_count > 365 THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.get_user_checkin_streak_from_activities(UUID) IS 
  'Calculates daily check-in streak from user_activities table. Used when EAS attestations are disabled. Secured with fixed search_path per Supabase advisory 0011';

-- Update the existing get_user_checkin_streak to check both sources
-- First check attestations (for EAS-enabled mode), fallback to user_activities
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
  attestation_count INTEGER;
  profile_id UUID;
BEGIN
  -- First, check if there are any attestations at all
  SELECT COUNT(*) INTO attestation_count
  FROM public.attestations 
  WHERE recipient = user_address 
    AND schema_uid = '0xp2e_daily_checkin_001'
    AND is_revoked = false
  LIMIT 1;
  
  -- If attestations exist, use the attestation-based calculation
  IF attestation_count > 0 THEN
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.attestations 
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
      
      -- Prevent infinite loops
      IF streak_count > 365 THEN
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- No attestations found, check user_activities instead
    profile_id := get_user_profile_id_from_address(user_address);
    
    IF profile_id IS NOT NULL THEN
      streak_count := get_user_checkin_streak_from_activities(profile_id);
    END IF;
  END IF;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.get_user_checkin_streak(TEXT) IS 
  'Calculates daily check-in streak. Checks attestations table first (EAS-enabled mode), falls back to user_activities table (EAS-disabled mode). Secured with fixed search_path per Supabase advisory 0011';

-- Update has_checked_in_today to check both sources
CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  has_attestation BOOLEAN;
  profile_id UUID;
  has_activity BOOLEAN;
BEGIN
  -- First check attestations
  SELECT EXISTS (
    SELECT 1 FROM public.attestations 
    WHERE recipient = user_address 
      AND schema_uid = '0xp2e_daily_checkin_001'
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  ) INTO has_attestation;
  
  IF has_attestation THEN
    RETURN TRUE;
  END IF;
  
  -- If no attestation, check user_activities
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
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.has_checked_in_today(TEXT) IS 
  'Checks if user has checked in today. Checks attestations first (EAS mode), falls back to user_activities (non-EAS mode). Secured with fixed search_path per Supabase advisory 0011';

