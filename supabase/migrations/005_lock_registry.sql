-- Create a central registry of Unlock Protocol locks
-- This ensures each lock_address can only be used once across all tables

-- 1) Create lock registry table
CREATE TABLE IF NOT EXISTS public.lock_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lock_address TEXT UNIQUE NOT NULL,
    entity_type TEXT NOT NULL, -- 'bootcamp_program', 'cohort', 'quest', 'milestone'
    entity_id TEXT NOT NULL, -- ID of the associated entity
    purpose TEXT NOT NULL, -- e.g., 'access', 'certificate', 'badge'
    network TEXT NOT NULL, -- blockchain network: 'ethereum', 'polygon', etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_type, entity_id) -- Each entity can have only one lock
);

-- 2) Modify tables to reference the registry
-- Add foreign keys and make lock_address column unique within each table

-- Update bootcamp_programs
-- First, insert existing lock_addresses into registry (if any)
INSERT INTO public.lock_registry (lock_address, entity_type, entity_id, purpose, network)
SELECT 
    lock_address, 
    'bootcamp_program', 
    id, 
    'program_certification', 
    'polygon'
FROM 
    public.bootcamp_programs 
WHERE 
    lock_address IS NOT NULL 
AND 
    lock_address != ''
ON CONFLICT (lock_address) DO NOTHING;

-- Create constraint trigger to check registry before insert/update
CREATE OR REPLACE FUNCTION check_lock_address_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lock_address IS NOT NULL AND NEW.lock_address != '' THEN
        -- Check if lock_address already exists in registry for a different entity
        IF EXISTS (
            SELECT 1 FROM public.lock_registry 
            WHERE lock_address = NEW.lock_address 
            AND NOT (entity_type = TG_ARGV[0] AND entity_id = NEW.id)
        ) THEN
            RAISE EXCEPTION 'Lock address % is already in use by another entity', NEW.lock_address;
        END IF;
        
        -- Register or update the lock address
        INSERT INTO public.lock_registry (lock_address, entity_type, entity_id, purpose, network)
        VALUES (NEW.lock_address, TG_ARGV[0], NEW.id, TG_ARGV[1], 'polygon')
        ON CONFLICT (entity_type, entity_id) 
        DO UPDATE SET 
            lock_address = NEW.lock_address,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to each table

-- For bootcamp_programs
DROP TRIGGER IF EXISTS check_bootcamp_program_lock_address ON public.bootcamp_programs;
CREATE TRIGGER check_bootcamp_program_lock_address
BEFORE INSERT OR UPDATE OF lock_address ON public.bootcamp_programs
FOR EACH ROW
EXECUTE FUNCTION check_lock_address_uniqueness('bootcamp_program', 'program_certification');

-- For cohorts
DROP TRIGGER IF EXISTS check_cohort_lock_address ON public.cohorts;
CREATE TRIGGER check_cohort_lock_address
BEFORE INSERT OR UPDATE OF lock_address ON public.cohorts
FOR EACH ROW
EXECUTE FUNCTION check_lock_address_uniqueness('cohort', 'access_ticket');

-- For quests
DROP TRIGGER IF EXISTS check_quest_lock_address ON public.quests;
CREATE TRIGGER check_quest_lock_address
BEFORE INSERT OR UPDATE OF lock_address ON public.quests
FOR EACH ROW
EXECUTE FUNCTION check_lock_address_uniqueness('quest', 'completion_badge');

-- For milestones (they already have lock_address)
DROP TRIGGER IF EXISTS check_milestone_lock_address ON public.cohort_milestones;
CREATE TRIGGER check_milestone_lock_address
BEFORE INSERT OR UPDATE OF lock_address ON public.cohort_milestones
FOR EACH ROW
EXECUTE FUNCTION check_lock_address_uniqueness('milestone', 'achievement_badge');

-- Enable Row Level Security on registry
ALTER TABLE public.lock_registry ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view lock registry" ON public.lock_registry
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage lock registry" ON public.lock_registry
    FOR ALL USING (auth.role() = 'service_role');

-- Add index for performance
CREATE INDEX idx_lock_registry_lock_address ON public.lock_registry(lock_address);

-- Update the trigger function for updated_at
CREATE TRIGGER trg_update_lock_registry_updated
BEFORE UPDATE ON public.lock_registry
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); 