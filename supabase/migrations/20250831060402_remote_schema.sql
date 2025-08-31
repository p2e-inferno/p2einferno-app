drop trigger if exists "trigger_notify_on_enrollment_change" on "public"."bootcamp_enrollments";

drop trigger if exists "update_cohort_managers_updated_at" on "public"."cohort_managers";

drop trigger if exists "ensure_single_submission_per_user_task" on "public"."task_submissions";

drop trigger if exists "trigger_notify_on_task_submission_review" on "public"."task_submissions";

drop trigger if exists "update_task_progress_on_submission_change" on "public"."task_submissions";

drop trigger if exists "trigger_notify_on_application_status" on "public"."user_application_status";

drop trigger if exists "user_journey_preferences_updated_at" on "public"."user_journey_preferences";

drop trigger if exists "trigger_notify_on_milestone_progress" on "public"."user_milestone_progress";

drop trigger if exists "trigger_notify_on_task_progress" on "public"."user_task_progress";

drop trigger if exists "update_milestone_progress_on_task_change" on "public"."user_task_progress";

drop trigger if exists "update_user_task_progress_updated_at" on "public"."user_task_progress";

drop policy "Authenticated users can view cohort managers" on "public"."cohort_managers";

drop policy "Service role can manage cohort managers" on "public"."cohort_managers";

drop policy "Users can read their notifications" on "public"."notifications";

drop policy "Service role can manage all submissions" on "public"."task_submissions";

drop policy "Users can only access their own journey preferences" on "public"."user_journey_preferences";

drop policy "Service role can manage all task progress" on "public"."user_task_progress";

drop policy "Users can create their own task progress" on "public"."user_task_progress";

drop policy "Users can update their own task progress" on "public"."user_task_progress";

drop policy "Users can view their own task progress" on "public"."user_task_progress";

drop policy "Users can create their own submissions" on "public"."task_submissions";

drop policy "Users can read their own submissions" on "public"."task_submissions";

revoke delete on table "public"."cohort_managers" from "anon";

revoke insert on table "public"."cohort_managers" from "anon";

revoke references on table "public"."cohort_managers" from "anon";

revoke select on table "public"."cohort_managers" from "anon";

revoke trigger on table "public"."cohort_managers" from "anon";

revoke truncate on table "public"."cohort_managers" from "anon";

revoke update on table "public"."cohort_managers" from "anon";

revoke delete on table "public"."cohort_managers" from "authenticated";

revoke insert on table "public"."cohort_managers" from "authenticated";

revoke references on table "public"."cohort_managers" from "authenticated";

revoke select on table "public"."cohort_managers" from "authenticated";

revoke trigger on table "public"."cohort_managers" from "authenticated";

revoke truncate on table "public"."cohort_managers" from "authenticated";

revoke update on table "public"."cohort_managers" from "authenticated";

revoke delete on table "public"."cohort_managers" from "service_role";

revoke insert on table "public"."cohort_managers" from "service_role";

revoke references on table "public"."cohort_managers" from "service_role";

revoke select on table "public"."cohort_managers" from "service_role";

revoke trigger on table "public"."cohort_managers" from "service_role";

revoke truncate on table "public"."cohort_managers" from "service_role";

revoke update on table "public"."cohort_managers" from "service_role";

revoke delete on table "public"."user_journey_preferences" from "anon";

revoke insert on table "public"."user_journey_preferences" from "anon";

revoke references on table "public"."user_journey_preferences" from "anon";

revoke select on table "public"."user_journey_preferences" from "anon";

revoke trigger on table "public"."user_journey_preferences" from "anon";

revoke truncate on table "public"."user_journey_preferences" from "anon";

revoke update on table "public"."user_journey_preferences" from "anon";

revoke delete on table "public"."user_journey_preferences" from "authenticated";

revoke insert on table "public"."user_journey_preferences" from "authenticated";

revoke references on table "public"."user_journey_preferences" from "authenticated";

revoke select on table "public"."user_journey_preferences" from "authenticated";

revoke trigger on table "public"."user_journey_preferences" from "authenticated";

revoke truncate on table "public"."user_journey_preferences" from "authenticated";

revoke update on table "public"."user_journey_preferences" from "authenticated";

revoke delete on table "public"."user_journey_preferences" from "service_role";

revoke insert on table "public"."user_journey_preferences" from "service_role";

revoke references on table "public"."user_journey_preferences" from "service_role";

revoke select on table "public"."user_journey_preferences" from "service_role";

revoke trigger on table "public"."user_journey_preferences" from "service_role";

revoke truncate on table "public"."user_journey_preferences" from "service_role";

revoke update on table "public"."user_journey_preferences" from "service_role";

revoke delete on table "public"."user_task_progress" from "anon";

revoke insert on table "public"."user_task_progress" from "anon";

revoke references on table "public"."user_task_progress" from "anon";

revoke select on table "public"."user_task_progress" from "anon";

revoke trigger on table "public"."user_task_progress" from "anon";

revoke truncate on table "public"."user_task_progress" from "anon";

revoke update on table "public"."user_task_progress" from "anon";

