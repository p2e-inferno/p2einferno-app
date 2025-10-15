-- 083_add_retry_count_increment.sql
-- RPC to increment certificate_retry_count atomically

CREATE OR REPLACE FUNCTION public.increment_certificate_retry_count(
  p_enrollment_id UUID
)
RETURNS VOID
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.bootcamp_enrollments
  SET certificate_retry_count = COALESCE(certificate_retry_count, 0) + 1,
      updated_at = now()
  WHERE id = p_enrollment_id;
END;
$$;

