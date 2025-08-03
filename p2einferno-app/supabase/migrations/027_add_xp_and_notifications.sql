-- Migration: 027_add_xp_and_notifications.sql
-- This migration adds tables and functions for the XP and notification systems.

-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- RLS for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own notifications" ON public.notifications
    FOR ALL USING (auth.uid() = (SELECT privy_user_id FROM public.user_profiles WHERE id = user_profile_id));
CREATE POLICY "Service role can manage all notifications" ON public.notifications
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_notifications_user_profile_id ON public.notifications(user_profile_id);

-- 2. Create Function to Award XP and Log Activity
CREATE OR REPLACE FUNCTION award_xp_to_user(
    p_user_id UUID,
    p_xp_amount INTEGER,
    p_activity_type TEXT,
    p_activity_data JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update experience_points on user_profiles
    UPDATE public.user_profiles
    SET experience_points = experience_points + p_xp_amount
    WHERE id = p_user_id;

    -- Log the activity in user_activities
    INSERT INTO public.user_activities (user_profile_id, activity_type, points_earned, activity_data)
    VALUES (p_user_id, p_activity_type, p_xp_amount, p_activity_data);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION award_xp_to_user(UUID, INTEGER, TEXT, JSONB) TO service_role; 