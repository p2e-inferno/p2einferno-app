-- 064_add_message_link_to_notifications.sql
-- Align notification schema with create_notification_v2 expectations while keeping legacy consumers working.

-- 1) Add new columns if they are missing
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link TEXT;
-- 2) Backfill existing rows so legacy data has the new fields populated
UPDATE public.notifications
SET message = body
WHERE message IS NULL AND body IS NOT NULL;
UPDATE public.notifications
SET link = metadata ->> 'link'
WHERE link IS NULL
  AND metadata IS NOT NULL
  AND metadata ? 'link';
-- 3) Keep metadata non-null for future updates
UPDATE public.notifications
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;
-- 4) Recreate helper to populate both legacy and new columns
CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_user_profile_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_link TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  IF p_link IS NOT NULL THEN
    v_metadata := jsonb_build_object('link', p_link);
  END IF;

  INSERT INTO public.notifications (
    user_profile_id,
    title,
    message,
    link,
    body,
    metadata,
    read,
    created_at
  )
  VALUES (
    p_user_profile_id,
    p_title,
    p_message,
    p_link,
    p_message,
    v_metadata,
    false,
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Ensure privileges remain intact after recreating the function
GRANT EXECUTE ON FUNCTION public.create_notification_v2(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;
