-- 148_harden_gooddollar_wallet_map_rls.sql
-- Security hardening for GoodDollar verified wallet map.
-- Keep this table server-only in PostgREST-exposed public schema.

ALTER TABLE public.gooddollar_verified_wallet_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gooddollar_verified_wallet_map FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gooddollar_verified_wallet_map FROM anon, authenticated;

-- Explicit policies for clarity and auditable intent.
CREATE POLICY gd_wallet_map_deny_anon
  ON public.gooddollar_verified_wallet_map
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY gd_wallet_map_deny_authenticated
  ON public.gooddollar_verified_wallet_map
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY gd_wallet_map_allow_service_role
  ON public.gooddollar_verified_wallet_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
