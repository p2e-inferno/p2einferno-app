

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_lock_address_uniqueness"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Skip checks if using service_role (admin operations)
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;
    
    IF NEW.lock_address IS NOT NULL AND NEW.lock_address != '' THEN
        -- Check if lock_address already exists in registry for a different entity
        IF EXISTS (
            SELECT 1 FROM public.lock_registry 
            WHERE lock_address = NEW.lock_address 
            AND NOT (entity_type = TG_ARGV[0] AND entity_id = NEW.id)
        ) THEN
            RAISE EXCEPTION 'Lock address % is already in use by another entity', NEW.lock_address;
        END IF;
        
        -- Register or update the lock address
        INSERT INTO public.lock_registry (lock_address, entity_type, entity_id, purpose, network)
        VALUES (NEW.lock_address, TG_ARGV[0], NEW.id, TG_ARGV[1], 'polygon')
        ON CONFLICT (entity_type, entity_id) 
        DO UPDATE SET 
            lock_address = NEW.lock_address,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_lock_address_uniqueness"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_single_submission_per_user_task"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- For INSERT operations, check if user already has any submission for this task
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (
      SELECT 1 FROM task_submissions
      WHERE task_id = NEW.task_id 
      AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'User already has a submission for this task. Use UPDATE instead of INSERT.';
    END IF;
  END IF;
  
  -- For UPDATE operations, ensure we're not changing task_id or user_id to create duplicates
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.task_id != NEW.task_id OR OLD.user_id != NEW.user_id) THEN
      IF EXISTS (
        SELECT 1 FROM task_submissions
        WHERE task_id = NEW.task_id 
        AND user_id = NEW.user_id
        AND id != NEW.id
      ) THEN
        RAISE EXCEPTION 'Cannot change task_id or user_id: would create duplicate submission';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_single_submission_per_user_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_profile_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.notifications (user_profile_id, type, title, body, metadata)
  VALUES (p_user_profile_id, p_type, p_title, p_body, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_profile_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exec_sql"("sql_query" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;


ALTER FUNCTION "public"."exec_sql"("sql_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_successful_payment"("p_application_id" "uuid", "p_payment_reference" "text", "p_payment_method" "text", "p_transaction_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("success" boolean, "message" "text", "enrollment_id" "uuid", "returned_application_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_user_profile_id UUID;
    v_cohort_id TEXT;
    v_new_enrollment_id UUID;
    v_total_amount NUMERIC;
    v_currency TEXT;
    v_mapped_payment_method TEXT;
    v_xp_points INTEGER := 500; -- XP points to award for payment completion
BEGIN
    -- 1. Find the user and cohort associated with the application using direct relationship
    SELECT a.user_profile_id, a.cohort_id, a.total_amount, a.currency
    INTO v_user_profile_id, v_cohort_id, v_total_amount, v_currency
    FROM public.applications a
    WHERE a.id = p_application_id
    LIMIT 1;

    -- Fallback to email lookup if user_profile_id is not set (for old applications)
    IF v_user_profile_id IS NULL THEN
        SELECT up.id
        INTO v_user_profile_id
        FROM public.applications a
        JOIN public.user_profiles up ON a.user_email = up.email
        WHERE a.id = p_application_id
        LIMIT 1;
    END IF;

    IF v_user_profile_id IS NULL THEN
        RAISE EXCEPTION 'User profile not found for application_id %', p_application_id;
    END IF;

    -- Map payment method to valid constraint values
    v_mapped_payment_method := CASE 
        WHEN p_payment_method = 'paystack' THEN 'fiat'
        WHEN p_payment_method = 'blockchain' THEN 'crypto'
        ELSE p_payment_method
    END;

    -- 2. Update the payment_transactions record with all available structured data
    UPDATE public.payment_transactions pt
    SET 
        status = 'success',
        paystack_status = p_transaction_details->>'status',
        paystack_gateway_response = p_transaction_details->>'gateway_response',
        authorization_code = p_transaction_details->'authorization'->>'authorization_code',
        customer_code = p_transaction_details->'customer'->>'customer_code',
        channel = p_transaction_details->>'channel',
        card_type = p_transaction_details->'authorization'->>'card_type',
        bank = p_transaction_details->'authorization'->>'bank',
        fees = (p_transaction_details->>'fees')::numeric / 100,
        paid_at = (p_transaction_details->>'paid_at')::timestamptz,
        transaction_hash = p_transaction_details->>'transaction_hash',
        key_token_id = p_transaction_details->>'key_token_id',
        network_chain_id = (p_transaction_details->>'network_chain_id')::bigint,
        updated_at = NOW(),
        metadata = pt.metadata || p_transaction_details
    WHERE pt.payment_reference = p_payment_reference;

    IF NOT FOUND THEN
        RAISE WARNING 'Payment transaction not found for reference %, but proceeding with enrollment.', p_payment_reference;
    END IF;

    -- 3. Update the application status to 'approved' and payment to 'completed'
    UPDATE public.applications a
    SET 
        payment_status = 'completed',
        application_status = 'approved',
        payment_method = v_mapped_payment_method,
        updated_at = NOW()
    WHERE a.id = p_application_id;

    -- 4. Create or update the enrollment record in bootcamp_enrollments
    INSERT INTO public.bootcamp_enrollments (user_profile_id, cohort_id, enrollment_status)
    VALUES (v_user_profile_id, v_cohort_id, 'active')
    ON CONFLICT (user_profile_id, cohort_id) DO UPDATE
    SET enrollment_status = 'active', updated_at = NOW()
    RETURNING id INTO v_new_enrollment_id;

    -- 5. Create or update the user_application_status to 'enrolled'
    BEGIN
        INSERT INTO public.user_application_status (
            user_profile_id, 
            application_id, 
            status, 
            payment_method, 
            amount_paid, 
            currency, 
            completed_at,
            created_at,
            updated_at
        )
        VALUES (
            v_user_profile_id, 
            p_application_id, 
            'enrolled', 
            v_mapped_payment_method,
            v_total_amount,
            v_currency,
            NOW(),
            NOW(),
            NOW()
        );
    EXCEPTION
        WHEN unique_violation THEN
            UPDATE public.user_application_status uas
            SET 
                status = 'enrolled',
                payment_method = v_mapped_payment_method,
                amount_paid = v_total_amount,
                currency = v_currency,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE uas.user_profile_id = v_user_profile_id 
                AND uas.application_id = p_application_id;
    END;

    -- 6. Log the payment activity in user_activities
    INSERT INTO public.user_activities (user_profile_id, activity_type, activity_data, points_earned)
    VALUES (
        v_user_profile_id,
        'payment_completed',
        jsonb_build_object(
            'applicationId', p_application_id,
            'cohortId', v_cohort_id,
            'paymentMethod', p_payment_method,
            'reference', p_payment_reference
        ),
        v_xp_points
    );

    -- 7. UPDATE USER PROFILE XP POINTS (THIS WAS MISSING!)
    UPDATE public.user_profiles
    SET 
        experience_points = COALESCE(experience_points, 0) + v_xp_points,
        updated_at = NOW()
    WHERE id = v_user_profile_id;

    RETURN QUERY SELECT true, 'Payment processed and user enrolled successfully.', v_new_enrollment_id, p_application_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_successful_payment for application %: %', p_application_id, SQLERRM;
        RETURN QUERY SELECT false, SQLERRM, null::uuid, p_application_id;
END;
$$;


ALTER FUNCTION "public"."handle_successful_payment"("p_application_id" "uuid", "p_payment_reference" "text", "p_payment_method" "text", "p_transaction_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  admin_role BOOLEAN;
BEGIN
  -- Check if the user has the admin role
  SELECT EXISTS (
    SELECT 1 
    FROM user_profiles 
    WHERE id = user_id 
    AND metadata->>'role' = 'admin'
  ) INTO admin_role;
  
  RETURN admin_role;
END;
$$;


ALTER FUNCTION "public"."is_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_application_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    v_title := 'Application status updated';
    v_body := 'Your application status is now ' || NEW.status;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'application_status',
      v_title,
      v_body,
      jsonb_build_object('application_id', NEW.application_id, 'status', NEW.status)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."notify_on_application_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_enrollment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_cohort_name TEXT;
  v_event TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  SELECT name INTO v_cohort_name FROM public.cohorts WHERE id = COALESCE(NEW.cohort_id, OLD.cohort_id);

  IF TG_OP = 'INSERT' THEN
    v_event := 'enrollment_created';
    v_title := 'Enrolled in bootcamp';
    v_body := 'You have been enrolled in cohort ' || COALESCE(v_cohort_name, '');
  ELSIF TG_OP = 'UPDATE' AND (OLD.enrollment_status IS DISTINCT FROM NEW.enrollment_status) THEN
    v_event := 'enrollment_status';
    v_title := 'Enrollment status updated';
    v_body := 'Your enrollment status is now ' || NEW.enrollment_status || ' for cohort ' || COALESCE(v_cohort_name, '');
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.create_notification(
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    v_event,
    v_title,
    v_body,
    jsonb_build_object('cohort_id', COALESCE(NEW.cohort_id, OLD.cohort_id), 'status', COALESCE(NEW.enrollment_status, OLD.enrollment_status))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."notify_on_enrollment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_milestone_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_milestone_name TEXT;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT name INTO v_milestone_name FROM public.cohort_milestones WHERE id = NEW.milestone_id;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'milestone_completed',
      'Milestone completed',
      'You have completed milestone ' || COALESCE(v_milestone_name, ''),
      jsonb_build_object('milestone_id', NEW.milestone_id, 'progress', NEW.progress_percentage, 'completed_at', NEW.completed_at)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."notify_on_milestone_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_task_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task_title TEXT;
BEGIN
  -- Only notify when a task is marked completed (insert or update)
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'completed' THEN
    SELECT title INTO v_task_title FROM public.milestone_tasks WHERE id = NEW.task_id;

    PERFORM public.create_notification(
      NEW.user_profile_id,
      'task_completed',
      'Task completed',
      COALESCE(v_task_title, 'A task') || ' has been completed.',
      jsonb_build_object('task_id', NEW.task_id, 'milestone_id', NEW.milestone_id, 'completed_at', NEW.completed_at)
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."notify_on_task_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_on_task_submission_review"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_task_title TEXT;
  v_user_profile_id UUID;
  v_milestone_id UUID;
BEGIN
  -- Only on status change
  IF TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    -- Map privy user id to user_profile_id
    SELECT id INTO v_user_profile_id FROM public.user_profiles WHERE privy_user_id = NEW.user_id;
    IF v_user_profile_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get task title and milestone id
    SELECT title, milestone_id INTO v_task_title, v_milestone_id FROM public.milestone_tasks WHERE id = NEW.task_id;

    IF NEW.status = 'completed' THEN
      PERFORM public.create_notification(
        v_user_profile_id,
        'task_reviewed',
        'Task approved',
        'Your submission for ' || COALESCE(v_task_title,'the task') || ' has been approved. You can now claim your reward.',
        jsonb_build_object('task_id', NEW.task_id, 'submission_id', NEW.id, 'status', NEW.status, 'milestone_id', v_milestone_id)
      );
    ELSIF NEW.status = 'failed' OR NEW.status = 'retry' THEN
      PERFORM public.create_notification(
        v_user_profile_id,
        'task_reviewed',
        CASE WHEN NEW.status = 'failed' THEN 'Task failed' ELSE 'Task needs retry' END,
        'Your submission for ' || COALESCE(v_task_title,'the task') || ' was reviewed. Please check feedback and resubmit.',
        jsonb_build_object('task_id', NEW.task_id, 'submission_id', NEW.id, 'status', NEW.status, 'milestone_id', v_milestone_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_on_task_submission_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_quest_progress"("p_user_id" "text", "p_quest_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_total_tasks INTEGER;
    v_completed_tasks INTEGER;
BEGIN
    -- Get total number of tasks for the quest
    SELECT COUNT(*) INTO v_total_tasks
    FROM public.quest_tasks
    WHERE quest_id = p_quest_id;
    
    -- Get number of completed tasks (only count 'completed' status)
    SELECT COUNT(*) INTO v_completed_tasks
    FROM public.user_task_completions
    WHERE user_id = p_user_id 
    AND quest_id = p_quest_id
    AND submission_status = 'completed';
    
    -- Update the progress
    UPDATE public.user_quest_progress
    SET 
        tasks_completed = v_completed_tasks,
        is_completed = (v_completed_tasks >= v_total_tasks AND v_total_tasks > 0),
        updated_at = NOW()
    WHERE user_id = p_user_id AND quest_id = p_quest_id;
    
    -- If no progress record exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.user_quest_progress (user_id, quest_id, tasks_completed, is_completed)
        VALUES (p_user_id, p_quest_id, v_completed_tasks, (v_completed_tasks >= v_total_tasks AND v_total_tasks > 0));
    END IF;
END;
$$;


ALTER FUNCTION "public"."recalculate_quest_progress"("p_user_id" "text", "p_quest_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_milestone_total_reward"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE cohort_milestones
  SET total_reward = (
    SELECT COALESCE(SUM(reward_amount), 0)
    FROM milestone_tasks
    WHERE milestone_id = COALESCE(NEW.milestone_id, OLD.milestone_id)
  )
  WHERE id = COALESCE(NEW.milestone_id, OLD.milestone_id);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_milestone_total_reward"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quest_progress_on_task_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Recalculate progress for the affected user and quest
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM recalculate_quest_progress(NEW.user_id, NEW.quest_id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM recalculate_quest_progress(OLD.user_id, OLD.quest_id);
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_quest_progress_on_task_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_progress_on_submission"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  task_record RECORD;
  user_profile_record RECORD;
BEGIN
  -- Get task info
  SELECT * INTO task_record 
  FROM public.milestone_tasks 
  WHERE id = NEW.task_id;
  
  -- Get user profile ID from privy user_id
  SELECT * INTO user_profile_record
  FROM public.user_profiles
  WHERE privy_user_id = NEW.user_id;
  
  IF user_profile_record.id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Update or create task progress
  INSERT INTO public.user_task_progress (
    user_profile_id,
    milestone_id,
    task_id,
    status,
    submission_id,
    completed_at
  ) VALUES (
    user_profile_record.id,
    task_record.milestone_id,
    task_record.id,
    CASE 
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'pending' THEN 'in_progress'
      WHEN NEW.status = 'failed' THEN 'failed'
      ELSE 'in_progress'
    END,
    NEW.id,
    CASE WHEN NEW.status = 'completed' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (user_profile_id, task_id)
  DO UPDATE SET
    status = CASE 
      WHEN NEW.status = 'completed' THEN 'completed'
      WHEN NEW.status = 'pending' THEN 'in_progress' 
      WHEN NEW.status = 'failed' THEN 'failed'
      ELSE 'in_progress'
    END,
    submission_id = NEW.id,
    completed_at = CASE WHEN NEW.status = 'completed' THEN NOW() ELSE user_task_progress.completed_at END,
    updated_at = NOW();
    
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_task_progress_on_submission"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_journey_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_journey_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_milestone_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  milestone_record RECORD;
  total_tasks_count INTEGER;
  completed_tasks_count INTEGER;
  new_progress_percentage DECIMAL(5,2);
  total_reward INTEGER;
BEGIN
  -- Get milestone info
  SELECT * INTO milestone_record 
  FROM public.cohort_milestones 
  WHERE id = COALESCE(NEW.milestone_id, OLD.milestone_id);
  
  -- Count total tasks for this milestone
  SELECT COUNT(*) INTO total_tasks_count
  FROM public.milestone_tasks
  WHERE milestone_id = milestone_record.id;
  
  -- Count completed tasks for this user and milestone
  SELECT COUNT(*) INTO completed_tasks_count
  FROM public.user_task_progress
  WHERE user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND milestone_id = milestone_record.id
  AND status = 'completed';
  
  -- Calculate progress percentage
  new_progress_percentage := CASE 
    WHEN total_tasks_count > 0 THEN (completed_tasks_count * 100.0 / total_tasks_count)
    ELSE 0
  END;
  
  -- Calculate total reward earned
  SELECT COALESCE(SUM(mt.reward_amount), 0) INTO total_reward
  FROM public.user_task_progress utp
  JOIN public.milestone_tasks mt ON utp.task_id = mt.id
  WHERE utp.user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND utp.milestone_id = milestone_record.id
  AND utp.status = 'completed';
  
  -- Upsert milestone progress
  INSERT INTO public.user_milestone_progress (
    user_profile_id,
    milestone_id,
    status,
    tasks_completed,
    total_tasks,
    progress_percentage,
    started_at,
    completed_at,
    reward_amount
  ) VALUES (
    COALESCE(NEW.user_profile_id, OLD.user_profile_id),
    milestone_record.id,
    CASE 
      WHEN completed_tasks_count = total_tasks_count AND total_tasks_count > 0 THEN 'completed'
      WHEN completed_tasks_count > 0 THEN 'in_progress'
      ELSE 'not_started'
    END,
    completed_tasks_count,
    total_tasks_count,
    new_progress_percentage,
    CASE WHEN completed_tasks_count > 0 THEN NOW() ELSE NULL END,
    CASE WHEN completed_tasks_count = total_tasks_count AND total_tasks_count > 0 THEN NOW() ELSE NULL END,
    total_reward
  )
  ON CONFLICT (user_profile_id, milestone_id) 
  DO UPDATE SET
    status = CASE 
      WHEN EXCLUDED.tasks_completed = EXCLUDED.total_tasks AND EXCLUDED.total_tasks > 0 THEN 'completed'
      WHEN EXCLUDED.tasks_completed > 0 THEN 'in_progress'
      ELSE 'not_started'
    END,
    tasks_completed = EXCLUDED.tasks_completed,
    total_tasks = EXCLUDED.total_tasks,
    progress_percentage = EXCLUDED.progress_percentage,
    started_at = COALESCE(user_milestone_progress.started_at, EXCLUDED.started_at),
    completed_at = EXCLUDED.completed_at,
    reward_amount = EXCLUDED.reward_amount,
    updated_at = NOW();
    
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_user_milestone_progress"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cohort_id" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_name" "text" NOT NULL,
    "phone_number" "text" NOT NULL,
    "experience_level" "text" NOT NULL,
    "motivation" "text" NOT NULL,
    "goals" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "application_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "discount_code" "text",
    "total_amount" integer,
    "currency" "text",
    "payment_method" "text" DEFAULT 'fiat'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_payment_transaction_id" "uuid",
    "user_profile_id" "uuid",
    CONSTRAINT "applications_application_status_check" CHECK (("application_status" = ANY (ARRAY['draft'::"text", 'submitted'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "applications_currency_check" CHECK (("currency" = ANY (ARRAY['NGN'::"text", 'USD'::"text"]))),
    CONSTRAINT "applications_experience_level_check" CHECK (("experience_level" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "applications_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['crypto'::"text", 'fiat'::"text"]))),
    CONSTRAINT "applications_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bootcamp_enrollments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_profile_id" "uuid",
    "cohort_id" "text",
    "enrollment_status" character varying(20) DEFAULT 'enrolled'::character varying,
    "progress" "jsonb" DEFAULT '{"total_modules": 8, "modules_completed": 0}'::"jsonb",
    "completion_date" timestamp with time zone,
    "certificate_issued" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bootcamp_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bootcamp_programs" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "duration_weeks" integer NOT NULL,
    "max_reward_dgt" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lock_address" "text",
    "image_url" "text"
);


ALTER TABLE "public"."bootcamp_programs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_managers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_profile_id" "uuid",
    "cohort_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cohort_managers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohort_milestones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cohort_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "lock_address" "text" NOT NULL,
    "prerequisite_milestone_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "duration_hours" integer DEFAULT 0,
    "total_reward" integer DEFAULT 0
);


ALTER TABLE "public"."cohort_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cohorts" (
    "id" "text" NOT NULL,
    "bootcamp_program_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "max_participants" integer DEFAULT 100 NOT NULL,
    "current_participants" integer DEFAULT 0 NOT NULL,
    "registration_deadline" "date" NOT NULL,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lock_address" "text",
    "key_managers" "text"[],
    "usdt_amount" numeric(10,2),
    "naira_amount" numeric(12,2),
    CONSTRAINT "cohorts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text", 'upcoming'::"text"])))
);


ALTER TABLE "public"."cohorts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."cohorts"."key_managers" IS 'Array of wallet addresses for key managers';



COMMENT ON COLUMN "public"."cohorts"."usdt_amount" IS 'Cohort price in USDT';



COMMENT ON COLUMN "public"."cohorts"."naira_amount" IS 'Cohort price in Nigerian Naira';



CREATE TABLE IF NOT EXISTS "public"."lock_registry" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lock_address" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "network" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lock_registry" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."milestone_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "milestone_id" "uuid" NOT NULL,
    "title" character varying(255) NOT NULL,
    "description" "text",
    "reward_amount" integer DEFAULT 0 NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "task_type" character varying(50) DEFAULT 'url_submission'::character varying NOT NULL,
    "submission_requirements" "jsonb" DEFAULT '{}'::"jsonb",
    "validation_criteria" "jsonb" DEFAULT '{}'::"jsonb",
    "requires_admin_review" boolean DEFAULT true,
    "contract_network" character varying(50),
    "contract_address" "text",
    "contract_method" character varying(100),
    CONSTRAINT "milestone_tasks_contract_address_check" CHECK ((("contract_address" IS NULL) OR ("contract_address" ~ '^0x[a-fA-F0-9]{40}$'::"text"))),
    CONSTRAINT "milestone_tasks_contract_interaction_validation" CHECK (((("task_type")::"text" <> 'contract_interaction'::"text") OR ((("task_type")::"text" = 'contract_interaction'::"text") AND ("contract_network" IS NOT NULL) AND ("contract_address" IS NOT NULL) AND ("contract_method" IS NOT NULL)))),
    CONSTRAINT "milestone_tasks_contract_network_check" CHECK ((("contract_network" IS NULL) OR (("contract_network")::"text" = ANY ((ARRAY['base'::character varying, 'base-sepolia'::character varying])::"text"[])))),
    CONSTRAINT "milestone_tasks_task_type_check" CHECK ((("task_type")::"text" = ANY ((ARRAY['file_upload'::character varying, 'url_submission'::character varying, 'contract_interaction'::character varying, 'text_submission'::character varying, 'external_verification'::character varying])::"text"[])))
);


ALTER TABLE "public"."milestone_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."milestone_tasks"."contract_network" IS 'Blockchain network for contract interaction tasks (base, base-sepolia)';



COMMENT ON COLUMN "public"."milestone_tasks"."contract_address" IS 'Smart contract address for contract interaction tasks (Ethereum address format)';



COMMENT ON COLUMN "public"."milestone_tasks"."contract_method" IS 'Contract method/function name that users should interact with';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_profile_id" "uuid" NOT NULL,
    "title" "text",
    "body" "text",
    "type" character varying(50),
    "read" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "payment_reference" character varying(255) NOT NULL,
    "paystack_access_code" character varying(255),
    "amount" numeric(10,2) NOT NULL,
    "currency" character varying(3) NOT NULL,
    "amount_in_kobo" bigint NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "paystack_status" character varying(50),
    "paystack_gateway_response" "text",
    "authorization_code" character varying(255),
    "customer_code" character varying(255),
    "payment_method" character varying(50),
    "channel" character varying(50),
    "card_type" character varying(50),
    "bank" character varying(255),
    "fees" numeric(10,2),
    "metadata" "jsonb",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "paystack_reference" "text",
    "transaction_hash" "text",
    "key_token_id" "text",
    "network_chain_id" bigint,
    CONSTRAINT "payment_transactions_currency_check" CHECK ((("currency")::"text" = ANY ((ARRAY['NGN'::character varying, 'USD'::character varying])::"text"[]))),
    CONSTRAINT "payment_transactions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'success'::character varying, 'failed'::character varying, 'abandoned'::character varying])::"text"[]))),
    CONSTRAINT "payment_transactions_transaction_hash_format" CHECK ((("transaction_hash" IS NULL) OR ("transaction_hash" ~ '^0x[a-fA-F0-9]{64}$'::"text"))),
    CONSTRAINT "payment_transactions_valid_chain_id" CHECK ((("network_chain_id" IS NULL) OR ("network_chain_id" = ANY (ARRAY[(1)::bigint, (137)::bigint, (8453)::bigint, (84532)::bigint, (42161)::bigint, (10)::bigint, (100)::bigint, (56)::bigint, (97)::bigint, (43114)::bigint, (80001)::bigint]))))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payment_transactions"."paystack_reference" IS 'Paystack-generated reference (e.g., T990787264713537) for auditing and dispute resolution. Generated during payment processing, not initialization.';



COMMENT ON COLUMN "public"."payment_transactions"."transaction_hash" IS 'Blockchain transaction hash for crypto payments';



COMMENT ON COLUMN "public"."payment_transactions"."key_token_id" IS 'NFT key token ID from Unlock Protocol';



COMMENT ON COLUMN "public"."payment_transactions"."network_chain_id" IS 'Blockchain network chain ID (e.g., 8453 for Base, 84532 for Base Sepolia)';



CREATE TABLE IF NOT EXISTS "public"."program_highlights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."program_highlights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."program_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cohort_id" "text" NOT NULL,
    "content" "text" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."program_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "total_reward" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "lock_address" "text",
    "image_url" "text"
);


ALTER TABLE "public"."quests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_quest_progress" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "text" NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "tasks_completed" integer DEFAULT 0 NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "reward_claimed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_quest_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_task_completions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "text" NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "verification_data" "jsonb",
    "reward_claimed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "submission_status" "text" DEFAULT 'pending'::"text",
    "submission_data" "jsonb",
    "admin_feedback" "text",
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "user_task_completions_submission_status_check" CHECK (("submission_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'retry'::"text"])))
);


ALTER TABLE "public"."user_task_completions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."quest_statistics" AS
 SELECT "q"."id" AS "quest_id",
    "q"."title" AS "quest_title",
    "count"(DISTINCT "uqp"."user_id") AS "total_users",
    "count"(DISTINCT
        CASE
            WHEN "uqp"."is_completed" THEN "uqp"."user_id"
            ELSE NULL::"text"
        END) AS "completed_users",
    "count"(DISTINCT "utc"."id") AS "total_submissions",
    "count"(DISTINCT
        CASE
            WHEN ("utc"."submission_status" = 'pending'::"text") THEN "utc"."id"
            ELSE NULL::"uuid"
        END) AS "pending_submissions",
    "count"(DISTINCT
        CASE
            WHEN ("utc"."submission_status" = 'completed'::"text") THEN "utc"."id"
            ELSE NULL::"uuid"
        END) AS "completed_submissions",
    "count"(DISTINCT
        CASE
            WHEN ("utc"."submission_status" = 'failed'::"text") THEN "utc"."id"
            ELSE NULL::"uuid"
        END) AS "failed_submissions",
        CASE
            WHEN ("count"(DISTINCT "uqp"."user_id") > 0) THEN "round"(((("count"(DISTINCT
            CASE
                WHEN "uqp"."is_completed" THEN "uqp"."user_id"
                ELSE NULL::"text"
            END))::numeric / ("count"(DISTINCT "uqp"."user_id"))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS "completion_rate"
   FROM (("public"."quests" "q"
     LEFT JOIN "public"."user_quest_progress" "uqp" ON (("q"."id" = "uqp"."quest_id")))
     LEFT JOIN "public"."user_task_completions" "utc" ON (("q"."id" = "utc"."quest_id")))
  GROUP BY "q"."id", "q"."title";


ALTER VIEW "public"."quest_statistics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quest_tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "task_type" "text" NOT NULL,
    "verification_method" "text" NOT NULL,
    "reward_amount" integer DEFAULT 0 NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "input_required" boolean DEFAULT false,
    "input_label" "text",
    "input_placeholder" "text",
    "input_validation" "text",
    "requires_admin_review" boolean DEFAULT false,
    CONSTRAINT "quest_tasks_input_validation_check" CHECK (("input_validation" = ANY (ARRAY['url'::"text", 'text'::"text", 'email'::"text", 'number'::"text", 'textarea'::"text"]))),
    CONSTRAINT "quest_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['link_email'::"text", 'link_wallet'::"text", 'link_farcaster'::"text", 'sign_tos'::"text", 'submit_url'::"text", 'submit_text'::"text", 'submit_proof'::"text", 'complete_external'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."quest_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "user_id" character varying(255) NOT NULL,
    "submission_url" "text",
    "status" character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "reviewed_at" timestamp with time zone,
    "reviewed_by" character varying(255),
    "feedback" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "submission_data" "jsonb" DEFAULT '{}'::"jsonb",
    "submission_type" character varying(50) DEFAULT 'url'::character varying,
    "file_urls" "text"[],
    "submission_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "task_submissions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying, 'retry'::character varying])::"text"[])))
);


ALTER TABLE "public"."task_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tos_signatures" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "text" NOT NULL,
    "wallet_address" "text" NOT NULL,
    "signature" "text" NOT NULL,
    "message" "text" NOT NULL,
    "tos_version" "text" DEFAULT '1.0.0'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tos_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_profile_id" "uuid",
    "activity_type" character varying(50) NOT NULL,
    "activity_data" "jsonb" DEFAULT '{}'::"jsonb",
    "points_earned" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_application_status" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_profile_id" "uuid",
    "application_id" "uuid",
    "status" character varying(20) DEFAULT 'pending'::character varying,
    "payment_intent_id" character varying(255),
    "payment_method" character varying(20),
    "amount_paid" numeric(10,2),
    "currency" character varying(10),
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_application_status" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_applications_view" AS
 SELECT "uas"."id",
    "uas"."user_profile_id",
    "uas"."application_id",
    "uas"."status",
    "uas"."created_at",
    "a"."cohort_id",
    "a"."user_name",
    "a"."user_email",
    "a"."experience_level",
    "a"."payment_status",
    "a"."application_status",
    "be"."id" AS "enrollment_id",
    "be"."enrollment_status",
    "be"."created_at" AS "enrollment_created_at",
    "c"."name" AS "cohort_name",
    "c"."start_date" AS "cohort_start_date",
    "c"."end_date" AS "cohort_end_date"
   FROM ((("public"."user_application_status" "uas"
     JOIN "public"."applications" "a" ON (("uas"."application_id" = "a"."id")))
     LEFT JOIN "public"."bootcamp_enrollments" "be" ON ((("be"."user_profile_id" = "uas"."user_profile_id") AND ("be"."cohort_id" = "a"."cohort_id"))))
     LEFT JOIN "public"."cohorts" "c" ON (("c"."id" = "a"."cohort_id")));


ALTER VIEW "public"."user_applications_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_enrollments_view" AS
 SELECT "be"."id",
    "be"."user_profile_id",
    "be"."cohort_id",
    "be"."enrollment_status",
    "be"."progress",
    "be"."completion_date",
    "c"."name" AS "cohort_name",
    "c"."bootcamp_program_id",
    "c"."start_date",
    "c"."end_date"
   FROM ("public"."bootcamp_enrollments" "be"
     JOIN "public"."cohorts" "c" ON (("be"."cohort_id" = "c"."id")));


ALTER VIEW "public"."user_enrollments_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_journey_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_profile_id" "uuid" NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_journey_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_milestone_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_profile_id" "uuid" NOT NULL,
    "milestone_id" "uuid" NOT NULL,
    "status" character varying(50) DEFAULT 'not_started'::character varying NOT NULL,
    "tasks_completed" integer DEFAULT 0,
    "total_tasks" integer DEFAULT 0,
    "progress_percentage" numeric(5,2) DEFAULT 0.00,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "reward_claimed" boolean DEFAULT false,
    "reward_amount" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_milestone_progress_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'expired'::character varying])::"text"[])))
);


ALTER TABLE "public"."user_milestone_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_milestones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "text" NOT NULL,
    "milestone_id" "uuid" NOT NULL,
    "key_id" "text",
    "completed_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "claimed_at" timestamp with time zone
);


