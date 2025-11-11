-- 103_enforce_unique_email_and_wallet.sql
-- Enforce uniqueness for email and wallet_address columns in user_profiles
-- Uses partial unique indexes to allow NULL values while preventing duplicate non-NULL values
-- Uses case-insensitive matching for both email and wallet_address

-- ============================================================================
-- Step 1: Resolve existing duplicates
-- Strategy: Keep the oldest profile (earliest created_at), clear email/wallet from newer duplicates
-- ============================================================================

-- Resolve duplicate emails: keep oldest profile, clear email from newer ones
WITH duplicate_emails AS (
  SELECT 
    id,
    email,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email) 
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_profiles
  WHERE email IS NOT NULL
)
UPDATE public.user_profiles up
SET 
  email = NULL,
  updated_at = NOW()
FROM duplicate_emails de
WHERE up.id = de.id
  AND de.rn > 1;

-- Resolve duplicate wallet addresses: keep oldest profile, clear wallet from newer ones
WITH duplicate_wallets AS (
  SELECT 
    id,
    wallet_address,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(wallet_address) 
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_profiles
  WHERE wallet_address IS NOT NULL
)
UPDATE public.user_profiles up
SET 
  wallet_address = NULL,
  updated_at = NOW()
FROM duplicate_wallets dw
WHERE up.id = dw.id
  AND dw.rn > 1;

-- ============================================================================
-- Step 2: Create partial unique indexes (case-insensitive)
-- ============================================================================

-- Unique index for email (case-insensitive, allows NULL)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_unique
  ON public.user_profiles (LOWER(email))
  WHERE email IS NOT NULL;

COMMENT ON INDEX user_profiles_email_unique IS
  'Ensures email uniqueness (case-insensitive). Allows multiple NULL values but prevents duplicate non-NULL emails.';

-- Unique index for wallet_address (case-insensitive, allows NULL)
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_wallet_address_unique
  ON public.user_profiles (LOWER(wallet_address))
  WHERE wallet_address IS NOT NULL;

COMMENT ON INDEX user_profiles_wallet_address_unique IS
  'Ensures wallet_address uniqueness (case-insensitive). Allows multiple NULL values but prevents duplicate non-NULL wallet addresses.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Both email and wallet_address now have unique constraints (case-insensitive)
-- NULL values are allowed (multiple profiles can have NULL email/wallet)
-- Non-NULL values must be unique across all profiles

