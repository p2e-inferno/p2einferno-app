-- Migration 107: Add quest prerequisites and trial activation support

-- 1. Add prerequisite columns to quests table
-- We treat lock address as first-class citizen for on-chain prerequisites
ALTER TABLE public.quests 
ADD COLUMN IF NOT EXISTS prerequisite_quest_lock_address TEXT,
ADD COLUMN IF NOT EXISTS prerequisite_quest_id UUID REFERENCES public.quests(id),
ADD COLUMN IF NOT EXISTS requires_prerequisite_key BOOLEAN NOT NULL DEFAULT false;

-- Add indexes for prerequisite lookups
CREATE INDEX IF NOT EXISTS idx_quests_prerequisite_quest_id ON public.quests(prerequisite_quest_id);
-- Partial index for queries filtering by lock address prereq
CREATE INDEX IF NOT EXISTS idx_quests_prereq_lock_addr ON public.quests(prerequisite_quest_lock_address) 
WHERE prerequisite_quest_lock_address IS NOT NULL;

-- 2. Add activation/reward configuration
-- Default to 'xdg' to match current behavior (XP points branded as xDG)
ALTER TABLE public.quests 
ADD COLUMN IF NOT EXISTS reward_type TEXT NOT NULL DEFAULT 'xdg' CHECK (reward_type IN ('xdg', 'activation')),
ADD COLUMN IF NOT EXISTS activation_type TEXT CHECK (activation_type IN ('dg_trial')),
ADD COLUMN IF NOT EXISTS activation_config JSONB;

-- 3. Create user_activation_grants table for tracking one-time trials
CREATE TABLE IF NOT EXISTS public.user_activation_grants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    activation_type TEXT NOT NULL,
    lock_address TEXT, -- The lock address where access was granted (if applicable)
    metadata JSONB,    -- Extra info like tx hash, token ID, etc.
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    quest_id UUID REFERENCES public.quests(id) ON DELETE SET NULL,
    
    -- Enforce one-time grant per activation type per user
    UNIQUE(user_id, activation_type)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_activation_grants_user_type ON public.user_activation_grants(user_id, activation_type);

-- Enable RLS
ALTER TABLE public.user_activation_grants ENABLE ROW LEVEL SECURITY;

-- RLS Policies:
-- Only service role (admin) can manage grants. 
-- Authenticated users can view their own grants (useful for UI state).

CREATE POLICY "Service role manages all grants" ON public.user_activation_grants
    USING (true)
    WITH CHECK (true);

-- Users can see their own grants to know if they've used a trial
CREATE POLICY "Users can view own activation grants" ON public.user_activation_grants
    FOR SELECT
    USING (auth.uid()::text = user_id);

