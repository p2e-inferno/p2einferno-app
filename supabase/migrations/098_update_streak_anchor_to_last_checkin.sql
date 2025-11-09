-- 098_update_streak_anchor_to_last_checkin.sql
-- Adjust streak calculation to anchor at the most recent check-in day
-- RATIONALE:
-- - If the user last checked in today, count from today (unchanged behavior)
-- - If the user last checked in yesterday, count from yesterday so the existing
--   streak is shown before today's check-in
-- - If the last check-in is older than yesterday, streak is broken (return 0)

-- Update function to calculate streak from user_activities
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak_from_activities(profile_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE;
  checkin_exists BOOLEAN;
  last_date DATE;
BEGIN
  -- Determine the most recent check-in date (by day)
  SELECT DATE(MAX(created_at)) INTO last_date
  FROM public.user_activities
  WHERE user_profile_id = profile_id
    AND activity_type = 'daily_checkin';

  -- No check-ins at all
  IF last_date IS NULL THEN
    RETURN 0;
  END IF;

  -- Anchor starting point: today if checked in today, otherwise yesterday
  IF last_date = CURRENT_DATE THEN
    current_date_check := CURRENT_DATE;
  ELSIF last_date = (CURRENT_DATE - INTERVAL '1 day')::date THEN
    current_date_check := (CURRENT_DATE - INTERVAL '1 day')::date;
  ELSE
    -- Last check-in older than yesterday -> streak is broken
    RETURN 0;
  END IF;

  -- Count consecutive days backward from the anchor date
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

    -- Safety guard
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
  'Calculates daily check-in streak anchored at the most recent check-in day (today or yesterday). EAS-independent. Secured with fixed search_path per Supabase advisory 0011';

