-- Remove registration date fields from bootcamp_programs table
ALTER TABLE public.bootcamp_programs
DROP COLUMN IF EXISTS registration_start,
DROP COLUMN IF EXISTS registration_end;
-- Add new fields to cohorts table
ALTER TABLE public.cohorts
ADD COLUMN IF NOT EXISTS key_managers text[],
ADD COLUMN IF NOT EXISTS usdt_amount decimal(10,2),
ADD COLUMN IF NOT EXISTS naira_amount decimal(12,2);
-- Add comments for documentation
COMMENT ON COLUMN public.cohorts.key_managers IS 'Array of wallet addresses for key managers';
COMMENT ON COLUMN public.cohorts.usdt_amount IS 'Cohort price in USDT';
COMMENT ON COLUMN public.cohorts.naira_amount IS 'Cohort price in Nigerian Naira';