revoke delete on table "public"."user_task_progress" from "authenticated";

revoke insert on table "public"."user_task_progress" from "authenticated";

revoke references on table "public"."user_task_progress" from "authenticated";

revoke select on table "public"."user_task_progress" from "authenticated";

revoke trigger on table "public"."user_task_progress" from "authenticated";

revoke truncate on table "public"."user_task_progress" from "authenticated";

revoke update on table "public"."user_task_progress" from "authenticated";

revoke delete on table "public"."user_task_progress" from "service_role";

revoke insert on table "public"."user_task_progress" from "service_role";

revoke references on table "public"."user_task_progress" from "service_role";

revoke select on table "public"."user_task_progress" from "service_role";

revoke trigger on table "public"."user_task_progress" from "service_role";

revoke truncate on table "public"."user_task_progress" from "service_role";

revoke update on table "public"."user_task_progress" from "service_role";

alter table "public"."cohort_managers" drop constraint "cohort_managers_cohort_id_fkey";

alter table "public"."cohort_managers" drop constraint "cohort_managers_user_profile_id_cohort_id_key";

alter table "public"."cohort_managers" drop constraint "cohort_managers_user_profile_id_fkey";

alter table "public"."milestone_tasks" drop constraint "milestone_tasks_contract_address_check";

alter table "public"."milestone_tasks" drop constraint "milestone_tasks_contract_interaction_validation";

alter table "public"."milestone_tasks" drop constraint "milestone_tasks_contract_network_check";

alter table "public"."payment_transactions" drop constraint "payment_transactions_payment_reference_key";

alter table "public"."user_journey_preferences" drop constraint "user_journey_preferences_enrollment_id_fkey";

alter table "public"."user_journey_preferences" drop constraint "user_journey_preferences_user_profile_id_enrollment_id_key";

alter table "public"."user_journey_preferences" drop constraint "user_journey_preferences_user_profile_id_fkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_milestone_id_fkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_status_check";

alter table "public"."user_task_progress" drop constraint "user_task_progress_submission_id_fkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_task_id_fkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_user_profile_id_fkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_user_profile_id_task_id_key";

alter table "public"."payment_transactions" drop constraint "payment_transactions_currency_check";

alter table "public"."task_submissions" drop constraint "task_submissions_status_check";

drop function if exists "public"."check_single_submission_per_user_task"();

drop function if exists "public"."create_notification"(p_user_profile_id uuid, p_type text, p_title text, p_body text, p_metadata jsonb);

drop function if exists "public"."exec_sql"(sql_query text);

drop function if exists "public"."notify_on_application_status"();

drop function if exists "public"."notify_on_enrollment_change"();

drop function if exists "public"."notify_on_milestone_progress"();

drop function if exists "public"."notify_on_task_progress"();

drop function if exists "public"."notify_on_task_submission_review"();

drop function if exists "public"."update_task_progress_on_submission"();

drop function if exists "public"."update_user_journey_preferences_updated_at"();

drop function if exists "public"."update_user_milestone_progress"();

drop view if exists "public"."user_applications_view";

alter table "public"."cohort_managers" drop constraint "cohort_managers_pkey";

alter table "public"."user_journey_preferences" drop constraint "user_journey_preferences_pkey";

alter table "public"."user_task_progress" drop constraint "user_task_progress_pkey";

drop index if exists "public"."cohort_managers_pkey";

drop index if exists "public"."cohort_managers_user_profile_id_cohort_id_key";

drop index if exists "public"."idx_applications_payment_status";

drop index if exists "public"."idx_applications_status_sync";

drop index if exists "public"."idx_bootcamp_enrollments_sync";

drop index if exists "public"."idx_cohort_managers_cohort_id";

drop index if exists "public"."idx_cohort_managers_user_profile_id";

drop index if exists "public"."idx_milestone_tasks_contract_address";

drop index if exists "public"."idx_milestone_tasks_contract_network";

drop index if exists "public"."idx_notifications_created_at";

drop index if exists "public"."idx_notifications_read";

drop index if exists "public"."idx_payment_transactions_payment_reference";

drop index if exists "public"."idx_task_submissions_user_task_unique";

drop index if exists "public"."idx_user_application_status_mismatch";

drop index if exists "public"."idx_user_application_status_sync";

drop index if exists "public"."idx_user_journey_preferences_enrollment_id";

drop index if exists "public"."idx_user_journey_preferences_is_hidden";

drop index if exists "public"."idx_user_journey_preferences_user_profile_id";

drop index if exists "public"."idx_user_task_progress_status";

drop index if exists "public"."idx_user_task_progress_task_id";

drop index if exists "public"."idx_user_task_progress_user_profile_id";

drop index if exists "public"."payment_transactions_payment_reference_key";

drop index if exists "public"."user_journey_preferences_pkey";

drop index if exists "public"."user_journey_preferences_user_profile_id_enrollment_id_key";

drop index if exists "public"."user_task_progress_pkey";

drop index if exists "public"."user_task_progress_user_profile_id_task_id_key";

drop index if exists "public"."idx_payment_transactions_paystack_reference";

