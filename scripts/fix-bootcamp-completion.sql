-- Script to fix bootcamp completion status for enrollments
-- where all milestones are completed but enrollment_status wasn't updated

-- Option 1: Check current status first
SELECT
  be.id as enrollment_id,
  c.name as cohort_name,
  be.enrollment_status,
  (SELECT COUNT(*) FROM cohort_milestones WHERE cohort_id = be.cohort_id) as total_milestones,
  (SELECT COUNT(*) FROM user_milestone_progress ump
   WHERE ump.user_profile_id = be.user_profile_id
   AND ump.milestone_id IN (SELECT id FROM cohort_milestones WHERE cohort_id = be.cohort_id)
   AND ump.status = 'completed') as completed_milestones
FROM bootcamp_enrollments be
JOIN cohorts c ON be.cohort_id = c.id
WHERE be.enrollment_status != 'completed'
ORDER BY be.created_at DESC;

-- Option 2: Automatically fix all eligible enrollments
DO $$
DECLARE
  enrollment_record RECORD;
  result JSONB;
BEGIN
  FOR enrollment_record IN
    SELECT be.id, c.name as cohort_name
    FROM bootcamp_enrollments be
    JOIN cohorts c ON be.cohort_id = c.id
    WHERE be.enrollment_status != 'completed'
  LOOP
    SELECT public.fix_completion_status(enrollment_record.id) INTO result;
    RAISE NOTICE 'Enrollment % (%) -> %',
      enrollment_record.id,
      enrollment_record.cohort_name,
      result->>'message';
  END LOOP;
END $$;
