-- Migration: Add paystack_reference column to payment_transactions table
-- Purpose: Store Paystack-generated reference for auditing and dispute resolution
-- Date: 2025-01-08

BEGIN;

-- Add paystack_reference column for auditing and dispute resolution
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS paystack_reference text;

-- Add index for efficient lookups during auditing/support queries
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paystack_reference 
ON payment_transactions(paystack_reference);

-- Add comment for documentation
COMMENT ON COLUMN payment_transactions.paystack_reference 
IS 'Paystack-generated reference (e.g., T990787264713537) for auditing and dispute resolution. Generated during payment processing, not initialization.';

COMMIT;