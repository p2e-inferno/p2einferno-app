-- Allow anonymous uploads to quest images bucket so that the front-end (which uses the anon key) can upload
-- safely. The bucket is already public-read, and uploads are limited to image mime types and 5 MB.

BEGIN;

-- Grant anon role ability to insert into quest-images bucket
CREATE POLICY "Anon upload access for quest images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'quest-images'
  AND auth.role() = 'anon'
);

-- Optionally allow updates/deletes by anon if desired (commented out)
-- CREATE POLICY "Anon update access for quest images" ON storage.objects
-- FOR UPDATE USING (
--   bucket_id = 'quest-images' AND auth.role() = 'anon'
-- ) WITH CHECK (
--   bucket_id = 'quest-images' AND auth.role() = 'anon'
-- );

COMMIT; 