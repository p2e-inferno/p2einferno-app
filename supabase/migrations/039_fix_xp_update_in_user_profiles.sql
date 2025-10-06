-- Migration: 039_fix_xp_update_in_user_profiles.sql
-- Fix XP points to update both user_activities AND user_profiles tables

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
    returned_application_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
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
