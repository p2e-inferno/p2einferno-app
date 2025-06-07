-- User Profiles Table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  privy_user_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  email VARCHAR(255),
  wallet_address VARCHAR(42),
  linked_wallets JSONB DEFAULT '[]',
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, banned
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- User Application Status Table
CREATE TABLE user_application_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, expired
  payment_intent_id VARCHAR(255),
  payment_method VARCHAR(20),
  amount_paid DECIMAL(10, 2),
  currency VARCHAR(10),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  
  UNIQUE(user_profile_id, application_id)
);

-- User Activities Table (for tracking user actions)
CREATE TABLE user_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL, -- login, application_submit, payment_complete, etc.
  activity_data JSONB DEFAULT '{}',
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bootcamp Enrollments Table
CREATE TABLE bootcamp_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  cohort_id VARCHAR(255) NOT NULL,
  enrollment_status VARCHAR(20) DEFAULT 'enrolled', -- enrolled, completed, dropped, suspended
  progress JSONB DEFAULT '{}', -- Store progress data
  completion_date TIMESTAMP WITH TIME ZONE,
  certificate_issued BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  
  UNIQUE(user_profile_id, cohort_id)
);

-- Indexes for better performance
CREATE INDEX idx_user_profiles_privy_user_id ON user_profiles(privy_user_id);
CREATE INDEX idx_user_profiles_wallet_address ON user_profiles(wallet_address);
CREATE INDEX idx_user_application_status_user_profile_id ON user_application_status(user_profile_id);
CREATE INDEX idx_user_application_status_status ON user_application_status(status);
CREATE INDEX idx_user_activities_user_profile_id ON user_activities(user_profile_id);
CREATE INDEX idx_user_activities_activity_type ON user_activities(activity_type);
CREATE INDEX idx_bootcamp_enrollments_user_profile_id ON bootcamp_enrollments(user_profile_id);

-- Functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_application_status_updated_at BEFORE UPDATE ON user_application_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bootcamp_enrollments_updated_at BEFORE UPDATE ON bootcamp_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 