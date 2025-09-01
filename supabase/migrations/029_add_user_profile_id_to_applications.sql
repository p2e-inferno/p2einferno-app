-- Add user_profile_id foreign key to applications table for direct relationship
-- This eliminates the need for email-based lookups which are unreliable

-- 1. Add the column (nullable initially to allow backfilling)
ALTER TABLE public.applications 
ADD COLUMN user_profile_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE;

-- 2. Backfill existing applications by matching email to user_profiles
UPDATE public.applications 
SET user_profile_id = (
  SELECT up.id 
  FROM public.user_profiles up 
  WHERE up.email = applications.user_email 
  LIMIT 1
)
WHERE user_profile_id IS NULL;

-- 3. Create index for the new foreign key
CREATE INDEX idx_applications_user_profile_id ON public.applications(user_profile_id);

-- 4. Update RLS policies to use the direct relationship
-- Drop old policy that might conflict
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;

-- Create new policy using direct user_profile_id relationship
CREATE POLICY "Users can view their own applications" ON public.applications
  FOR SELECT USING (
    auth.uid() IN (
      SELECT privy_user_id::uuid FROM public.user_profiles 
      WHERE id = applications.user_profile_id
    )
  );

-- Service role can manage all applications
CREATE POLICY "Service role can manage applications" ON public.applications
  FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;