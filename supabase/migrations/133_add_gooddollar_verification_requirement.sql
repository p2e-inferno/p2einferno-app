-- Add requires_gooddollar_verification column to quests table
-- This column tracks whether a quest requires GoodDollar face verification before participation

ALTER TABLE public.quests
ADD COLUMN IF NOT EXISTS requires_gooddollar_verification BOOLEAN NOT NULL DEFAULT false;

-- Create index for queries filtering by verification requirement
CREATE INDEX IF NOT EXISTS idx_quests_requires_gooddollar_verification
ON public.quests(requires_gooddollar_verification)
WHERE requires_gooddollar_verification = true;
