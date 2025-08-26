-- Add blockchain payment fields to payment_transactions table
-- Migration: 023_add_blockchain_payment_fields.sql

-- Check if payment_transactions table exists before modifying
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_transactions' AND table_schema = 'public') THEN
    -- Add blockchain-specific columns to payment_transactions
    ALTER TABLE public.payment_transactions 
    ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
    ADD COLUMN IF NOT EXISTS key_token_id TEXT,
    ADD COLUMN IF NOT EXISTS network_chain_id BIGINT;

    -- Add indexes for blockchain fields
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_transaction_hash 
      ON public.payment_transactions(transaction_hash) 
      WHERE transaction_hash IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_payment_transactions_network_chain_id 
      ON public.payment_transactions(network_chain_id) 
      WHERE network_chain_id IS NOT NULL;

    -- Add comments for documentation
    COMMENT ON COLUMN public.payment_transactions.transaction_hash IS 'Blockchain transaction hash for crypto payments';
    COMMENT ON COLUMN public.payment_transactions.key_token_id IS 'NFT key token ID from Unlock Protocol';
    COMMENT ON COLUMN public.payment_transactions.network_chain_id IS 'Blockchain network chain ID (e.g., 8453 for Base, 84532 for Base Sepolia)';

    -- Update the status check constraint to be more flexible for blockchain payments
    -- Only drop and recreate if constraint exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'payment_transactions_status_check' 
               AND table_name = 'payment_transactions') THEN
      ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_status_check;
    END IF;

    ALTER TABLE public.payment_transactions 
    ADD CONSTRAINT payment_transactions_status_check 
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'abandoned'));

    -- Add a check constraint for blockchain payments
    -- If transaction_hash is present, it should be a valid hex string
    ALTER TABLE public.payment_transactions 
    ADD CONSTRAINT payment_transactions_transaction_hash_format 
    CHECK (
      transaction_hash IS NULL OR 
      (transaction_hash ~ '^0x[a-fA-F0-9]{64}$')
    );

    -- Add a check constraint for valid chain IDs (common blockchain networks)
    ALTER TABLE public.payment_transactions 
    ADD CONSTRAINT payment_transactions_valid_chain_id 
    CHECK (
      network_chain_id IS NULL OR 
      network_chain_id IN (1, 137, 8453, 84532, 42161, 10, 100, 56, 97, 43114, 80001)
    );

    -- Add comment about supported chain IDs
    COMMENT ON CONSTRAINT payment_transactions_valid_chain_id ON public.payment_transactions IS 
      'Supported chain IDs: 1=Ethereum, 137=Polygon, 8453=Base, 84532=Base Sepolia, 42161=Arbitrum, 10=Optimism, 100=Gnosis, 56=BSC, 97=BSC Testnet, 43114=Avalanche, 80001=Polygon Mumbai';
  
  END IF;
END $$; 