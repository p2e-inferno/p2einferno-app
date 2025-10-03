-- Sync storage policies with remote
-- Based on differences found in remote schema pull

-- Update bootcamp images upload policy to match remote
drop policy if exists "Upload access for bootcamp images" on storage.objects;
create policy "Upload access for bootcamp images"
on storage.objects
as permissive
for insert
to public
with check (((bucket_id = 'bootcamp-images'::text) AND (auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))));
