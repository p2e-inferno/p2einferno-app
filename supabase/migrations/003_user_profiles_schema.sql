-- 003_user_profiles_schema.sql
-- Add user profile tables and relationships

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  privy_user_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE,
  display_name VARCHAR(100),
  email VARCHAR(255),
  wallet_address VARCHAR(42),
  linked_wallets JSONB DEFAULT '[]'::jsonb,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active', -- active, inactive, banned
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
-- User Application Status Table
-- This links users with their applications
CREATE TABLE IF NOT EXISTS public.user_application_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, expired
  payment_intent_id VARCHAR(255),
  payment_method VARCHAR(20),
  amount_paid DECIMAL(10, 2),
  currency VARCHAR(10),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_profile_id, application_id)
);
-- User Activities Table (for tracking user actions)
CREATE TABLE IF NOT EXISTS public.user_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL, -- login, application_submit, payment_complete, etc.
  activity_data JSONB DEFAULT '{}'::jsonb,
  points_earned INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
-- Bootcamp Enrollments Table
-- This links users with their cohort enrollments
CREATE TABLE IF NOT EXISTS public.bootcamp_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  cohort_id TEXT REFERENCES public.cohorts(id) ON DELETE CASCADE,
  enrollment_status VARCHAR(20) DEFAULT 'enrolled', -- enrolled, completed, dropped, suspended
  progress JSONB DEFAULT '{
    "modules_completed": 0,
    "total_modules": 8
  }'::jsonb,
  completion_date TIMESTAMP WITH TIME ZONE,
  certificate_issued BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  
  UNIQUE(user_profile_id, cohort_id)
);
-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_privy_user_id ON public.user_profiles(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet_address ON public.user_profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_application_status_user_profile_id ON public.user_application_status(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_application_status_status ON public.user_application_status(status);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_profile_id ON public.user_activities(user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_activity_type ON public.user_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_bootcamp_enrollments_user_profile_id ON public.bootcamp_enrollments(user_profile_id);
-- Create or update the trigger function if needed
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at 
  BEFORE UPDATE ON public.user_profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_application_status_updated_at ON public.user_application_status;
CREATE TRIGGER update_user_application_status_updated_at 
  BEFORE UPDATE ON public.user_application_status 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_bootcamp_enrollments_updated_at ON public.bootcamp_enrollments;
CREATE TRIGGER update_bootcamp_enrollments_updated_at 
  BEFORE UPDATE ON public.bootcamp_enrollments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_application_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bootcamp_enrollments ENABLE ROW LEVEL SECURITY;
-- RLS Policies
-- For user_profiles
CREATE POLICY "Users can view their own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid()::text = privy_user_id);
CREATE POLICY "Service role can manage all profiles" ON public.user_profiles
  FOR ALL USING (auth.role() = 'service_role');
-- For user_application_status
CREATE POLICY "Users can view their own application status" ON public.user_application_status
  FOR SELECT USING (auth.uid() IN (
    SELECT privy_user_id::uuid FROM public.user_profiles 
    WHERE id = user_profile_id
  ));
CREATE POLICY "Service role can manage all application statuses" ON public.user_application_status
  FOR ALL USING (auth.role() = 'service_role');
-- For user_activities
CREATE POLICY "Users can view their own activities" ON public.user_activities
  FOR SELECT USING (auth.uid() IN (
    SELECT privy_user_id::uuid FROM public.user_profiles 
    WHERE id = user_profile_id
  ));
CREATE POLICY "Service role can manage all activities" ON public.user_activities
  FOR ALL USING (auth.role() = 'service_role');
-- For bootcamp_enrollments
CREATE POLICY "Users can view their own enrollments" ON public.bootcamp_enrollments
  FOR SELECT USING (auth.uid() IN (
    SELECT privy_user_id::uuid FROM public.user_profiles 
    WHERE id = user_profile_id
  ));
CREATE POLICY "Service role can manage all enrollments" ON public.bootcamp_enrollments
  FOR ALL USING (auth.role() = 'service_role');
-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT ON public.user_application_status TO authenticated;
GRANT SELECT ON public.user_activities TO authenticated;
GRANT SELECT ON public.bootcamp_enrollments TO authenticated;
-- Create views for easier data access
-- This view joins user_application_status with applications for easier querying
CREATE OR REPLACE VIEW public.user_applications_view AS
SELECT 
  uas.id,
  uas.user_profile_id,
  uas.application_id,
  uas.status,
  uas.created_at,
  a.cohort_id,
  a.user_name,
  a.user_email,
  a.experience_level,
  a.payment_status,
  a.application_status
FROM public.user_application_status uas
JOIN public.applications a ON uas.application_id = a.id;
-- This view joins bootcamp_enrollments with cohorts for easier querying
CREATE OR REPLACE VIEW public.user_enrollments_view AS
SELECT 
  be.id,
  be.user_profile_id,
  be.cohort_id,
  be.enrollment_status,
  be.progress,
  be.completion_date,
  c.name as cohort_name,
  c.bootcamp_program_id,
  c.start_date,
  c.end_date
FROM public.bootcamp_enrollments be
JOIN public.cohorts c ON be.cohort_id = c.id;
