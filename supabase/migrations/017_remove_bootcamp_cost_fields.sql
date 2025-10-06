-- Remove cost fields from bootcamp_programs table as they are no longer needed
-- Pricing will be handled through cohorts instead

ALTER TABLE public.bootcamp_programs
DROP COLUMN IF EXISTS cost_naira,
DROP COLUMN IF EXISTS cost_usd;