ALTER TABLE "public"."user_milestones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "privy_user_id" character varying(255) NOT NULL,
    "username" character varying(50),
    "display_name" character varying(100),
    "email" character varying(255),
    "wallet_address" character varying(42),
    "linked_wallets" "jsonb" DEFAULT '[]'::"jsonb",
    "avatar_url" "text",
    "level" integer DEFAULT 1,
    "experience_points" integer DEFAULT 0,
    "status" character varying(20) DEFAULT 'active'::character varying,
    "onboarding_completed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_quest_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "text" NOT NULL,
    "quest_id" "uuid" NOT NULL,
    "key_id" "text" NOT NULL,
    "acquired_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_quest_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_task_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_profile_id" "uuid" NOT NULL,
    "milestone_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "status" character varying(50) DEFAULT 'not_started'::character varying NOT NULL,
    "submission_id" "uuid",
    "completed_at" timestamp with time zone,
    "reward_claimed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_task_progress_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['not_started'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'failed'::character varying, 'expired'::character varying])::"text"[])))
);


ALTER TABLE "public"."user_task_progress" OWNER TO "postgres";


ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bootcamp_enrollments"
    ADD CONSTRAINT "bootcamp_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bootcamp_enrollments"
    ADD CONSTRAINT "bootcamp_enrollments_user_profile_id_cohort_id_key" UNIQUE ("user_profile_id", "cohort_id");



