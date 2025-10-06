-- 062_attestation_system.sql
-- Add Ethereum Attestation Service (EAS) integration for P2E Inferno
-- Adapted from Teerex implementation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Create attestation schemas table
CREATE TABLE IF NOT EXISTS public.attestation_schemas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema_definition TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('attendance', 'social', 'verification', 'review', 'achievement')),
  revocable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
-- Create attestations table
CREATE TABLE IF NOT EXISTS public.attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attestation_uid TEXT NOT NULL UNIQUE,
  schema_uid TEXT NOT NULL REFERENCES public.attestation_schemas(schema_uid),
  attester TEXT NOT NULL,
  recipient TEXT NOT NULL,
  data JSONB NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revocation_time TIMESTAMP WITH TIME ZONE,
  expiration_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Validation constraints
  CONSTRAINT valid_attester_address CHECK (length(attester) = 42),
  CONSTRAINT valid_recipient_address CHECK (length(recipient) = 42)
);
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attestations_schema_uid ON public.attestations(schema_uid);
CREATE INDEX IF NOT EXISTS idx_attestations_attester ON public.attestations(attester);
CREATE INDEX IF NOT EXISTS idx_attestations_recipient ON public.attestations(recipient);
CREATE INDEX IF NOT EXISTS idx_attestations_created_at ON public.attestations(created_at);
CREATE INDEX IF NOT EXISTS idx_attestation_schemas_category ON public.attestation_schemas(category);
CREATE INDEX IF NOT EXISTS idx_attestation_schemas_schema_uid ON public.attestation_schemas(schema_uid);
-- Enable RLS on attestation tables
ALTER TABLE public.attestation_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;
-- Create policies for attestation_schemas (public read, authenticated write)
CREATE POLICY "Anyone can view attestation schemas" 
  ON public.attestation_schemas 
  FOR SELECT 
  USING (true);
CREATE POLICY "Authenticated users can create attestation schemas" 
  ON public.attestation_schemas 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Schema creators can update their schemas" 
  ON public.attestation_schemas 
  FOR UPDATE 
  USING (auth.role() = 'authenticated');
-- Create policies for attestations
CREATE POLICY "Anyone can view attestations" 
  ON public.attestations 
  FOR SELECT 
  USING (true);
CREATE POLICY "Authenticated users can create attestations" 
  ON public.attestations 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Attesters can update their own attestations" 
  ON public.attestations 
  FOR UPDATE 
  USING (attester = current_setting('request.jwt.claims', true)::json->>'sub' OR auth.role() = 'service_role');
-- Insert default P2E Inferno attestation schemas
INSERT INTO public.attestation_schemas (schema_uid, name, description, schema_definition, category, revocable) VALUES
('0xp2e_daily_checkin_001', 'Daily Check-in', 'Simple daily check-in attestation for user engagement', 'address walletAddress,string greeting,uint256 timestamp,string userDid,uint256 xpGained', 'attendance', false),
('0xp2e_quest_completion_001', 'Quest Completion', 'Attestation for completed learning quests', 'string questId,string questTitle,address userAddress,uint256 completionDate,uint256 xpEarned,string difficulty', 'achievement', false),
('0xp2e_bootcamp_completion_001', 'Bootcamp Completion', 'Attestation for completed bootcamp programs', 'string bootcampId,string bootcampTitle,address userAddress,uint256 completionDate,uint256 totalXpEarned,string certificateHash', 'achievement', false),
('0xp2e_milestone_achievement_001', 'Milestone Achievement', 'Attestation for milestone achievements in learning journey', 'string milestoneId,string milestoneTitle,address userAddress,uint256 achievementDate,uint256 xpEarned,string skillLevel', 'achievement', false)
ON CONFLICT (schema_uid) DO NOTHING;
-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers to automatically update updated_at
CREATE TRIGGER update_attestation_schemas_updated_at 
  BEFORE UPDATE ON public.attestation_schemas 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attestations_updated_at 
  BEFORE UPDATE ON public.attestations 
  FOR EACH ROW 
  EXECUTE FUNCTION public.update_updated_at_column();
-- Create function to get user's daily check-in streak
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
BEGIN
  -- Check consecutive days from today backwards
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
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;
-- Create function to check if user has checked in today
CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.attestations 
    WHERE recipient = user_address 
      AND schema_uid = '0xp2e_daily_checkin_001'
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  );
END;
$$ LANGUAGE plpgsql;
