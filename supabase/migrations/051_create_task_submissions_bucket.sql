-- Create storage bucket for task submission files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-submissions',
  'task-submissions',
  true,
  20971520, -- 20MB limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for task submissions
-- Public read (to allow reviewers to access); authenticated users can write
CREATE POLICY "Task submissions are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'task-submissions');

CREATE POLICY "Authenticated users can upload task submission files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'task-submissions' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update their task submission files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'task-submissions' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'task-submissions' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete their task submission files"
ON storage.objects FOR DELETE
USING (bucket_id = 'task-submissions' AND auth.role() = 'authenticated');


