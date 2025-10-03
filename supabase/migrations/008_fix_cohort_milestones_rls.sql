-- Fix RLS policies for cohort_milestones table

-- Ensure RLS is enabled on cohort_milestones
ALTER TABLE public.cohort_milestones ENABLE ROW LEVEL SECURITY;
-- Drop any existing policies on cohort_milestones
DROP POLICY IF EXISTS "Admin users can manage milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Admin users can read milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can manage milestone records" ON public.cohort_milestones;
DROP POLICY IF EXISTS "Authenticated users can read milestone records" ON public.cohort_milestones;
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