ALTER TABLE ONLY "public"."bootcamp_programs"
    ADD CONSTRAINT "bootcamp_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_managers"
    ADD CONSTRAINT "cohort_managers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohort_managers"
    ADD CONSTRAINT "cohort_managers_user_profile_id_cohort_id_key" UNIQUE ("user_profile_id", "cohort_id");



ALTER TABLE ONLY "public"."cohort_milestones"
    ADD CONSTRAINT "cohort_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lock_registry"
    ADD CONSTRAINT "lock_registry_entity_type_entity_id_key" UNIQUE ("entity_type", "entity_id");



ALTER TABLE ONLY "public"."lock_registry"
    ADD CONSTRAINT "lock_registry_lock_address_key" UNIQUE ("lock_address");



ALTER TABLE ONLY "public"."lock_registry"
    ADD CONSTRAINT "lock_registry_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."milestone_tasks"
    ADD CONSTRAINT "milestone_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_payment_reference_key" UNIQUE ("payment_reference");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_highlights"
    ADD CONSTRAINT "program_highlights_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."program_requirements"
    ADD CONSTRAINT "program_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quest_tasks"
    ADD CONSTRAINT "quest_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quests"
    ADD CONSTRAINT "quests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tos_signatures"
    ADD CONSTRAINT "tos_signatures_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tos_signatures"
    ADD CONSTRAINT "tos_signatures_user_id_tos_version_key" UNIQUE ("user_id", "tos_version");



