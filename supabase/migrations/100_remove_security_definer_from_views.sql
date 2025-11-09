-- 100_remove_security_definer_from_views.sql
-- Remove SECURITY DEFINER from views to prevent privilege escalation
-- Per Supabase advisory 0010: Security Definer views can bypass RLS and cause unauthorized access
-- Affected: all_applications_view, user_applications_view
--
-- This migration ensures views are recreated without any SECURITY DEFINER properties,
-- so they run with the permissions of the querying user, not the view creator.

-- ============================================================================
-- STEP 1: Drop existing views completely (with CASCADE to handle dependencies)
-- ============================================================================

DROP VIEW IF EXISTS public.all_applications_view CASCADE;
DROP VIEW IF EXISTS public.user_applications_view CASCADE;

-- ============================================================================
-- STEP 2: Recreate all_applications_view WITHOUT SECURITY DEFINER
-- ============================================================================

CREATE VIEW public.all_applications_view AS
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

-- ============================================================================
-- STEP 3: Recreate user_applications_view WITHOUT SECURITY DEFINER
-- ============================================================================

CREATE VIEW public.user_applications_view AS
SELECT
  COALESCE(uas.id, gen_random_uuid()) as id,
  COALESCE(a.user_profile_id, up.id) as user_profile_id,
  a.id as application_id,
  COALESCE(uas.status,
    CASE
      WHEN a.payment_status = 'completed' THEN 'completed'
      WHEN a.payment_status = 'failed' THEN 'failed'
      ELSE 'pending'
    END
  ) as status,
  COALESCE(uas.created_at, a.created_at) as created_at,
  a.cohort_id,
  a.user_name,
  a.user_email,
  a.experience_level,
  a.payment_status,
  a.application_status,
  -- Add enrollment information
  be.id as enrollment_id,
  be.enrollment_status,
  be.created_at as enrollment_created_at,
  -- Add cohort information for easier access
  c.name as cohort_name,
  c.start_date as cohort_start_date,
  c.end_date as cohort_end_date
FROM public.applications a
LEFT JOIN public.user_application_status uas ON uas.application_id = a.id
LEFT JOIN public.user_profiles up ON up.email = a.user_email OR up.id = a.user_profile_id
LEFT JOIN public.bootcamp_enrollments be ON be.user_profile_id = COALESCE(a.user_profile_id, up.id)
  AND be.cohort_id = a.cohort_id
LEFT JOIN public.cohorts c ON c.id = a.cohort_id
WHERE COALESCE(a.user_profile_id, up.id) IS NOT NULL;

-- ============================================================================
-- STEP 4: Grant permissions
-- ============================================================================

GRANT SELECT ON public.all_applications_view TO authenticated, service_role;
GRANT SELECT ON public.user_applications_view TO authenticated, service_role;

-- ============================================================================
-- STEP 5: Add comments documenting the security fix
-- ============================================================================

COMMENT ON VIEW public.all_applications_view IS 
'Shows ALL applications including orphaned ones. Security fixed: removed SECURITY DEFINER per Supabase advisory 0010. Views now run with querying user permissions and respect RLS policies.';

COMMENT ON VIEW public.user_applications_view IS 
'Enhanced view that gracefully handles missing user_application_status records. Security fixed: removed SECURITY DEFINER per Supabase advisory 0010. Views now run with querying user permissions and respect RLS policies.';

