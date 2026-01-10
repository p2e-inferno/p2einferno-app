-- Add network and schema_key to attestation_schemas
ALTER TABLE public.attestation_schemas
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'base-sepolia',
  ADD COLUMN IF NOT EXISTS schema_key TEXT;

-- Add network to attestations
ALTER TABLE public.attestations
  ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'base-sepolia';

-- Backfill attestation networks from schemas (best effort)
UPDATE public.attestations AS a
SET network = s.network
FROM public.attestation_schemas AS s
WHERE a.schema_uid = s.schema_uid;

-- Backfill schema_key for predefined schemas
UPDATE public.attestation_schemas
SET schema_key = CASE schema_uid
  WHEN '0xp2e_daily_checkin_001' THEN 'daily_checkin'
  WHEN '0xp2e_quest_completion_001' THEN 'quest_completion'
  WHEN '0xp2e_bootcamp_completion_001' THEN 'bootcamp_completion'
  WHEN '0xp2e_milestone_achievement_001' THEN 'milestone_achievement'
  ELSE schema_key
END
WHERE schema_key IS NULL;

-- Indexes for network filtering
CREATE INDEX IF NOT EXISTS idx_attestation_schemas_network
  ON public.attestation_schemas(network);

CREATE INDEX IF NOT EXISTS idx_attestations_network
  ON public.attestations(network);

-- Composite uniqueness (keep existing unique constraint on schema_uid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attestation_schemas_schema_uid_network_key'
  ) THEN
    ALTER TABLE public.attestation_schemas
      ADD CONSTRAINT attestation_schemas_schema_uid_network_key
      UNIQUE (schema_uid, network);
  END IF;
END $$;

-- Composite FK (NOT VALID), validate after backfill
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attestations_schema_uid_network_fkey'
  ) THEN
    ALTER TABLE public.attestations
      ADD CONSTRAINT attestations_schema_uid_network_fkey
      FOREIGN KEY (schema_uid, network)
      REFERENCES public.attestation_schemas(schema_uid, network)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.attestations
  VALIDATE CONSTRAINT attestations_schema_uid_network_fkey;

COMMENT ON COLUMN public.attestation_schemas.network IS 'Blockchain network where schema is deployed';
COMMENT ON COLUMN public.attestation_schemas.schema_key IS 'Logical schema identifier for network-aware lookup';
COMMENT ON COLUMN public.attestations.network IS 'Blockchain network where attestation was issued';