ALTER TABLE ONLY "public"."user_activities"
    ADD CONSTRAINT "user_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_application_status"
    ADD CONSTRAINT "user_application_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_application_status"
    ADD CONSTRAINT "user_application_status_user_profile_id_application_id_key" UNIQUE ("user_profile_id", "application_id");



ALTER TABLE ONLY "public"."user_journey_preferences"
    ADD CONSTRAINT "user_journey_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_journey_preferences"
    ADD CONSTRAINT "user_journey_preferences_user_profile_id_enrollment_id_key" UNIQUE ("user_profile_id", "enrollment_id");



ALTER TABLE ONLY "public"."user_milestone_progress"
    ADD CONSTRAINT "user_milestone_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_milestone_progress"
    ADD CONSTRAINT "user_milestone_progress_user_profile_id_milestone_id_key" UNIQUE ("user_profile_id", "milestone_id");



ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_user_id_milestone_id_key" UNIQUE ("user_id", "milestone_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_privy_user_id_key" UNIQUE ("privy_user_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."user_quest_keys"
    ADD CONSTRAINT "user_quest_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_quest_keys"
    ADD CONSTRAINT "user_quest_keys_user_id_quest_id_key_id_key" UNIQUE ("user_id", "quest_id", "key_id");



ALTER TABLE ONLY "public"."user_quest_progress"
    ADD CONSTRAINT "user_quest_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_quest_progress"
    ADD CONSTRAINT "user_quest_progress_user_id_quest_id_key" UNIQUE ("user_id", "quest_id");



