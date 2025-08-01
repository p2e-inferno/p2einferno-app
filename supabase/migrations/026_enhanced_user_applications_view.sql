-- Enhanced User Applications View Migration
-- Update user_applications_view to include enrollment information for easier inconsistency detection

-- Drop the existing view
DROP VIEW IF EXISTS public.user_applications_view;

-- Create enhanced view with enrollment data
CREATE OR REPLACE VIEW public.user_applications_view AS
SELECT 
  uas.id,
  uas.user_profile_id,
  uas.application_id,
  uas.status,
  uas.created_at,
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
FROM public.user_application_status uas
JOIN public.applications a ON uas.application_id = a.id
LEFT JOIN public.bootcamp_enrollments be ON be.user_profile_id = uas.user_profile_id 
  AND be.cohort_id = a.cohort_id
LEFT JOIN public.cohorts c ON c.id = a.cohort_id;

-- Grant necessary permissions
GRANT SELECT ON public.user_applications_view TO authenticated;
GRANT SELECT ON public.user_applications_view TO service_role;