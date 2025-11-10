-- 102_perform_daily_checkin_tx.sql
-- Transactional daily check-in function
-- Performs: INSERT user_activities (daily_checkin) -> UPDATE user_profiles XP
-- Returns conflict when unique index blocks duplicate same-day check-ins

CREATE OR REPLACE FUNCTION public.perform_daily_checkin(
  p_user_profile_id uuid,
  p_xp_amount integer,
  p_activity_data jsonb DEFAULT '{}'::jsonb,
  p_attestation jsonb DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  conflict boolean,
  new_xp integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_new_xp integer;
  v_owner_ok boolean;
BEGIN
  -- Authorization guard: allow service_role or the profile owner
  IF auth.role() <> 'service_role' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.id = p_user_profile_id
        AND up.privy_user_id = auth.uid()::text
    ) INTO v_owner_ok;

    IF NOT v_owner_ok THEN
      RAISE EXCEPTION 'not authorized to check-in for this profile' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Insert activity first; rely on unique index to prevent duplicates
  BEGIN
    INSERT INTO public.user_activities (
      user_profile_id,
      activity_type,
      activity_data,
      points_earned
    ) VALUES (
      p_user_profile_id,
      'daily_checkin',
      COALESCE(p_activity_data, '{}'::jsonb),
      p_xp_amount
    );
  EXCEPTION WHEN unique_violation THEN
    -- Duplicate same-day check-in attempted; do not update XP
    RETURN QUERY SELECT false, true, NULL::integer;
    RETURN;
  END;

  -- Update XP only after successful insert
  UPDATE public.user_profiles
  SET
    experience_points = COALESCE(experience_points, 0) + p_xp_amount,
    updated_at = NOW()
  WHERE id = p_user_profile_id
  RETURNING experience_points INTO v_new_xp;

  -- Optional: persist attestation metadata (best-effort; do not fail check-in)
  IF p_attestation IS NOT NULL THEN
    BEGIN
      IF (p_attestation ? 'uid') AND (p_attestation ? 'schemaUid') THEN
        INSERT INTO public.attestations (
          attestation_uid,
          schema_uid,
          attester,
          recipient,
          data,
          expiration_time
        ) VALUES (
          p_attestation->>'uid',
          p_attestation->>'schemaUid',
          lower(COALESCE(p_attestation->>'attester', '')),
          lower(COALESCE(p_attestation->>'recipient', '')),
          COALESCE(p_attestation->'data', '{}'::jsonb),
          CASE WHEN (p_attestation->>'expirationTime') IS NOT NULL
            THEN to_timestamp((p_attestation->>'expirationTime')::double precision)
            ELSE NULL
          END
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- swallow attestation errors; logging handled at API/service level
      PERFORM 1;
    END;
  END IF;

  RETURN QUERY SELECT true, false, v_new_xp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_daily_checkin(uuid, integer, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.perform_daily_checkin(uuid, integer, jsonb, jsonb) IS
  'Atomic daily check-in: insert activity then update XP; returns conflict on duplicate (unique index enforced). Secured with fixed search_path per advisory 0011.';

