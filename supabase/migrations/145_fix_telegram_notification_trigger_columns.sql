-- Migration 145: Fix Telegram notification trigger column references
-- The dispatch_telegram_notification() function referenced NEW.body and NEW.type
-- which don't exist on the notifications table (columns: id, user_profile_id, title,
-- message, link, read, created_at, metadata). This caused a silent runtime error
-- caught by the EXCEPTION handler, preventing pg_net from ever firing.

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

  -- Read Supabase URL from system_config
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
      'message', COALESCE(NEW.message, ''),
      'link', NEW.link,
      'type', COALESCE(NEW.metadata->>'type', '')
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

COMMENT ON FUNCTION public.dispatch_telegram_notification() IS
  'Forwards newly inserted notifications to Telegram via edge function (pg_net). Fires async, never blocks.';
