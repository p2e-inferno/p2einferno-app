-- Migration: Add certificate image storage support
-- Description: Adds certificate_image_url column to bootcamp_enrollments and sets up Supabase Storage bucket

-- ====================================
-- Part 1: Database Schema Updates
-- ====================================

-- Add column to store certificate image URL
ALTER TABLE public.bootcamp_enrollments
  ADD COLUMN IF NOT EXISTS certificate_image_url TEXT;

-- Add constraint to ensure HTTPS URLs only (security)
ALTER TABLE public.bootcamp_enrollments
  ADD CONSTRAINT certificate_url_https_only
  CHECK (certificate_image_url IS NULL OR certificate_image_url LIKE 'https://%');

-- Index for efficient lookups of certificates with stored images
CREATE INDEX IF NOT EXISTS idx_be_certificate_image_url
  ON public.bootcamp_enrollments (cohort_id, user_profile_id)
  WHERE certificate_image_url IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.bootcamp_enrollments.certificate_image_url IS
  'Permanent URL to generated certificate image from Supabase Storage. Must be HTTPS. Validated against Supabase Storage domain in application code.';

-- ====================================
-- Part 2: Supabase Storage Setup
-- ====================================

-- Create public bucket for certificates
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Public read access for certificates
CREATE POLICY "Public read access for certificates"
ON storage.objects FOR SELECT
USING (bucket_id = 'certificates');

-- RLS policy: Authenticated users can upload certificates
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'certificates');

-- RLS policy: Users can update their own certificates (for re-uploading)
CREATE POLICY "Users can update their own certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'certificates')
WITH CHECK (bucket_id = 'certificates');

-- RLS policy: Users can delete their own certificates (cleanup)
CREATE POLICY "Users can delete their own certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'certificates');
