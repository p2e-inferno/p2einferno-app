-- Create table to capture marketing leads (starter kit, waitlists, etc.)
CREATE TABLE IF NOT EXISTS public.marketing_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    bootcamp_program_id TEXT NULL REFERENCES public.bootcamp_programs(id) ON DELETE SET NULL,
    cohort_id TEXT NULL REFERENCES public.cohorts(id) ON DELETE SET NULL,
    track_label TEXT NULL,
    intent TEXT NOT NULL, -- e.g., 'starter_kit', 'bootcamp_waitlist', 'track_waitlist'
    source TEXT NULL, -- e.g., 'homepage_hero', 'homepage_footer', 'cohort_page'
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Basic index for quick lookup by metadata fields
CREATE INDEX IF NOT EXISTS idx_marketing_leads_email ON public.marketing_leads(email);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_bootcamp ON public.marketing_leads(bootcamp_program_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_cohort ON public.marketing_leads(cohort_id);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_intent ON public.marketing_leads(intent);

-- RLS
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Only service role can insert/select/update/delete. Public UI will call
-- through an API route that uses the service role admin client.
CREATE POLICY "Service role can manage marketing leads" ON public.marketing_leads
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_marketing_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketing_leads_updated_at
    BEFORE UPDATE ON public.marketing_leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_marketing_leads_updated_at();
