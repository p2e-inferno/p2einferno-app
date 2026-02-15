-- Migration 143: Add Telegram notification support
-- Purpose: Enable Telegram bot notifications for users
-- Adds telegram columns to user_profiles, activation tokens table,
-- pg_net extension, and a trigger to dispatch notifications to Telegram.

-- 1) Add Telegram columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_user_profiles_telegram_chat_id
  ON public.user_profiles(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- 2) Create activation tokens table for bot deep link flow
CREATE TABLE IF NOT EXISTS public.telegram_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_activation_token
  ON public.telegram_activation_tokens(token)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_activation_user
  ON public.telegram_activation_tokens(user_profile_id)
  WHERE used_at IS NULL;

ALTER TABLE public.telegram_activation_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: service_role only (tokens are managed server-side)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role manages activation tokens" ON public.telegram_activation_tokens;
END $$;

CREATE POLICY "Service role manages activation tokens"
  ON public.telegram_activation_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) Enable pg_net extension for async HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4) Seed the Supabase URL into existing system_config table
-- The trigger reads this to build the edge function URL.
-- For production, update the value to https://<project-ref>.supabase.co
INSERT INTO public.system_config (key, value, description) VALUES
  ('supabase_url', 'http://host.docker.internal:54321', 'Supabase project URL used by triggers to call edge functions (use host.docker.internal for local dev, project URL for production)')
ON CONFLICT (key) DO NOTHING;

-- 5) Trigger function: dispatch Telegram notification on notifications INSERT
CREATE OR REPLACE FUNCTION public.dispatch_telegram_notification()
RETURNS TRIGGER
SET search_path = 'public'
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id BIGINT;
  v_base_url TEXT;
  v_edge_fn_url TEXT;
BEGIN
  -- Check if user has Telegram notifications enabled
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.user_profiles
  WHERE id = NEW.user_profile_id
    AND telegram_notifications_enabled = true
    AND telegram_chat_id IS NOT NULL;

  -- Skip if user has no Telegram linked or notifications disabled
  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read Supabase URL from system_config (same table used for withdrawal limits etc.)
  SELECT value INTO v_base_url
  FROM public.system_config
  WHERE key = 'supabase_url';

  -- If URL is not configured, skip silently
  IF v_base_url IS NULL OR v_base_url = '' THEN
    RETURN NEW;
  END IF;

  v_edge_fn_url := v_base_url || '/functions/v1/send-telegram-notification';

  -- Fire-and-forget HTTP POST via pg_net (no auth header needed, verify_jwt = false)
  PERFORM net.http_post(
    url := v_edge_fn_url,
    body := jsonb_build_object(
      'chat_id', v_chat_id,
      'title', COALESCE(NEW.title, ''),
      'message', COALESCE(NEW.message, NEW.body, ''),
      'link', NEW.link,
      'type', COALESCE(NEW.type, '')
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- pg_net not available or HTTP call failed: log warning and continue
  -- Never block notification insert due to Telegram delivery failure
  RAISE WARNING 'dispatch_telegram_notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS trigger_dispatch_telegram_notification ON public.notifications;

CREATE TRIGGER trigger_dispatch_telegram_notification
AFTER INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_telegram_notification();

-- Add helpful comments
COMMENT ON FUNCTION public.dispatch_telegram_notification() IS
  'Forwards newly inserted notifications to Telegram via edge function (pg_net). Fires async, never blocks.';
COMMENT ON TABLE public.telegram_activation_tokens IS
  'One-time tokens for linking Telegram bot to user accounts. Tokens expire after 15 minutes.';
