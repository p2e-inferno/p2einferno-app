-- Create migration for Unlock Protocol integration
-- Adds lock_address columns and new tables for cohort milestones and membership caching

-- 1) Add lock_address to cohorts (ticketing lock)
ALTER TABLE public.cohorts ADD COLUMN IF NOT EXISTS lock_address TEXT;
-- Add lock_address to bootcamp_programs table
ALTER TABLE public.bootcamp_programs ADD COLUMN IF NOT EXISTS lock_address TEXT;
-- Add lock_address to quests table
ALTER TABLE public.quests ADD COLUMN IF NOT EXISTS lock_address TEXT;
-- 2) Table to model milestones for each cohort, each backed by its own lock onchain
CREATE TABLE IF NOT EXISTS public.cohort_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id TEXT NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    lock_address TEXT NOT NULL, -- PublicLock address for this milestone NFT
    prerequisite_milestone_id UUID REFERENCES public.cohort_milestones(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 3) Table to cache user ‑> cohort membership derived from on-chain keys
CREATE TABLE IF NOT EXISTS public.user_cohorts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, -- privy user id or wallet address hash
    cohort_id TEXT NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
    key_id TEXT, -- tokenId for the cohort key (optional cache)
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('active','completed','suspended','expelled')) DEFAULT 'active',
    UNIQUE(user_id, cohort_id)
);
-- 4) Table to cache user progress at milestone level (minted milestone keys)
CREATE TABLE IF NOT EXISTS public.user_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    milestone_id UUID NOT NULL REFERENCES public.cohort_milestones(id) ON DELETE CASCADE,
    key_id TEXT, -- tokenId for the milestone key (optional cache)
    completed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    UNIQUE(user_id, milestone_id)
);
-- 5) Table to cache user membership in bootcamp programs derived from on-chain keys
CREATE TABLE IF NOT EXISTS public.user_program_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL, 
    bootcamp_program_id TEXT NOT NULL REFERENCES public.bootcamp_programs(id) ON DELETE CASCADE,
    key_id TEXT, -- tokenId for the program key
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    membership_level TEXT,
    UNIQUE(user_id, bootcamp_program_id)
);
-- 6) Table to cache quest key ownership
CREATE TABLE IF NOT EXISTS public.user_quest_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    key_id TEXT NOT NULL, -- tokenId for the quest key
    acquired_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, quest_id, key_id)
);
-- Enable Row Level Security on new tables
ALTER TABLE public.cohort_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_program_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_keys ENABLE ROW LEVEL SECURITY;
-- Basic RLS: authenticated can read public program data; users can read/write their own rows
CREATE POLICY "Authenticated read cohort milestones" ON public.cohort_milestones FOR SELECT USING (true);
CREATE POLICY "Users manage own cohort membership" ON public.user_cohorts
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users manage own milestone progress" ON public.user_milestones
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users manage own program memberships" ON public.user_program_memberships
    FOR ALL USING (auth.uid()::text = user_id);
CREATE POLICY "Users manage own quest keys" ON public.user_quest_keys
    FOR ALL USING (auth.uid()::text = user_id);
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cohort_milestones_cohort_id ON public.cohort_milestones(cohort_id);
CREATE INDEX IF NOT EXISTS idx_user_cohorts_user_id ON public.user_cohorts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_milestones_user_id ON public.user_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_user_program_memberships_user_id ON public.user_program_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_keys_user_id ON public.user_quest_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_keys_quest_id ON public.user_quest_keys(quest_id);
-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_update_cohort_milestones_updated
BEFORE UPDATE ON public.cohort_milestones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_update_user_milestones_updated
BEFORE UPDATE ON public.user_milestones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
