-- Add registration date fields to bootcamp_programs table if they don't exist
ALTER TABLE IF EXISTS public.bootcamp_programs
ADD COLUMN IF NOT EXISTS registration_start DATE,
ADD COLUMN IF NOT EXISTS registration_end DATE;

-- Update existing bootcamp programs with default registration dates if they're NULL
UPDATE public.bootcamp_programs
SET 
  registration_start = '2024-01-01',
  registration_end = '2024-12-31'
WHERE registration_start IS NULL OR registration_end IS NULL;

-- Ensure RLS policies for bootcamp_programs and cohorts are properly set up
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow read access to bootcamp_programs" ON public.bootcamp_programs;
DROP POLICY IF EXISTS "Allow authenticated users to manage bootcamp_programs" ON public.bootcamp_programs;
DROP POLICY IF EXISTS "Allow service role to manage bootcamp_programs" ON public.bootcamp_programs;

-- Create new policies for bootcamp_programs
CREATE POLICY "Allow read access to bootcamp_programs" 
ON public.bootcamp_programs 
FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated users to manage bootcamp_programs" 
ON public.bootcamp_programs 
FOR ALL 
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role to manage bootcamp_programs" 
ON public.bootcamp_programs 
FOR ALL 
USING (auth.role() = 'service_role');

-- Drop existing policies for cohorts if they exist
DROP POLICY IF EXISTS "Allow read access to cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Allow authenticated users to manage cohorts" ON public.cohorts;
DROP POLICY IF EXISTS "Allow service role to manage cohorts" ON public.cohorts;

-- Create new policies for cohorts
CREATE POLICY "Allow read access to cohorts" 
ON public.cohorts 
FOR SELECT 
USING (true);

CREATE POLICY "Allow authenticated users to manage cohorts" 
ON public.cohorts 
FOR ALL 
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role to manage cohorts" 
ON public.cohorts 
FOR ALL 
USING (auth.role() = 'service_role'); 