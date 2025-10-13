-- Secure remaining SECURITY DEFINER functions with fixed search_path
-- This migration addresses SQL injection vulnerabilities via search_path manipulation
-- Ref: Supabase Database Linter Advisory 0011

-- ============================================================================
-- 1. Secure create_notification function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_profile_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (user_profile_id, type, title, body, metadata)
  VALUES (p_user_profile_id, p_type, p_title, p_body, COALESCE(p_metadata, '{}'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Preserve existing grants
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- Add security comment
COMMENT ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB) IS
  'Secured with fixed search_path per Supabase advisory 0011. Used by notification triggers throughout the application.';

-- ============================================================================
-- 2. Secure exec_sql function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS VOID
SET search_path = 'public'
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Preserve existing security restriction (only service_role can execute)
REVOKE ALL ON FUNCTION public.exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

-- Add security comment
COMMENT ON FUNCTION public.exec_sql(TEXT) IS
  'Secured with fixed search_path per Supabase advisory 0011. RESTRICTED to service_role only for admin operations. High privilege function - use with caution.';

-- ============================================================================
-- Security Summary
-- ============================================================================
-- This migration completes function security hardening:
-- - All 7 SECURITY DEFINER functions now have fixed search_path protection
-- - SQL injection via search_path manipulation is prevented
-- - Functions maintain their original behavior and grants
-- ============================================================================
