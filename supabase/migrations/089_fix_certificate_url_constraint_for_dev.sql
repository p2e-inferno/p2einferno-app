-- Migration: Remove HTTPS constraint from certificate URLs
-- Description: Remove HTTPS-only constraint to match task submission pattern and allow all environments

-- Drop existing constraint to allow any URL format (matching task_submissions.submission_url pattern)
ALTER TABLE public.bootcamp_enrollments
  DROP CONSTRAINT IF EXISTS certificate_url_https_only;

-- Update comment to reflect the change
COMMENT ON COLUMN public.bootcamp_enrollments.certificate_image_url IS
  'URL to generated certificate image from Supabase Storage. Validated against Supabase Storage domain in application code. No URL format constraints to support all environments.';