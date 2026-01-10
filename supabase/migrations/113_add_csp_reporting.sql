-- CSP reporting storage and rate limiting

CREATE TABLE IF NOT EXISTS public.csp_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  document_uri text NOT NULL,
  violated_directive text NOT NULL,
  blocked_uri text,
  source_file text,
  line_number integer,
  column_number integer,
  status_code integer,
  raw_report jsonb
);

CREATE TABLE IF NOT EXISTS public.csp_rate_limits (
  ip text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csp_reports_received_at
  ON public.csp_reports(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_csp_reports_directive
  ON public.csp_reports(violated_directive);
CREATE INDEX IF NOT EXISTS idx_csp_reports_document_uri
  ON public.csp_reports(document_uri);

CREATE OR REPLACE FUNCTION public.check_and_increment_csp_rate_limit(
  p_ip text,
  p_window_seconds integer,
  p_max integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
BEGIN
  INSERT INTO public.csp_rate_limits (ip, window_start, count)
  VALUES (p_ip, v_now, 1)
  ON CONFLICT (ip)
  DO UPDATE SET
    window_start = CASE
      WHEN public.csp_rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now
        THEN v_now
      ELSE public.csp_rate_limits.window_start
    END,
    count = CASE
      WHEN public.csp_rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now
        THEN 1
      ELSE public.csp_rate_limits.count + 1
    END
  RETURNING window_start, count INTO v_window_start, v_count;

  IF v_count > p_max THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_csp_rate_limit(text, integer, integer)
  TO service_role;

ALTER TABLE public.csp_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csp_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON public.csp_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only"
  ON public.csp_rate_limits
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
