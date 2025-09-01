-- Fix relationship between user_task_completions and user_profiles
-- This migration establishes the proper foreign key relationship

-- Add foreign key constraint from user_task_completions.user_id to user_profiles.privy_user_id
ALTER TABLE public.user_task_completions 
ADD CONSTRAINT user_task_completions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.user_profiles(privy_user_id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_task_completions_user_id 
ON public.user_task_completions(user_id);