ALTER TABLE ONLY "public"."user_task_completions"
    ADD CONSTRAINT "user_task_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_task_completions"
    ADD CONSTRAINT "user_task_completions_user_id_task_id_key" UNIQUE ("user_id", "task_id");



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_user_profile_id_task_id_key" UNIQUE ("user_profile_id", "task_id");



CREATE INDEX "idx_applications_cohort_id" ON "public"."applications" USING "btree" ("cohort_id");



CREATE INDEX "idx_applications_current_payment_transaction_id" ON "public"."applications" USING "btree" ("current_payment_transaction_id");



CREATE INDEX "idx_applications_payment_status" ON "public"."applications" USING "btree" ("payment_status") WHERE ("payment_status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text"]));



CREATE INDEX "idx_applications_status_sync" ON "public"."applications" USING "btree" ("id", "payment_status", "application_status");



CREATE INDEX "idx_applications_user_email" ON "public"."applications" USING "btree" ("user_email");



CREATE INDEX "idx_applications_user_profile_id" ON "public"."applications" USING "btree" ("user_profile_id");



CREATE INDEX "idx_bootcamp_enrollments_sync" ON "public"."bootcamp_enrollments" USING "btree" ("user_profile_id", "cohort_id", "enrollment_status");



CREATE INDEX "idx_bootcamp_enrollments_user_profile_id" ON "public"."bootcamp_enrollments" USING "btree" ("user_profile_id");



CREATE INDEX "idx_cohort_managers_cohort_id" ON "public"."cohort_managers" USING "btree" ("cohort_id");



CREATE INDEX "idx_cohort_managers_user_profile_id" ON "public"."cohort_managers" USING "btree" ("user_profile_id");



CREATE INDEX "idx_cohort_milestones_cohort_id" ON "public"."cohort_milestones" USING "btree" ("cohort_id");



CREATE INDEX "idx_lock_registry_lock_address" ON "public"."lock_registry" USING "btree" ("lock_address");



CREATE INDEX "idx_milestone_tasks_contract_address" ON "public"."milestone_tasks" USING "btree" ("contract_address");



CREATE INDEX "idx_milestone_tasks_contract_network" ON "public"."milestone_tasks" USING "btree" ("contract_network");



CREATE INDEX "idx_milestone_tasks_milestone_id" ON "public"."milestone_tasks" USING "btree" ("milestone_id");



CREATE INDEX "idx_milestone_tasks_task_type" ON "public"."milestone_tasks" USING "btree" ("task_type");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_profile_id" ON "public"."notifications" USING "btree" ("user_profile_id");



CREATE INDEX "idx_payment_transactions_application_id" ON "public"."payment_transactions" USING "btree" ("application_id");



CREATE INDEX "idx_payment_transactions_created_at" ON "public"."payment_transactions" USING "btree" ("created_at");



CREATE INDEX "idx_payment_transactions_network_chain_id" ON "public"."payment_transactions" USING "btree" ("network_chain_id") WHERE ("network_chain_id" IS NOT NULL);



CREATE INDEX "idx_payment_transactions_payment_reference" ON "public"."payment_transactions" USING "btree" ("payment_reference");



CREATE INDEX "idx_payment_transactions_paystack_reference" ON "public"."payment_transactions" USING "btree" ("paystack_reference");



