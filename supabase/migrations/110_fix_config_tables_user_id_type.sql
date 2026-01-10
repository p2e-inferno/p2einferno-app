-- Fix user_id type mismatch in system_config and config_audit_log tables
-- The app uses Privy for authentication (text-based DIDs), not Supabase Auth (UUIDs)
-- This migration aligns the config tables with the approach taken in migration 088

-- 1. Drop the trigger first (depends on the columns)
DROP TRIGGER IF EXISTS trigger_log_config_change ON public.system_config;

-- 2. Drop foreign key constraints that reference auth.users (not used in this app)
ALTER TABLE public.system_config
  DROP CONSTRAINT IF EXISTS system_config_updated_by_fkey;

ALTER TABLE public.config_audit_log
  DROP CONSTRAINT IF EXISTS config_audit_log_changed_by_fkey;

-- 3. Change system_config.updated_by from uuid to text
ALTER TABLE public.system_config
  ALTER COLUMN updated_by TYPE text;

-- 4. Change config_audit_log.changed_by from uuid to text
ALTER TABLE public.config_audit_log
  ALTER COLUMN changed_by TYPE text;

-- 5. Make updated_by nullable in system_config (audit trail is primary record)
ALTER TABLE public.system_config
  ALTER COLUMN updated_by DROP NOT NULL;

-- 6. Update the trigger function to work with text user IDs
CREATE OR REPLACE FUNCTION public.log_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.config_audit_log (
    config_key,
    old_value,
    new_value,
    changed_by
  ) VALUES (
    NEW.key,
    OLD.value,
    NEW.value,
    NEW.updated_by
  );

  RETURN NEW;
END;
$$;

-- 7. Recreate the trigger on system_config
CREATE TRIGGER trigger_log_config_change
  AFTER UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.log_config_change();
