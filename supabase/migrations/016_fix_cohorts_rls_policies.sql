-- Fix RLS policies for cohorts table to ensure proper access for authenticated users
-- This resolves the "new row violates row-level security policy" error

-- Drop existing policies
DROP POLICY IF EXISTS "Allow read access to cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Allow authenticated users to manage cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Allow service role to manage cohorts" ON public.cohorts;
-- Create new policies with better conditions
-- Allow anyone to read cohorts
CREATE POLICY "Enable read access for all users" ON public.cohorts
    FOR SELECT USING (true);
-- Allow authenticated users to insert/update/delete cohorts
CREATE POLICY "Enable insert for authenticated users" ON public.cohorts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users" ON public.cohorts
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Enable delete for authenticated users" ON public.cohorts
    FOR DELETE USING (auth.role() = 'authenticated');
-- Allow service role full access
CREATE POLICY "Enable all for service role" ON public.cohorts
    FOR ALL USING (auth.role() = 'service_role');
