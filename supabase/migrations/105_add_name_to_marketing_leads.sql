-- Add name column to marketing_leads to capture prospect names
ALTER TABLE public.marketing_leads
ADD COLUMN IF NOT EXISTS name TEXT;

-- Update the function to have a secure search path (addressing one of the warnings immediately related to this table)
CREATE OR REPLACE FUNCTION public.update_marketing_leads_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

