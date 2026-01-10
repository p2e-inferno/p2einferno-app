-- Add email_events for deduplication and tracking
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  target_id UUID,
  recipient_email TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_events_unique
  ON email_events (event_type, target_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_email_events_lookup
  ON email_events (event_type, target_id, status);

CREATE INDEX IF NOT EXISTS idx_email_events_sent_at
  ON email_events (sent_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON email_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE email_events IS 'Tracks sent transactional emails for deduplication';

-- Optional queue for failed emails (manual or scheduled retries)
CREATE TABLE IF NOT EXISTS email_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  target_id UUID,
  recipient_email TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_data JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_send_queue (next_retry_at)
  WHERE processed_at IS NULL AND retry_count < 3;

ALTER TABLE email_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON email_send_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
