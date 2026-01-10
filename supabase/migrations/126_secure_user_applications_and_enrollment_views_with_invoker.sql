-- Ensure views run as SECURITY INVOKER and adjust grants

-- quest_statistics: admin-only via service_role
CREATE OR REPLACE VIEW public.quest_statistics
WITH (security_invoker = true) AS
SELECT
  q.id as quest_id,
  q.title as quest_title,
  COUNT(DISTINCT uqp.user_id) as total_users,
  COUNT(DISTINCT CASE WHEN uqp.is_completed THEN uqp.user_id END) as completed_users,
  COUNT(DISTINCT utc.id) as total_submissions,
  COUNT(DISTINCT CASE WHEN utc.submission_status = 'pending' THEN utc.id END) as pending_submissions,
  COUNT(DISTINCT CASE WHEN utc.submission_status = 'completed' THEN utc.id END) as completed_submissions,
  COUNT(DISTINCT CASE WHEN utc.submission_status = 'failed' THEN utc.id END) as failed_submissions,
  CASE
    WHEN COUNT(DISTINCT uqp.user_id) > 0
    THEN ROUND((COUNT(DISTINCT CASE WHEN uqp.is_completed THEN uqp.user_id END)::NUMERIC / COUNT(DISTINCT uqp.user_id)) * 100, 2)
    ELSE 0
  END as completion_rate
FROM public.quests q
LEFT JOIN public.user_quest_progress uqp ON q.id = uqp.quest_id
LEFT JOIN public.user_task_completions utc ON q.id = utc.quest_id
GROUP BY q.id, q.title;

REVOKE ALL ON public.quest_statistics FROM authenticated;
REVOKE ALL ON public.quest_statistics FROM anon;
GRANT SELECT ON public.quest_statistics TO service_role;

COMMENT ON VIEW public.quest_statistics IS
'Admin-only view; SECURITY INVOKER; service_role only.';

-- user_applications_view: keep authenticated access but invoker security
CREATE OR REPLACE VIEW public.user_applications_view
WITH (security_invoker = true) AS
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

REVOKE ALL ON public.user_applications_view FROM anon;
GRANT SELECT ON public.user_applications_view TO authenticated, service_role;

COMMENT ON VIEW public.user_applications_view IS
'SECURITY INVOKER view; respects RLS for authenticated users.';

-- user_enrollments_view: keep authenticated access but invoker security
CREATE OR REPLACE VIEW public.user_enrollments_view
WITH (security_invoker = true) AS
SELECT
  be.id,
  be.user_profile_id,
  be.cohort_id,
  be.enrollment_status,
  be.progress,
  be.completion_date,
  c.name as cohort_name,
  c.bootcamp_program_id,
  c.start_date,
  c.end_date
FROM public.bootcamp_enrollments be
JOIN public.cohorts c ON be.cohort_id = c.id;

REVOKE ALL ON public.user_enrollments_view FROM anon;
GRANT SELECT ON public.user_enrollments_view TO authenticated, service_role;

COMMENT ON VIEW public.user_enrollments_view IS
'SECURITY INVOKER view; respects RLS for authenticated users.';
