-- Fix SQL ambiguity error in fix_orphaned_applications function
-- Issue: Column reference "user_profile_id" is ambiguous at line 118
-- Solution: Qualify the column reference with the table name

CREATE OR REPLACE FUNCTION fix_orphaned_applications()
RETURNS TABLE (
  application_id UUID,
  user_email TEXT,
  action_taken TEXT
)
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  app RECORD;
  v_user_profile_id UUID;  -- Renamed variable to avoid ambiguity
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
      SELECT id INTO v_user_profile_id
      FROM user_profiles
      WHERE email = app.user_email
      LIMIT 1;

      IF v_user_profile_id IS NOT NULL THEN
        -- Update application with user_profile_id (qualified with table name)
        UPDATE applications
        SET user_profile_id = v_user_profile_id
        WHERE id = app.id;

        action := action || 'Updated user_profile_id. ';
      END IF;
    ELSE
      v_user_profile_id := app.user_profile_id;
    END IF;

    -- Create missing user_application_status if we have a user_profile_id
    IF v_user_profile_id IS NOT NULL THEN
      INSERT INTO user_application_status (
        user_profile_id,
        application_id,
        status,
        created_at,
        updated_at
      ) VALUES (
        v_user_profile_id,
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION fix_orphaned_applications() TO service_role;

COMMENT ON FUNCTION fix_orphaned_applications() IS 'Repairs applications that exist without corresponding user_application_status records. Fixed SQL ambiguity issue with variable naming.';