CREATE INDEX "idx_payment_transactions_status" ON "public"."payment_transactions" USING "btree" ("status");



CREATE INDEX "idx_payment_transactions_transaction_hash" ON "public"."payment_transactions" USING "btree" ("transaction_hash") WHERE ("transaction_hash" IS NOT NULL);



CREATE INDEX "idx_program_highlights_cohort_id" ON "public"."program_highlights" USING "btree" ("cohort_id");



CREATE INDEX "idx_program_requirements_cohort_id" ON "public"."program_requirements" USING "btree" ("cohort_id");



CREATE INDEX "idx_quest_tasks_order_index" ON "public"."quest_tasks" USING "btree" ("order_index");



CREATE INDEX "idx_quest_tasks_quest_id" ON "public"."quest_tasks" USING "btree" ("quest_id");



CREATE INDEX "idx_task_submissions_status" ON "public"."task_submissions" USING "btree" ("status");



CREATE INDEX "idx_task_submissions_submission_type" ON "public"."task_submissions" USING "btree" ("submission_type");



CREATE INDEX "idx_task_submissions_task_id" ON "public"."task_submissions" USING "btree" ("task_id");



CREATE INDEX "idx_task_submissions_user_id" ON "public"."task_submissions" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_task_submissions_user_task_unique" ON "public"."task_submissions" USING "btree" ("task_id", "user_id");



COMMENT ON INDEX "public"."idx_task_submissions_user_task_unique" IS 'Ensures one submission per user per task. Users can only have one submission record per task, which gets updated for resubmissions.';



CREATE INDEX "idx_tos_signatures_user_id" ON "public"."tos_signatures" USING "btree" ("user_id");



CREATE INDEX "idx_tos_signatures_wallet_address" ON "public"."tos_signatures" USING "btree" ("wallet_address");



CREATE INDEX "idx_user_activities_activity_type" ON "public"."user_activities" USING "btree" ("activity_type");



CREATE INDEX "idx_user_activities_user_profile_id" ON "public"."user_activities" USING "btree" ("user_profile_id");



CREATE INDEX "idx_user_application_status_mismatch" ON "public"."user_application_status" USING "btree" ("application_id", "status");



CREATE INDEX "idx_user_application_status_status" ON "public"."user_application_status" USING "btree" ("status");



CREATE INDEX "idx_user_application_status_sync" ON "public"."user_application_status" USING "btree" ("application_id", "user_profile_id", "status");



CREATE INDEX "idx_user_application_status_user_profile_id" ON "public"."user_application_status" USING "btree" ("user_profile_id");



CREATE INDEX "idx_user_journey_preferences_enrollment_id" ON "public"."user_journey_preferences" USING "btree" ("enrollment_id");



CREATE INDEX "idx_user_journey_preferences_is_hidden" ON "public"."user_journey_preferences" USING "btree" ("is_hidden");



CREATE INDEX "idx_user_journey_preferences_user_profile_id" ON "public"."user_journey_preferences" USING "btree" ("user_profile_id");



CREATE INDEX "idx_user_milestone_progress_milestone_id" ON "public"."user_milestone_progress" USING "btree" ("milestone_id");



CREATE INDEX "idx_user_milestone_progress_status" ON "public"."user_milestone_progress" USING "btree" ("status");



CREATE INDEX "idx_user_milestone_progress_user_profile_id" ON "public"."user_milestone_progress" USING "btree" ("user_profile_id");



CREATE INDEX "idx_user_milestones_user_id" ON "public"."user_milestones" USING "btree" ("user_id");



CREATE INDEX "idx_user_profiles_privy_user_id" ON "public"."user_profiles" USING "btree" ("privy_user_id");



CREATE INDEX "idx_user_profiles_wallet_address" ON "public"."user_profiles" USING "btree" ("wallet_address");



CREATE INDEX "idx_user_quest_keys_quest_id" ON "public"."user_quest_keys" USING "btree" ("quest_id");



CREATE INDEX "idx_user_quest_keys_user_id" ON "public"."user_quest_keys" USING "btree" ("user_id");



CREATE INDEX "idx_user_quest_progress_quest_id" ON "public"."user_quest_progress" USING "btree" ("quest_id");



CREATE INDEX "idx_user_quest_progress_user_id" ON "public"."user_quest_progress" USING "btree" ("user_id");



CREATE INDEX "idx_user_task_completions_quest_id" ON "public"."user_task_completions" USING "btree" ("quest_id");



CREATE INDEX "idx_user_task_completions_quest_status" ON "public"."user_task_completions" USING "btree" ("quest_id", "submission_status");



CREATE INDEX "idx_user_task_completions_status" ON "public"."user_task_completions" USING "btree" ("submission_status");



CREATE INDEX "idx_user_task_completions_task_id" ON "public"."user_task_completions" USING "btree" ("task_id");



CREATE INDEX "idx_user_task_completions_user_id" ON "public"."user_task_completions" USING "btree" ("user_id");



CREATE INDEX "idx_user_task_progress_status" ON "public"."user_task_progress" USING "btree" ("status");



CREATE INDEX "idx_user_task_progress_task_id" ON "public"."user_task_progress" USING "btree" ("task_id");



CREATE INDEX "idx_user_task_progress_user_profile_id" ON "public"."user_task_progress" USING "btree" ("user_profile_id");



CREATE OR REPLACE TRIGGER "check_bootcamp_program_lock_address" BEFORE INSERT OR UPDATE OF "lock_address" ON "public"."bootcamp_programs" FOR EACH ROW EXECUTE FUNCTION "public"."check_lock_address_uniqueness"('bootcamp_program', 'program_certification');



CREATE OR REPLACE TRIGGER "check_cohort_lock_address" BEFORE INSERT OR UPDATE OF "lock_address" ON "public"."cohorts" FOR EACH ROW EXECUTE FUNCTION "public"."check_lock_address_uniqueness"('cohort', 'access_ticket');



CREATE OR REPLACE TRIGGER "check_milestone_lock_address" BEFORE INSERT OR UPDATE OF "lock_address" ON "public"."cohort_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."check_lock_address_uniqueness"('milestone', 'achievement_badge');



CREATE OR REPLACE TRIGGER "check_quest_lock_address" BEFORE INSERT OR UPDATE OF "lock_address" ON "public"."quests" FOR EACH ROW EXECUTE FUNCTION "public"."check_lock_address_uniqueness"('quest', 'completion_badge');



CREATE OR REPLACE TRIGGER "ensure_single_submission_per_user_task" BEFORE INSERT OR UPDATE ON "public"."task_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."check_single_submission_per_user_task"();



CREATE OR REPLACE TRIGGER "trg_update_cohort_milestones_updated" BEFORE UPDATE ON "public"."cohort_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_lock_registry_updated" BEFORE UPDATE ON "public"."lock_registry" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_user_milestones_updated" BEFORE UPDATE ON "public"."user_milestones" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_application_status" AFTER INSERT OR UPDATE OF "status" ON "public"."user_application_status" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_application_status"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_enrollment_change" AFTER INSERT OR UPDATE OF "enrollment_status" ON "public"."bootcamp_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_enrollment_change"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_milestone_progress" AFTER INSERT OR UPDATE OF "status" ON "public"."user_milestone_progress" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_milestone_progress"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_task_progress" AFTER INSERT OR UPDATE OF "status" ON "public"."user_task_progress" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_task_progress"();



CREATE OR REPLACE TRIGGER "trigger_notify_on_task_submission_review" AFTER UPDATE OF "status" ON "public"."task_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."notify_on_task_submission_review"();



CREATE OR REPLACE TRIGGER "trigger_update_quest_progress" AFTER INSERT OR DELETE OR UPDATE OF "submission_status" ON "public"."user_task_completions" FOR EACH ROW EXECUTE FUNCTION "public"."update_quest_progress_on_task_change"();



