-- Add award_xp_to_user function that was missing from local database
-- This function exists in the remote database but was missing locally

CREATE OR REPLACE FUNCTION public.award_xp_to_user(
    p_user_id uuid, 
    p_xp_amount integer, 
    p_activity_type text, 
    p_activity_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
    -- Update experience_points on user_profiles
    UPDATE public.user_profiles
    SET experience_points = experience_points + p_xp_amount
    WHERE id = p_user_id;

    -- Log the activity in user_activities
    INSERT INTO public.user_activities (user_profile_id, activity_type, points_earned, activity_data)
    VALUES (p_user_id, p_activity_type, p_xp_amount, p_activity_data);
END;
$function$;

-- Add comment for documentation
COMMENT ON FUNCTION public.award_xp_to_user(uuid, integer, text, jsonb) IS 'Awards XP to a user and logs the activity. Secured with fixed search_path per Supabase advisory 0011';
