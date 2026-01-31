-- Add milestone key claim metadata for attestation verification
ALTER TABLE public.user_milestone_progress
  ADD COLUMN IF NOT EXISTS key_claim_tx_hash text,
  ADD COLUMN IF NOT EXISTS key_claim_token_id numeric;

CREATE INDEX IF NOT EXISTS user_milestone_progress_key_claim_tx_hash_idx
  ON public.user_milestone_progress (key_claim_tx_hash);

CREATE INDEX IF NOT EXISTS user_milestone_progress_key_claim_token_id_idx
  ON public.user_milestone_progress (key_claim_token_id);