CREATE OR REPLACE TRIGGER "update_applications_updated_at" BEFORE UPDATE ON "public"."applications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_bootcamp_enrollments_updated_at" BEFORE UPDATE ON "public"."bootcamp_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_bootcamp_programs_updated_at" BEFORE UPDATE ON "public"."bootcamp_programs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cohort_managers_updated_at" BEFORE UPDATE ON "public"."cohort_managers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_cohorts_updated_at" BEFORE UPDATE ON "public"."cohorts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_milestone_progress_on_task_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_task_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_milestone_progress"();



CREATE OR REPLACE TRIGGER "update_milestone_reward_on_task_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."milestone_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_milestone_total_reward"();



CREATE OR REPLACE TRIGGER "update_payment_transactions_updated_at" BEFORE UPDATE ON "public"."payment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quest_tasks_updated_at" BEFORE UPDATE ON "public"."quest_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_quests_updated_at" BEFORE UPDATE ON "public"."quests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_task_progress_on_submission_change" AFTER INSERT OR UPDATE ON "public"."task_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_task_progress_on_submission"();



CREATE OR REPLACE TRIGGER "update_user_application_status_updated_at" BEFORE UPDATE ON "public"."user_application_status" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_milestone_progress_updated_at" BEFORE UPDATE ON "public"."user_milestone_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_quest_progress_updated_at" BEFORE UPDATE ON "public"."user_quest_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_task_progress_updated_at" BEFORE UPDATE ON "public"."user_task_progress" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "user_journey_preferences_updated_at" BEFORE UPDATE ON "public"."user_journey_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_journey_preferences_updated_at"();



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_current_payment_transaction_id_fkey" FOREIGN KEY ("current_payment_transaction_id") REFERENCES "public"."payment_transactions"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bootcamp_enrollments"
    ADD CONSTRAINT "bootcamp_enrollments_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bootcamp_enrollments"
    ADD CONSTRAINT "bootcamp_enrollments_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_managers"
    ADD CONSTRAINT "cohort_managers_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_managers"
    ADD CONSTRAINT "cohort_managers_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_milestones"
    ADD CONSTRAINT "cohort_milestones_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cohort_milestones"
    ADD CONSTRAINT "cohort_milestones_prerequisite_milestone_id_fkey" FOREIGN KEY ("prerequisite_milestone_id") REFERENCES "public"."cohort_milestones"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cohorts"
    ADD CONSTRAINT "cohorts_bootcamp_program_id_fkey" FOREIGN KEY ("bootcamp_program_id") REFERENCES "public"."bootcamp_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."milestone_tasks"
    ADD CONSTRAINT "milestone_tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."cohort_milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_highlights"
    ADD CONSTRAINT "program_highlights_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."program_requirements"
    ADD CONSTRAINT "program_requirements_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quest_tasks"
    ADD CONSTRAINT "quest_tasks_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_submissions"
    ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."milestone_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activities"
    ADD CONSTRAINT "user_activities_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_application_status"
    ADD CONSTRAINT "user_application_status_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_application_status"
    ADD CONSTRAINT "user_application_status_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_journey_preferences"
    ADD CONSTRAINT "user_journey_preferences_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."bootcamp_enrollments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_journey_preferences"
    ADD CONSTRAINT "user_journey_preferences_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_milestone_progress"
    ADD CONSTRAINT "user_milestone_progress_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."cohort_milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_milestone_progress"
    ADD CONSTRAINT "user_milestone_progress_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."cohort_milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quest_keys"
    ADD CONSTRAINT "user_quest_keys_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quest_progress"
    ADD CONSTRAINT "user_quest_progress_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_completions"
    ADD CONSTRAINT "user_task_completions_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_completions"
    ADD CONSTRAINT "user_task_completions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."quest_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_completions"
    ADD CONSTRAINT "user_task_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("privy_user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."cohort_milestones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."task_submissions"("id");



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."milestone_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_task_progress"
    ADD CONSTRAINT "user_task_progress_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can update task completion status" ON "public"."user_task_completions" FOR UPDATE USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can view all task completions" ON "public"."user_task_completions" FOR SELECT USING (((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text") OR (("auth"."uid"())::"text" = "user_id")));



CREATE POLICY "Allow authenticated users to manage bootcamp_programs" ON "public"."bootcamp_programs" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to bootcamp_programs" ON "public"."bootcamp_programs" FOR SELECT USING (true);



CREATE POLICY "Allow read access to quest_tasks" ON "public"."quest_tasks" FOR SELECT USING (true);



CREATE POLICY "Allow read access to quests" ON "public"."quests" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Allow service role to manage bootcamp_programs" ON "public"."bootcamp_programs" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Authenticated read cohort milestones" ON "public"."cohort_milestones" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can delete milestone records" ON "public"."cohort_milestones" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert into lock registry" ON "public"."lock_registry" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can insert milestone records" ON "public"."cohort_milestones" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage highlights" ON "public"."program_highlights" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage milestone tasks" ON "public"."milestone_tasks" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can manage requirements" ON "public"."program_requirements" USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read milestone records" ON "public"."cohort_milestones" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read milestone tasks" ON "public"."milestone_tasks" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update lock registry" ON "public"."lock_registry" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update milestone records" ON "public"."cohort_milestones" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can update submissions" ON "public"."task_submissions" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can view cohort managers" ON "public"."cohort_managers" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can view lock registry" ON "public"."lock_registry" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable all for service role" ON "public"."cohorts" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable delete for authenticated users" ON "public"."cohorts" FOR DELETE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable insert for authenticated users" ON "public"."cohorts" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Enable read access for all users" ON "public"."cohorts" FOR SELECT USING (true);



CREATE POLICY "Enable update for authenticated users" ON "public"."cohorts" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Public can read program highlights" ON "public"."program_highlights" FOR SELECT USING (true);



CREATE POLICY "Public can read program requirements" ON "public"."program_requirements" FOR SELECT USING (true);



CREATE POLICY "Quest tasks are viewable by authenticated users" ON "public"."quest_tasks" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Quests are viewable by authenticated users" ON "public"."quests" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Service role can manage all activities" ON "public"."user_activities" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all application statuses" ON "public"."user_application_status" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all enrollments" ON "public"."bootcamp_enrollments" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all milestone progress" ON "public"."user_milestone_progress" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all notifications" ON "public"."notifications" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all profiles" ON "public"."user_profiles" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all submissions" ON "public"."task_submissions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage all task progress" ON "public"."user_task_progress" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage applications" ON "public"."applications" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage cohort managers" ON "public"."cohort_managers" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage lock registry" ON "public"."lock_registry" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage milestone records" ON "public"."cohort_milestones" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage payment transactions" ON "public"."payment_transactions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can create own TOS signatures" ON "public"."tos_signatures" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can create own quest progress" ON "public"."user_quest_progress" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can create own task completions" ON "public"."user_task_completions" FOR INSERT WITH CHECK ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can create their own milestone progress" ON "public"."user_milestone_progress" FOR INSERT WITH CHECK (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can create their own submissions" ON "public"."task_submissions" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND (("user_id")::"text" = ("auth"."uid"())::"text")));



CREATE POLICY "Users can create their own task progress" ON "public"."user_task_progress" FOR INSERT WITH CHECK (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can manage their own TOS signatures" ON "public"."tos_signatures" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can manage their own applications" ON "public"."applications" USING (((("auth"."uid"())::"text" = "user_email") OR ("auth"."email"() = "user_email")));



CREATE POLICY "Users can manage their own quest progress" ON "public"."user_quest_progress" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can manage their own task completions" ON "public"."user_task_completions" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can only access their own journey preferences" ON "public"."user_journey_preferences" USING (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."jwt"() ->> 'sub'::"text")))));



CREATE POLICY "Users can read their notifications" ON "public"."notifications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "notifications"."user_profile_id") AND (("up"."privy_user_id")::"text" = ("auth"."uid"())::"text")))));



CREATE POLICY "Users can read their own submissions" ON "public"."task_submissions" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ((("user_id")::"text" = ("auth"."uid"())::"text") OR ("auth"."role"() = 'service_role'::"text"))));



