-- Fix for orphaned applications that exist without corresponding user_application_status records
-- This addresses the issue where applications are created but not visible in any interface

-- 1. Create a new view that shows ALL applications, even those without user_application_status
CREATE OR REPLACE VIEW public.all_applications_view AS
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
-- 2. Update the existing user_applications_view to be more resilient
DROP VIEW IF EXISTS public.user_applications_view CASCADE;
CREATE OR REPLACE VIEW public.user_applications_view AS
SELECT 
  COALESCE(uas.id, gen_random_uuid()) as id, -- Generate ID if missing
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
-- Ensure we have a user profile

-- 3. Create a function to fix orphaned applications
CREATE OR REPLACE FUNCTION fix_orphaned_applications()
RETURNS TABLE (
  application_id UUID,
  user_email TEXT,
  action_taken TEXT
) AS $$
DECLARE
  app RECORD;
  user_profile_id UUID;
  action TEXT;
BEGIN
  -- Find all applications without user_application_status records
  FOR app IN 
    SELECT a.id, a.user_email, a.user_profile_id, a.payment_status, a.cohort_id
    FROM applications a
    LEFT JOIN user_application_status uas ON uas.application_id = a.id
    WHERE uas.id IS NULL
  LOOP
    action := '';
    
    -- Get or set user_profile_id
    IF app.user_profile_id IS NULL THEN
      -- Try to find user profile by email
      SELECT id INTO user_profile_id 
      FROM user_profiles 
      WHERE email = app.user_email 
      LIMIT 1;
      
      IF user_profile_id IS NOT NULL THEN
        -- Update application with user_profile_id
        UPDATE applications 
        SET user_profile_id = user_profile_id 
        WHERE id = app.id;
        
        action := action || 'Updated user_profile_id. ';
      END IF;
    ELSE
      user_profile_id := app.user_profile_id;
    END IF;
    
    -- Create missing user_application_status if we have a user_profile_id
    IF user_profile_id IS NOT NULL THEN
      INSERT INTO user_application_status (
        user_profile_id,
        application_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        user_profile_id,
        app.id,
        CASE 
          WHEN app.payment_status = 'completed' THEN 'completed'
          WHEN app.payment_status = 'failed' THEN 'failed'
          ELSE 'pending'
        END,
        NOW(),
        NOW()
      );
      
      action := action || 'Created user_application_status. ';
    ELSE
      action := 'No user profile found for email: ' || app.user_email;
    END IF;
    
    RETURN QUERY SELECT app.id, app.user_email, action;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
-- 4. Grant necessary permissions
GRANT SELECT ON public.all_applications_view TO authenticated;
GRANT SELECT ON public.all_applications_view TO service_role;
GRANT SELECT ON public.user_applications_view TO authenticated;
GRANT SELECT ON public.user_applications_view TO service_role;
GRANT EXECUTE ON FUNCTION fix_orphaned_applications() TO service_role;
-- 5. Run the fix function to repair existing orphaned applications
SELECT * FROM fix_orphaned_applications();
-- 6. Add a trigger to prevent future orphaned applications
CREATE OR REPLACE FUNCTION ensure_user_application_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if we have a user_profile_id
  IF NEW.user_profile_id IS NOT NULL THEN
    -- Check if user_application_status exists
    IF NOT EXISTS (
      SELECT 1 FROM user_application_status 
      WHERE application_id = NEW.id 
      AND user_profile_id = NEW.user_profile_id
    ) THEN
      -- Create it
      INSERT INTO user_application_status (
        user_profile_id,
        application_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_profile_id,
        NEW.id,
        CASE 
          WHEN NEW.payment_status = 'completed' THEN 'completed'
          WHEN NEW.payment_status = 'failed' THEN 'failed'
          ELSE 'pending'
        END,
        NOW(),
        NOW()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Create the trigger
DROP TRIGGER IF EXISTS ensure_user_application_status_trigger ON applications;
CREATE TRIGGER ensure_user_application_status_trigger
  AFTER INSERT OR UPDATE OF user_profile_id ON applications
  FOR EACH ROW
  WHEN (NEW.user_profile_id IS NOT NULL)
  EXECUTE FUNCTION ensure_user_application_status();
-- 7. Add comments for documentation
COMMENT ON VIEW public.all_applications_view IS 'Shows ALL applications including orphaned ones without user_application_status records';
COMMENT ON VIEW public.user_applications_view IS 'Enhanced view that gracefully handles missing user_application_status records';
COMMENT ON FUNCTION fix_orphaned_applications() IS 'Repairs applications that exist without corresponding user_application_status records';
