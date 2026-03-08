-- Add attestation UID storage for daily quest completion key claims.
-- Enables commit-attest parity with normal quest key claims.

ALTER TABLE public.user_daily_quest_progress
  ADD COLUMN IF NOT EXISTS key_claim_attestation_uid TEXT;

COMMENT ON COLUMN public.user_daily_quest_progress.key_claim_attestation_uid IS
  'EAS attestation UID (bytes32) for daily quest KEY claim records.';

CREATE INDEX IF NOT EXISTS idx_user_daily_quest_progress_key_claim_attestation_uid
  ON public.user_daily_quest_progress(key_claim_attestation_uid)
  WHERE key_claim_attestation_uid IS NOT NULL;

