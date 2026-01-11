-- Remove permissive public insert policy on applications.
-- Inserts should go through server-side validation using service_role.
DROP POLICY IF EXISTS "public_insert_applications" ON public.applications;
