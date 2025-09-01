-- Create storage bucket for quest images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quest-images', 
  'quest-images', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for quest images
CREATE POLICY "Quest images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'quest-images');

CREATE POLICY "Authenticated users can upload quest images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'quest-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update quest images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'quest-images' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'quest-images' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete quest images"
ON storage.objects FOR DELETE
USING (bucket_id = 'quest-images' AND auth.role() = 'authenticated');