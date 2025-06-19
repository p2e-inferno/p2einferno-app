-- This migration originally added registration date fields to bootcamp_programs table
-- These fields have been removed in migration 014_remove_registration_dates_add_cohort_fields.sql
-- Keeping this file for historical reference but commenting out the changes

-- ALTER TABLE IF EXISTS public.bootcamp_programs
-- ADD COLUMN IF NOT EXISTS registration_start DATE,
-- ADD COLUMN IF NOT EXISTS registration_end DATE; 