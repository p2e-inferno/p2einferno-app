-- Add image support to bootcamp programs
-- This migration adds image storage capabilities using Supabase Storage

-- Add image_url column to bootcamp_programs table
ALTER TABLE public.bootcamp_programs 
ADD COLUMN image_url TEXT;
-- Create storage bucket for bootcamp images if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bootcamp-images',
  'bootcamp-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;
-- Create storage policies for bootcamp images
-- Allow public read access to bootcamp images
CREATE POLICY "Public read access for bootcamp images" ON storage.objects
FOR SELECT USING (bucket_id = 'bootcamp-images');
-- Allow uploads to bootcamp images (anon or authenticated)
CREATE POLICY "Upload access for bootcamp images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'bootcamp-images'
  AND auth.role() IN ('anon', 'authenticated', 'service_role')
);
-- Allow authenticated admins to update bootcamp images
CREATE POLICY "Admin update access for bootcamp images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'bootcamp-images' 
  AND auth.role() = 'authenticated'
);
-- Allow authenticated admins to delete bootcamp images
CREATE POLICY "Admin delete access for bootcamp images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'bootcamp-images' 
  AND auth.role() = 'authenticated'
);
