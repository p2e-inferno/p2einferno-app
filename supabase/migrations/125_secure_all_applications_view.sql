-- Ensure all_applications_view runs as invoker and is service-role only
-- This prevents SECURITY DEFINER exposure to authenticated users.

CREATE OR REPLACE VIEW public.all_applications_view
WITH (security_invoker = true) AS
SELECT
  a.id as application_id,
  a.user_profile_id,
  a.cohort_id,
  a.user_name,
  a.user_email,
  a.phone_number,
  a.experience_level,
  a.motivation,
  a.goals,
  a.payment_status,
  a.application_status,
  a.payment_method,
  a.created_at as application_created_at,
  a.updated_at as application_updated_at,
  -- User application status (may be null)
  uas.id as user_application_status_id,
  uas.status as user_application_status,
  uas.created_at as status_created_at,
  -- User profile info
  up.id as profile_id,
  up.privy_user_id,
  up.username,
  up.wallet_address,
  -- Enrollment info (may be null)
  be.id as enrollment_id,
  be.enrollment_status,
  be.created_at as enrollment_created_at,
  -- Cohort info
  c.name as cohort_name,
  c.start_date as cohort_start_date,
  c.end_date as cohort_end_date,
  -- Flags for data issues
  CASE WHEN uas.id IS NULL THEN true ELSE false END as missing_user_status,
  CASE WHEN a.user_profile_id IS NULL THEN true ELSE false END as missing_profile_link,
  CASE WHEN a.payment_status = 'completed' AND be.id IS NULL THEN true ELSE false END as missing_enrollment
FROM public.applications a
LEFT JOIN public.user_application_status uas ON uas.application_id = a.id
LEFT JOIN public.user_profiles up ON up.id = COALESCE(a.user_profile_id, uas.user_profile_id)
LEFT JOIN public.bootcamp_enrollments be ON be.user_profile_id = COALESCE(a.user_profile_id, uas.user_profile_id)
  AND be.cohort_id = a.cohort_id
LEFT JOIN public.cohorts c ON c.id = a.cohort_id;

REVOKE ALL ON public.all_applications_view FROM authenticated;
REVOKE ALL ON public.all_applications_view FROM anon;
GRANT SELECT ON public.all_applications_view TO service_role;

COMMENT ON VIEW public.all_applications_view IS
'Admin-only view; SECURITY INVOKER; service_role only.';
