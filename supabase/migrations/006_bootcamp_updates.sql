-- Add registration date fields to bootcamp_programs table
ALTER TABLE IF EXISTS public.bootcamp_programs
ADD COLUMN IF NOT EXISTS registration_start DATE,
ADD COLUMN IF NOT EXISTS registration_end DATE; 