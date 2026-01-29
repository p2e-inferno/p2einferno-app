-- 140_relax_schema_uniqueness.sql
-- Relax schema UID uniqueness to allow the same UID across different networks.
-- This is necessary because EAS Schema UIDs are deterministic based on definition.
-- Migration 119 added composite constraints (schema_uid, network), so we can now
-- safely remove the legacy single-column constraints.

-- Safety check: Ensure the new composite constraints exist before we drop the old ones
DO $$
BEGIN
  -- Verify composite unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'attestation_schemas_schema_uid_network_key'
    AND conrelid = 'public.attestation_schemas'::regclass
  ) THEN
    RAISE EXCEPTION 'Migration 119 composite unique constraint not found. Cannot proceed safely.';
  END IF;
  
  -- Verify composite FK exists and is validated
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'attestations_schema_uid_network_fkey'
    AND conrelid = 'public.attestations'::regclass
    AND convalidated = true
  ) THEN
    RAISE EXCEPTION 'Migration 119 composite FK not found or not validated. Cannot proceed safely.';
  END IF;
END $$;

-- 1. Drop the legacy single-column foreign key FIRST (since it depends on the unique constraint)
-- This FK was created in migration 062 via: schema_uid TEXT NOT NULL REFERENCES public.attestation_schemas(schema_uid)
ALTER TABLE public.attestations 
  DROP CONSTRAINT IF EXISTS attestations_schema_uid_fkey;

-- 2. Now we can drop the legacy single-column unique constraint
-- This constraint was created in migration 062 via: schema_uid TEXT NOT NULL UNIQUE
-- After this, uniqueness is enforced only by the composite (schema_uid, network) constraint from migration 119
ALTER TABLE public.attestation_schemas 
  DROP CONSTRAINT IF EXISTS attestation_schemas_schema_uid_key;

COMMENT ON TABLE public.attestation_schemas IS 
  'EAS schemas registered for the application. Uniqueness is enforced per (schema_uid, network). Same schema UID can exist on multiple networks.';
