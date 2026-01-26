-- Store on-chain grant metadata for quest completion claims.
-- Used to harden delegated attestation flows and support future integrity checks.

alter table public.user_quest_progress
  add column if not exists key_claim_tx_hash text,
  add column if not exists key_claim_token_id numeric;

create index if not exists user_quest_progress_key_claim_tx_hash_idx
  on public.user_quest_progress (key_claim_tx_hash);

create index if not exists user_quest_progress_key_claim_token_id_idx
  on public.user_quest_progress (key_claim_token_id);

