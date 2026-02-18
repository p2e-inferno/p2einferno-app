-- 147_add_gooddollar_verified_wallet_map.sql
-- Immutable mapping between a GoodDollar-verified wallet and a Privy user.
-- This prevents reusing one verified wallet across multiple app accounts.

CREATE TABLE IF NOT EXISTS public.gooddollar_verified_wallet_map (
  wallet_address TEXT PRIMARY KEY,
  privy_user_id TEXT NOT NULL UNIQUE,
  first_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proof_hash TEXT,
  source TEXT NOT NULL DEFAULT 'callback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gooddollar_verified_wallet_map_wallet_lowercase
    CHECK (wallet_address = LOWER(wallet_address))
);

CREATE INDEX IF NOT EXISTS idx_gooddollar_verified_wallet_map_privy_user_id
  ON public.gooddollar_verified_wallet_map (privy_user_id);

COMMENT ON TABLE public.gooddollar_verified_wallet_map IS
  'Maps a verified wallet address to exactly one Privy user to prevent cross-account wallet reuse.';