CREATE POLICY "Users can update own quest progress" ON "public"."user_quest_progress" FOR UPDATE USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can update own task completions" ON "public"."user_task_completions" FOR UPDATE USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can update their own milestone progress" ON "public"."user_milestone_progress" FOR UPDATE USING (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can update their own task progress" ON "public"."user_task_progress" FOR UPDATE USING (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can view own TOS signatures" ON "public"."tos_signatures" FOR SELECT USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can view own quest progress" ON "public"."user_quest_progress" FOR SELECT USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can view own task completions" ON "public"."user_task_completions" FOR SELECT USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users can view their own activities" ON "public"."user_activities" FOR SELECT USING (("auth"."uid"() IN ( SELECT ("user_profiles"."privy_user_id")::"uuid" AS "privy_user_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "user_activities"."user_profile_id"))));



CREATE POLICY "Users can view their own application status" ON "public"."user_application_status" FOR SELECT USING (("auth"."uid"() IN ( SELECT ("user_profiles"."privy_user_id")::"uuid" AS "privy_user_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "user_application_status"."user_profile_id"))));



CREATE POLICY "Users can view their own applications" ON "public"."applications" FOR SELECT USING (("auth"."uid"() IN ( SELECT ("user_profiles"."privy_user_id")::"uuid" AS "privy_user_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "applications"."user_profile_id"))));



CREATE POLICY "Users can view their own enrollments" ON "public"."bootcamp_enrollments" FOR SELECT USING (("auth"."uid"() IN ( SELECT ("user_profiles"."privy_user_id")::"uuid" AS "privy_user_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "bootcamp_enrollments"."user_profile_id"))));



CREATE POLICY "Users can view their own milestone progress" ON "public"."user_milestone_progress" FOR SELECT USING (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users can view their own payment transactions" ON "public"."payment_transactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."applications"
  WHERE (("applications"."id" = "payment_transactions"."application_id") AND (("applications"."user_email" = "auth"."email"()) OR (("auth"."uid"())::"text" = "applications"."user_email"))))));



CREATE POLICY "Users can view their own profile" ON "public"."user_profiles" FOR SELECT USING ((("auth"."uid"())::"text" = ("privy_user_id")::"text"));



CREATE POLICY "Users can view their own task progress" ON "public"."user_task_progress" FOR SELECT USING (("user_profile_id" IN ( SELECT "user_profiles"."id"
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."privy_user_id")::"text" = ("auth"."uid"())::"text"))));



CREATE POLICY "Users manage own milestone progress" ON "public"."user_milestones" USING ((("auth"."uid"())::"text" = "user_id"));



CREATE POLICY "Users manage own quest keys" ON "public"."user_quest_keys" USING ((("auth"."uid"())::"text" = "user_id"));



ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bootcamp_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bootcamp_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_managers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohort_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cohorts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lock_registry" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."milestone_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_highlights" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."program_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quest_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tos_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_application_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_journey_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_milestone_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_milestones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quest_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quest_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_task_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_task_progress" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."check_lock_address_uniqueness"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_lock_address_uniqueness"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_lock_address_uniqueness"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_single_submission_per_user_task"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_single_submission_per_user_task"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_single_submission_per_user_task"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_profile_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_profile_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_profile_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_metadata" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."exec_sql"("sql_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exec_sql"("sql_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."exec_sql"("sql_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_successful_payment"("p_application_id" "uuid", "p_payment_reference" "text", "p_payment_method" "text", "p_transaction_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_successful_payment"("p_application_id" "uuid", "p_payment_reference" "text", "p_payment_method" "text", "p_transaction_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_successful_payment"("p_application_id" "uuid", "p_payment_reference" "text", "p_payment_method" "text", "p_transaction_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_application_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_application_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_application_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_enrollment_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_enrollment_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_enrollment_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_milestone_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_milestone_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_milestone_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_task_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_task_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_task_progress"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_on_task_submission_review"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_on_task_submission_review"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_on_task_submission_review"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_quest_progress"("p_user_id" "text", "p_quest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_quest_progress"("p_user_id" "text", "p_quest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_quest_progress"("p_user_id" "text", "p_quest_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_milestone_total_reward"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_milestone_total_reward"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_milestone_total_reward"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quest_progress_on_task_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_quest_progress_on_task_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quest_progress_on_task_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_task_progress_on_submission"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_task_progress_on_submission"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_task_progress_on_submission"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_journey_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_journey_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_journey_preferences_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_milestone_progress"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_milestone_progress"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_milestone_progress"() TO "service_role";


















GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."bootcamp_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."bootcamp_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."bootcamp_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."bootcamp_programs" TO "anon";
GRANT ALL ON TABLE "public"."bootcamp_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."bootcamp_programs" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_managers" TO "anon";
GRANT ALL ON TABLE "public"."cohort_managers" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_managers" TO "service_role";



GRANT ALL ON TABLE "public"."cohort_milestones" TO "anon";
GRANT ALL ON TABLE "public"."cohort_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."cohort_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."cohorts" TO "anon";
GRANT ALL ON TABLE "public"."cohorts" TO "authenticated";
GRANT ALL ON TABLE "public"."cohorts" TO "service_role";



GRANT ALL ON TABLE "public"."lock_registry" TO "anon";
GRANT ALL ON TABLE "public"."lock_registry" TO "authenticated";
GRANT ALL ON TABLE "public"."lock_registry" TO "service_role";



GRANT ALL ON TABLE "public"."milestone_tasks" TO "anon";
GRANT ALL ON TABLE "public"."milestone_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."milestone_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."program_highlights" TO "anon";
GRANT ALL ON TABLE "public"."program_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."program_highlights" TO "service_role";



GRANT ALL ON TABLE "public"."program_requirements" TO "anon";
GRANT ALL ON TABLE "public"."program_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."program_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."quests" TO "anon";
GRANT ALL ON TABLE "public"."quests" TO "authenticated";
GRANT ALL ON TABLE "public"."quests" TO "service_role";



GRANT ALL ON TABLE "public"."user_quest_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_quest_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quest_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_task_completions" TO "anon";
GRANT ALL ON TABLE "public"."user_task_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_task_completions" TO "service_role";



GRANT ALL ON TABLE "public"."quest_statistics" TO "anon";
GRANT ALL ON TABLE "public"."quest_statistics" TO "authenticated";
GRANT ALL ON TABLE "public"."quest_statistics" TO "service_role";



GRANT ALL ON TABLE "public"."quest_tasks" TO "anon";
GRANT ALL ON TABLE "public"."quest_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."quest_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."task_submissions" TO "anon";
GRANT ALL ON TABLE "public"."task_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."task_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."tos_signatures" TO "anon";
GRANT ALL ON TABLE "public"."tos_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."tos_signatures" TO "service_role";



GRANT ALL ON TABLE "public"."user_activities" TO "anon";
GRANT ALL ON TABLE "public"."user_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activities" TO "service_role";



GRANT ALL ON TABLE "public"."user_application_status" TO "anon";
GRANT ALL ON TABLE "public"."user_application_status" TO "authenticated";
GRANT ALL ON TABLE "public"."user_application_status" TO "service_role";



GRANT ALL ON TABLE "public"."user_applications_view" TO "anon";
GRANT ALL ON TABLE "public"."user_applications_view" TO "authenticated";
GRANT ALL ON TABLE "public"."user_applications_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_enrollments_view" TO "anon";
GRANT ALL ON TABLE "public"."user_enrollments_view" TO "authenticated";
GRANT ALL ON TABLE "public"."user_enrollments_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_journey_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_journey_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_journey_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_milestone_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_milestone_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_milestone_progress" TO "service_role";



GRANT ALL ON TABLE "public"."user_milestones" TO "anon";
GRANT ALL ON TABLE "public"."user_milestones" TO "authenticated";
GRANT ALL ON TABLE "public"."user_milestones" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_quest_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_quest_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quest_keys" TO "service_role";



GRANT ALL ON TABLE "public"."user_task_progress" TO "anon";
GRANT ALL ON TABLE "public"."user_task_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."user_task_progress" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
