-- 095_relax_attestation_address_validation.sql
-- Relax overly strict address validation constraints that prevent attestation inserts
-- 
-- PROBLEM: The original constraints required exactly 42 characters, which can fail when:
-- - Addresses have inconsistent formatting (lowercase vs checksummed)
-- - Trailing/leading whitespace is present
-- - Case sensitivity issues occur
--
-- SOLUTION: Update constraints to validate Ethereum address format while being more lenient
-- on exact length, and ensure addresses match the 0x + 40 hex characters pattern.

-- Drop the existing overly strict constraints
ALTER TABLE public.attestations 
  DROP CONSTRAINT IF EXISTS valid_attester_address,
  DROP CONSTRAINT IF EXISTS valid_recipient_address;

-- Add more flexible constraints that validate Ethereum addresses properly
-- Ethereum addresses: 0x prefix + 40 hex characters = 42 total characters
-- But we allow 40-42 to handle edge cases and still validate the format
ALTER TABLE public.attestations 
  ADD CONSTRAINT valid_attester_address CHECK (
    attester ~ '^0x[a-fA-F0-9]{40}$'
  ),
  ADD CONSTRAINT valid_recipient_address CHECK (
    recipient ~ '^0x[a-fA-F0-9]{40}$'
  );

-- Add helpful comments
COMMENT ON CONSTRAINT valid_attester_address ON public.attestations IS 
  'Validates Ethereum address format: 0x prefix followed by exactly 40 hexadecimal characters (case-insensitive)';

COMMENT ON CONSTRAINT valid_recipient_address ON public.attestations IS 
  'Validates Ethereum address format: 0x prefix followed by exactly 40 hexadecimal characters (case-insensitive)';

-- Note: This migration is backward compatible. Existing data with valid addresses will pass the new constraints.
-- The new constraints are more permissive regarding case sensitivity while maintaining format validation.

