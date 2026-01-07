-- Lock down config_audit_log to admins only
-- Ensures audit history is not readable by non-admin users

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.config_audit_log;

CREATE POLICY "Admins can view audit logs"
  ON public.config_audit_log
  FOR SELECT
  USING (
    auth.role() = 'service_role'
  );
