-- Migration: 028_atomic_payment_handling.sql
-- Creates a single, atomic function to handle all state changes for a successful payment.
-- Also cleans up redundant tables and old triggers for a cleaner, more robust schema.

-- 1. Clean up redundant tables to enforce a single source of truth for enrollments.
DROP TABLE IF EXISTS public.user_cohorts;
DROP TABLE IF EXISTS public.user_program_memberships;

-- 2. Clean up old, potentially conflicting status-sync triggers to centralize logic.
DROP TRIGGER IF EXISTS sync_status_on_application_update ON applications;
DROP TRIGGER IF EXISTS sync_status_on_user_app_status_update ON user_application_status;
DROP TRIGGER IF EXISTS sync_status_on_enrollment_change ON bootcamp_enrollments;
DROP FUNCTION IF EXISTS sync_application_status();
DROP FUNCTION IF EXISTS compute_user_application_status(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS reconcile_all_application_statuses();

-- 3. Create the new, robust atomic function for handling successful payments.
CREATE OR REPLACE FUNCTION public.handle_successful_payment(
    p_application_id UUID,
    p_payment_reference TEXT,
    p_payment_method TEXT,
    p_transaction_details JSONB DEFAULT '{}'
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    enrollment_id UUID,
    application_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_profile_id UUID;
    v_cohort_id TEXT;
    v_new_enrollment_id UUID;
BEGIN
    -- 1. Find the user and cohort associated with the application
    SELECT up.id, a.cohort_id
    INTO v_user_profile_id, v_cohort_id
    FROM public.applications a
    JOIN public.user_profiles up ON a.user_email = up.email
    WHERE a.id = p_application_id
    LIMIT 1;

    IF v_user_profile_id IS NULL THEN
        RAISE EXCEPTION 'User profile not found for application_id %', p_application_id;
    END IF;

    -- 2. Update the payment_transactions record with all available structured data.
    --    This serves as the primary audit trail for the payment itself.
    UPDATE public.payment_transactions
    SET 
        status = 'success',
        -- Paystack-specific fields
        paystack_status = p_transaction_details->>'status',
        paystack_gateway_response = p_transaction_details->>'gateway_response',
        authorization_code = p_transaction_details->'authorization'->>'authorization_code',
        customer_code = p_transaction_details->'customer'->>'customer_code',
        channel = p_transaction_details->>'channel',
        card_type = p_transaction_details->'authorization'->>'card_type',
        bank = p_transaction_details->'authorization'->>'bank',
        fees = (p_transaction_details->>'fees')::numeric / 100, -- Convert from kobo/cents
        paid_at = (p_transaction_details->>'paid_at')::timestamptz,
        -- Blockchain-specific fields
        transaction_hash = p_transaction_details->>'transaction_hash',
        key_token_id = p_transaction_details->>'key_token_id',
        network_chain_id = (p_transaction_details->>'network_chain_id')::bigint,
        -- Common fields
        updated_at = NOW(),
        metadata = metadata || p_transaction_details -- Store the full raw payload for auditing
    WHERE payment_reference = p_payment_reference;

    IF NOT FOUND THEN
        RAISE WARNING 'Payment transaction not found for reference %, but proceeding with enrollment.', p_payment_reference;
    END IF;

    -- 3. Update the application status to 'approved' and payment to 'completed'
    UPDATE public.applications
    SET 
        payment_status = 'completed',
        application_status = 'approved',
        payment_method = p_payment_method,
        updated_at = NOW()
    WHERE id = p_application_id;

    -- 4. Create or update the enrollment record in bootcamp_enrollments
    INSERT INTO public.bootcamp_enrollments (user_profile_id, cohort_id, enrollment_status)
    VALUES (v_user_profile_id, v_cohort_id, 'active')
    ON CONFLICT (user_profile_id, cohort_id) DO UPDATE
    SET enrollment_status = 'active', updated_at = NOW()
    RETURNING id INTO v_new_enrollment_id;

    -- 5. Create or update the user_application_status to 'enrolled'
    INSERT INTO public.user_application_status (
        user_profile_id, 
        application_id, 
        status, 
        payment_method, 
        amount_paid, 
        currency, 
        completed_at
    )
    SELECT 
        v_user_profile_id, 
        p_application_id, 
        'enrolled', 
        p_payment_method,
        -- Get amount and currency from the application
        a.total_amount,
        a.currency,
        NOW()
    FROM public.applications a 
    WHERE a.id = p_application_id
    ON CONFLICT (user_profile_id, application_id) 
    DO UPDATE SET
        status = 'enrolled',
        payment_method = EXCLUDED.payment_method,
        amount_paid = EXCLUDED.amount_paid,
        currency = EXCLUDED.currency,
        completed_at = EXCLUDED.completed_at,
        updated_at = NOW();

    -- 6. Log the payment activity and award XP
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
        500 -- Award 500 XP for enrolling
    );

    RETURN QUERY SELECT true, 'Payment processed and user enrolled successfully.', v_new_enrollment_id, p_application_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_successful_payment for application %: %', p_application_id, SQLERRM;
        RETURN QUERY SELECT false, SQLERRM, null::uuid, p_application_id;
END;
$$;

-- Grant execute permission to the service_role for API/Edge Function access
GRANT EXECUTE ON FUNCTION public.handle_successful_payment(UUID, TEXT, TEXT, JSONB) TO service_role;