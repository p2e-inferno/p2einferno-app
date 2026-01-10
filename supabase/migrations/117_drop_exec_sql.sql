-- Migration to drop the unused and high-risk exec_sql function
-- This function was identified as a security risk and is not used in the codebase.
-- It is being removed rather than secured.

DROP FUNCTION IF EXISTS public.exec_sql(text);
