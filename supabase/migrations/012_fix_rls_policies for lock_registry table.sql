-- Fix RLS policies for lock_registry table

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view lock registry" ON public.lock_registry;
DROP POLICY IF EXISTS "Service role can manage lock registry" ON public.lock_registry;
DROP POLICY IF EXISTS "Authenticated users can insert into lock registry" ON public.lock_registry;
DROP POLICY IF EXISTS "Authenticated users can update lock registry" ON public.lock_registry;
-- Create new policies
-- Allow authenticated users to view the registry
CREATE POLICY "Authenticated users can view lock registry" 
ON public.lock_registry
FOR SELECT 
USING (auth.role() = 'authenticated');
-- Allow service role to manage the registry (this is used by server-side API routes)
CREATE POLICY "Service role can manage lock registry" 
ON public.lock_registry
FOR ALL 
USING (auth.role() = 'service_role');
-- Create a policy for authenticated users to insert into lock_registry
CREATE POLICY "Authenticated users can insert into lock registry" 
ON public.lock_registry
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');
-- Create a policy for authenticated users to update lock_registry
CREATE POLICY "Authenticated users can update lock registry" 
ON public.lock_registry
FOR UPDATE
USING (auth.role() = 'authenticated');
-- Update the check_lock_address_uniqueness function to handle service role properly
CREATE OR REPLACE FUNCTION check_lock_address_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip checks if using service_role (admin operations)
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;
    
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Fix RLS policies for cohort_milestones table

-- Ensure RLS is enabled on cohort_milestones
ALTER TABLE public.cohort_milestones ENABLE ROW LEVEL SECURITY;
-- Drop any existing policies on cohort_milestones
DROP POLICY IF EXISTS "Admin users can manage milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Admin users can read milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can manage milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can read milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can insert milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can update milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can delete milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Service role can manage milestone records" ON public.cohort_milestones;
-- Create policies for cohort_milestones
CREATE POLICY "Authenticated users can read milestone records" 
    ON public.cohort_milestones
    FOR SELECT 
    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert milestone records" 
    ON public.cohort_milestones
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update milestone records" 
    ON public.cohort_milestones
    FOR UPDATE
    USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete milestone records" 
    ON public.cohort_milestones
    FOR DELETE
    USING (auth.role() = 'authenticated');
-- Allow service role to manage the table (this is used by server-side API routes)
CREATE POLICY "Service role can manage milestone records" 
    ON public.cohort_milestones
    FOR ALL 
    USING (auth.role() = 'service_role');
-- Note: Cohort date validation function and triggers were removed in migration 015
-- This was too restrictive as users should be able to register even after cohort starts
-- Frontend form validation is sufficient for basic date validation

-- The following code has been commented out and removed in later migration:
-- CREATE OR REPLACE FUNCTION validate_cohort_dates() ...
-- CREATE TRIGGER validate_cohort_dates_insert ...
-- CREATE TRIGGER validate_cohort_dates_update ...;
