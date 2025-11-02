-- 097_eas_independent_streak_functions.sql
-- Update streak calculation functions to be EAS-independent
-- Always use user_activities table as single source of truth for streak calculation
--
-- RATIONALE: 
-- - Simplifies architecture by removing dual-source complexity
-- - Works regardless of EAS enabled/disabled state
-- - Uses activity_type = 'daily_checkin' for filtering (no schema_uid needed)
-- - Attestations become optional for persistence only, not core functionality

-- Update get_user_checkin_streak to always use user_activities
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER AS $$
DECLARE
  profile_id UUID;
BEGIN
  -- Always use user_activities (EAS-independent)
  profile_id := get_user_profile_id_from_address(user_address);
  
  IF profile_id IS NOT NULL THEN
    RETURN get_user_checkin_streak_from_activities(profile_id);
  END IF;
  
  RETURN 0;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.get_user_checkin_streak(TEXT) IS 
  'Calculates daily check-in streak using user_activities table only. EAS-independent. Secured with fixed search_path per Supabase advisory 0011';

-- Update has_checked_in_today to always use user_activities
CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  profile_id UUID;
BEGIN
  -- Always use user_activities (EAS-independent)
  profile_id := get_user_profile_id_from_address(user_address);
  
  IF profile_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_activities
      WHERE user_profile_id = profile_id
        AND activity_type = 'daily_checkin'
        AND DATE(created_at) = CURRENT_DATE
    );
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.has_checked_in_today(TEXT) IS 
  'Checks if user has checked in today using user_activities table only. EAS-independent. Secured with fixed search_path per Supabase advisory 0011';

-- Add function to get last checkin date from user_activities
CREATE OR REPLACE FUNCTION public.get_last_checkin_date(user_address TEXT)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  profile_id UUID;
  last_checkin TIMESTAMP WITH TIME ZONE;
BEGIN
  profile_id := get_user_profile_id_from_address(user_address);
  
  IF profile_id IS NOT NULL THEN
    SELECT created_at INTO last_checkin
    FROM public.user_activities
    WHERE user_profile_id = profile_id
      AND activity_type = 'daily_checkin'
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN last_checkin;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public';

COMMENT ON FUNCTION public.get_last_checkin_date(TEXT) IS 
  'Gets the last check-in date from user_activities table. EAS-independent. Secured with fixed search_path per Supabase advisory 0011';

-- Keep the original functions as deprecated but functional for backward compatibility
-- (The client code will use the simplified versions above)

-- Add comments to clarify the new architecture
COMMENT ON TABLE public.user_activities IS 
  'Core activity tracking table. Used for streak calculation regardless of EAS mode. activity_type=daily_checkin identifies check-ins.';

COMMENT ON TABLE public.attestations IS 
  'Optional attestation storage for EAS mode. Not used for streak calculation - only for on-chain attestation persistence.';