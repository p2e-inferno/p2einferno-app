CREATE TABLE IF NOT EXISTS public.eas_schema_keys (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_schema_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view eas schema keys"
  ON public.eas_schema_keys
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage eas schema keys"
  ON public.eas_schema_keys
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_eas_schema_keys_updated_at
  BEFORE UPDATE ON public.eas_schema_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.eas_schema_keys (key, label, description, active) VALUES
  ('daily_checkin', 'Daily Check-in', 'Daily check-in attestations', true),
  ('quest_completion', 'Quest Completion', 'Quest completion attestations', true),
  ('bootcamp_completion', 'Bootcamp Completion', 'Bootcamp completion attestations', true),
  ('milestone_achievement', 'Milestone Achievement', 'Milestone achievement attestations', true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  active = EXCLUDED.active,
  updated_at = now();

INSERT INTO public.eas_schema_keys (key, label, active)
SELECT DISTINCT schema_key, schema_key, true
FROM public.attestation_schemas
WHERE schema_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.eas_schema_keys k
    WHERE k.key = public.attestation_schemas.schema_key
  );

CREATE INDEX IF NOT EXISTS idx_attestation_schemas_schema_key_network_created_at
  ON public.attestation_schemas(schema_key, network, created_at DESC)
  WHERE schema_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attestation_schemas_schema_key_fkey'
  ) THEN
    ALTER TABLE public.attestation_schemas
      ADD CONSTRAINT attestation_schemas_schema_key_fkey
      FOREIGN KEY (schema_key)
      REFERENCES public.eas_schema_keys(key)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END$$;

ALTER TABLE public.attestation_schemas
  VALIDATE CONSTRAINT attestation_schemas_schema_key_fkey;

COMMENT ON TABLE public.eas_schema_keys IS 'Canonical schema keys for EAS schema management';
COMMENT ON COLUMN public.eas_schema_keys.key IS 'Normalized schema key (snake_case)';
COMMENT ON COLUMN public.eas_schema_keys.active IS 'Controls whether the key can be used for new deployments';
