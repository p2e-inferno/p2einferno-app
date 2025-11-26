-- Add face verification columns to user_profiles table
-- These columns track the GoodDollar face verification status

-- is_face_verified: Boolean flag indicating if the user has successfully verified
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS is_face_verified BOOLEAN DEFAULT false;

-- face_verification_session: Stores the session ID or reference from the verification provider
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS face_verification_session TEXT;

-- face_verified_at: Timestamp of when the verification occurred
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS face_verified_at TIMESTAMPTZ;

-- gooddollar_whitelist_checked_at: Timestamp of last on-chain whitelist verification
-- Always verify on-chain status, not just client-side confirmation
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS gooddollar_whitelist_checked_at TIMESTAMPTZ;

-- face_verification_expiry: Timestamp when face verification expires (14-day period from GoodDollar)
-- Users must re-verify after this timestamp
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS face_verification_expiry TIMESTAMPTZ;

-- face_verification_proof_hash: Hash of verification response for audit trail and fraud detection
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS face_verification_proof_hash TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.user_profiles.is_face_verified IS 'GoodDollar face verification status. True if user has passed liveness check.';
COMMENT ON COLUMN public.user_profiles.face_verification_session IS 'Session identifier from the face verification provider (GoodDollar/FaceTec).';
COMMENT ON COLUMN public.user_profiles.face_verified_at IS 'Timestamp when the user last successfully verified their face.';
COMMENT ON COLUMN public.user_profiles.gooddollar_whitelist_checked_at IS 'Timestamp of last on-chain whitelist verification. Always verify on-chain status.';
COMMENT ON COLUMN public.user_profiles.face_verification_expiry IS 'Timestamp when face verification expires. Users must re-verify after this date (typically 14 days).';
COMMENT ON COLUMN public.user_profiles.face_verification_proof_hash IS 'Hash of verification provider response for audit trail and fraud detection.';

-- Create an index on is_face_verified for faster filtering of verified users
CREATE INDEX IF NOT EXISTS idx_user_profiles_face_verified
ON public.user_profiles(is_face_verified);

-- Create an index on wallet_address and is_face_verified for common lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet_verified
ON public.user_profiles(wallet_address, is_face_verified);

-- Create an index on face_verification_expiry to find users needing re-verification
CREATE INDEX IF NOT EXISTS idx_user_profiles_face_verification_expiry
ON public.user_profiles(face_verification_expiry);
