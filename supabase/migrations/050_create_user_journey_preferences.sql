-- Create table for tracking user preferences for hiding journeys from lobby
CREATE TABLE IF NOT EXISTS user_journey_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES bootcamp_enrollments(id) ON DELETE CASCADE,
    is_hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_profile_id, enrollment_id) -- Prevent duplicate preferences for same user-enrollment pair
);
-- Add Row Level Security (RLS)
ALTER TABLE user_journey_preferences ENABLE ROW LEVEL SECURITY;
-- Create RLS policies
CREATE POLICY "Users can only access their own journey preferences"
    ON user_journey_preferences
    FOR ALL
    USING (
        user_profile_id IN (
            SELECT id FROM user_profiles 
            WHERE privy_user_id = (auth.jwt() ->> 'sub')::text
        )
    );
-- Create indexes for performance
CREATE INDEX idx_user_journey_preferences_user_profile_id ON user_journey_preferences(user_profile_id);
CREATE INDEX idx_user_journey_preferences_enrollment_id ON user_journey_preferences(enrollment_id);
CREATE INDEX idx_user_journey_preferences_is_hidden ON user_journey_preferences(is_hidden);
-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_journey_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER user_journey_preferences_updated_at
    BEFORE UPDATE ON user_journey_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_user_journey_preferences_updated_at();
