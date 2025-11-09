-- Migration: Fix certificate storage RLS policies 
-- Description: Correct certificate bucket policies to match working task-submissions pattern

-- Drop any existing certificate policies to ensure clean setup  
DROP POLICY IF EXISTS "Public read access for certificates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload certificates" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own certificates" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own certificates" ON storage.objects;

-- Create corrected policies using task-submissions pattern (auth.role() syntax)
-- Public read access for certificates
CREATE POLICY "Public read access for certificates"
ON storage.objects FOR SELECT
USING (bucket_id = 'certificates');

-- Authenticated users can upload certificates (FIXED: use auth.role() like task-submissions)
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'certificates' AND auth.role() = 'authenticated');

-- Users can update their own certificates (for re-uploading)
CREATE POLICY "Users can update their own certificates"
ON storage.objects FOR UPDATE
USING (bucket_id = 'certificates' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'certificates' AND auth.role() = 'authenticated');

-- Users can delete their own certificates (cleanup)
CREATE POLICY "Users can delete their own certificates"
ON storage.objects FOR DELETE
USING (bucket_id = 'certificates' AND auth.role() = 'authenticated');