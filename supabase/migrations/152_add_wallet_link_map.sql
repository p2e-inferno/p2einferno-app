-- 152_add_wallet_link_map.sql
-- Immutable mapping between any wallet address and a Privy user (DID).
-- Purpose: prevent one wallet from being reused across multiple Privy accounts in this app.

CREATE TABLE IF NOT EXISTS public.wallet_link_map (
  wallet_address TEXT PRIMARY KEY,
  privy_user_id TEXT NOT NULL,
  first_linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_link_map_wallet_lowercase
    CHECK (wallet_address = LOWER(wallet_address))
);

CREATE INDEX IF NOT EXISTS idx_wallet_link_map_privy_user_id
  ON public.wallet_link_map (privy_user_id);

COMMENT ON TABLE public.wallet_link_map IS
  'Maps a wallet address to exactly one Privy user (DID) to prevent cross-account wallet reuse, even if unlinked in Privy.';

-- Keep updated_at consistent with existing patterns in this repo
-- (user_profiles uses update_updated_at_column()).
-- IMPORTANT: do not redefine update_updated_at_column() here.
-- This repo already defines it in an earlier migration (user_profiles schema).
-- Redefining it in a later migration risks unintended global behavior changes.

DROP TRIGGER IF EXISTS update_wallet_link_map_updated_at ON public.wallet_link_map;
CREATE TRIGGER update_wallet_link_map_updated_at
  BEFORE UPDATE ON public.wallet_link_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional backfill (safe, additive):
-- Claim current wallet_address from user_profiles if present.
-- Conflicts (same wallet already mapped) are ignored to avoid breaking deploy.
--
-- IMPORTANT:
-- - Do NOT backfill from user_profiles.linked_wallets here.
--   In this codebase, linked_wallets is synced from client-provided data in /api/user/profile
--   and is not trustworthy enough to “permanently claim” a wallet forever.
-- - Backfill should only use sources that were historically validated server-side.

-- Backfill from wallet_address
INSERT INTO public.wallet_link_map (wallet_address, privy_user_id, source)
SELECT
  LOWER(up.wallet_address) AS wallet_address,
  up.privy_user_id AS privy_user_id,
  'backfill:user_profiles.wallet_address' AS source
FROM public.user_profiles up
WHERE
  up.wallet_address IS NOT NULL
  AND up.wallet_address ~* '^0x[0-9a-f]{40}$'
ON CONFLICT (wallet_address) DO NOTHING;

-- RLS hardening: server-only table (mirror GoodDollar wallet map hardening).
-- Apply AFTER the optional backfill above to avoid any execution-context surprises.
ALTER TABLE public.wallet_link_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_link_map FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_link_map FROM anon, authenticated;

CREATE POLICY wallet_link_map_deny_anon
  ON public.wallet_link_map
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY wallet_link_map_deny_authenticated
  ON public.wallet_link_map
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY wallet_link_map_allow_service_role
  ON public.wallet_link_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
