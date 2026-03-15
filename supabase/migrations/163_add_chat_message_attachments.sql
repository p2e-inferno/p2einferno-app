-- Store attachment metadata alongside chat messages so that image/video-only
-- turns survive conversation restore without becoming ghost messages.
-- Only the Vercel Blob pathname is stored (not the file data itself) to avoid
-- double storage. The proxy URL is reconstructed from the pathname on read.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb;
