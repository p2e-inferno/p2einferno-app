CREATE TABLE IF NOT EXISTS public.admin_action_nonces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

ALTER TABLE public.admin_action_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage admin action nonces"
  ON public.admin_action_nonces
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_admin_action_nonces_wallet
  ON public.admin_action_nonces(wallet_address);

CREATE INDEX IF NOT EXISTS idx_admin_action_nonces_expires_at
  ON public.admin_action_nonces(expires_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_action_nonces_unique'
  ) THEN
    ALTER TABLE public.admin_action_nonces
      ADD CONSTRAINT admin_action_nonces_unique
      UNIQUE (wallet_address, action_hash, nonce);
  END IF;
END $$;

COMMENT ON TABLE public.admin_action_nonces IS 'Replay protection for admin signed actions';
COMMENT ON COLUMN public.admin_action_nonces.expires_at IS 'Expiration time for nonce replay window';