drop table "public"."cohort_managers";

drop table "public"."user_journey_preferences";

drop table "public"."user_task_progress";

alter table "public"."cohort_milestones" alter column "id" drop default;

alter table "public"."cohort_milestones" alter column "id" set data type text using "id"::text;

alter table "public"."cohort_milestones" alter column "prerequisite_milestone_id" set data type text using "prerequisite_milestone_id"::text;

alter table "public"."milestone_tasks" drop column "contract_address";

alter table "public"."milestone_tasks" drop column "contract_method";

alter table "public"."milestone_tasks" drop column "contract_network";

alter table "public"."milestone_tasks" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."milestone_tasks" alter column "id" set data type text using "id"::text;

alter table "public"."milestone_tasks" alter column "milestone_id" set data type text using "milestone_id"::text;

alter table "public"."notifications" drop column "body";

alter table "public"."notifications" drop column "metadata";

alter table "public"."notifications" drop column "type";

alter table "public"."notifications" add column "link" text;

alter table "public"."notifications" add column "message" text not null;

alter table "public"."notifications" alter column "read" drop not null;

alter table "public"."notifications" alter column "title" set not null;

alter table "public"."program_highlights" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."program_highlights" alter column "id" set data type text using "id"::text;

alter table "public"."program_requirements" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."program_requirements" alter column "id" set data type text using "id"::text;

alter table "public"."task_submissions" alter column "id" set default (gen_random_uuid())::text;

alter table "public"."task_submissions" alter column "id" set data type text using "id"::text;

alter table "public"."task_submissions" alter column "task_id" set data type text using "task_id"::text;

alter table "public"."user_milestone_progress" alter column "milestone_id" set data type text using "milestone_id"::text;

alter table "public"."user_milestones" alter column "milestone_id" set data type text using "milestone_id"::text;

CREATE UNIQUE INDEX idx_unique_payment_reference ON public.payment_transactions USING btree (payment_reference) WHERE ((status)::text = 'success'::text);

CREATE UNIQUE INDEX payment_transactions_paystack_reference_key ON public.payment_transactions USING btree (payment_reference);

CREATE INDEX idx_payment_transactions_paystack_reference ON public.payment_transactions USING btree (payment_reference);

alter table "public"."payment_transactions" add constraint "payment_transactions_paystack_reference_key" UNIQUE using index "payment_transactions_paystack_reference_key";

alter table "public"."payment_transactions" add constraint "payment_transactions_currency_check" CHECK (((currency)::text = ANY (ARRAY[('NGN'::character varying)::text, ('USD'::character varying)::text]))) not valid;

alter table "public"."payment_transactions" validate constraint "payment_transactions_currency_check";

alter table "public"."task_submissions" add constraint "task_submissions_status_check" CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('retry'::character varying)::text]))) not valid;

alter table "public"."task_submissions" validate constraint "task_submissions_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.award_xp_to_user(p_user_id uuid, p_xp_amount integer, p_activity_type text, p_activity_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Update experience_points on user_profiles
    UPDATE public.user_profiles
    SET experience_points = experience_points + p_xp_amount
    WHERE id = p_user_id;

    -- Log the activity in user_activities
    INSERT INTO public.user_activities (user_profile_id, activity_type, points_earned, activity_data)
    VALUES (p_user_id, p_activity_type, p_xp_amount, p_activity_data);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_duplicate_submission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM task_submissions
    WHERE task_id = NEW.task_id 
    AND user_id = NEW.user_id 
    AND status IN ('pending', 'completed')
    AND id != COALESCE(NEW.id, 'temp-id')
  ) THEN
    RAISE EXCEPTION 'User already has a pending or completed submission for this task';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_lock_address_uniqueness()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

create or replace view "public"."user_applications_view" as  SELECT uas.id,
    uas.user_profile_id,
    uas.application_id,
    uas.status,
    uas.created_at,
    a.cohort_id,
    a.user_name,
    a.user_email,
    a.experience_level,
    a.payment_status,
    a.application_status
   FROM (user_application_status uas
     JOIN applications a ON ((uas.application_id = a.id)));


create policy "public_insert_applications"
on "public"."applications"
as permissive
for insert
to public
with check (true);


create policy "public_select_applications"
on "public"."applications"
as permissive
for select
to public
using (true);


create policy "Users can manage their own notifications"
on "public"."notifications"
as permissive
for all
to public
using (((auth.uid())::text = (( SELECT user_profiles.privy_user_id
   FROM user_profiles
  WHERE (user_profiles.id = notifications.user_profile_id)))::text));


create policy "Users can create their own submissions"
on "public"."task_submissions"
as permissive
for insert
to public
with check ((auth.role() = 'authenticated'::text));


create policy "Users can read their own submissions"
on "public"."task_submissions"
as permissive
for select
to public
using ((auth.role() = 'authenticated'::text));


CREATE TRIGGER prevent_duplicate_submissions BEFORE INSERT OR UPDATE ON public.task_submissions FOR EACH ROW EXECUTE FUNCTION check_duplicate_submission();


