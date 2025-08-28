-- Migration: Ensure blockchain fields exist on payment_transactions
-- Purpose: Fix runtime errors when selecting transaction_hash/network_chain_id
-- Safe to run multiple times

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'payment_transactions'
  ) THEN
    -- Add columns if missing
    BEGIN
      ALTER TABLE public.payment_transactions 
        ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
        ADD COLUMN IF NOT EXISTS key_token_id TEXT,
        ADD COLUMN IF NOT EXISTS network_chain_id BIGINT;
    EXCEPTION WHEN others THEN
      -- no-op to keep idempotent
      NULL;
    END;

    -- Indexes (conditional)
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_hash 
        ON public.payment_transactions(transaction_hash) 
        WHERE transaction_hash IS NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_network_chain_id 
        ON public.payment_transactions(network_chain_id) 
        WHERE network_chain_id IS NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;

    -- Constraints (add if not present)
    BEGIN
      ALTER TABLE public.payment_transactions 
      ADD CONSTRAINT payment_transactions_transaction_hash_format 
      CHECK (
        transaction_hash IS NULL OR 
        (transaction_hash ~ '^0x[a-fA-F0-9]{64}$')
      );
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END;

    BEGIN
      ALTER TABLE public.payment_transactions 
      ADD CONSTRAINT payment_transactions_valid_chain_id 
      CHECK (
        network_chain_id IS NULL OR 
        network_chain_id IN (1, 137, 8453, 84532, 42161, 10, 100, 56, 97, 43114, 80001)
      );
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END;

    -- Comments (optional)
    BEGIN
      COMMENT ON COLUMN public.payment_transactions.transaction_hash IS 'Blockchain transaction hash for crypto payments';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      COMMENT ON COLUMN public.payment_transactions.key_token_id IS 'NFT key token ID from Unlock Protocol';
    EXCEPTION WHEN others THEN NULL; END;
    BEGIN
      COMMENT ON COLUMN public.payment_transactions.network_chain_id IS 'Blockchain network chain ID (e.g., 8453 for Base, 84532 for Base Sepolia)';
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;


