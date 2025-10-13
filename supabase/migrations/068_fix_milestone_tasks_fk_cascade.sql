-- Fix missing ON DELETE CASCADE on milestone_tasks foreign key
-- Migrations 055 and 056 recreated the FK without cascade when converting text IDs to UUIDs

-- Drop the existing constraint without cascade
ALTER TABLE IF EXISTS public.milestone_tasks
  DROP CONSTRAINT IF EXISTS milestone_tasks_milestone_id_fkey;

-- Recreate with ON DELETE CASCADE to auto-delete tasks when milestone is deleted
ALTER TABLE IF EXISTS public.milestone_tasks
  ADD CONSTRAINT milestone_tasks_milestone_id_fkey
  FOREIGN KEY (milestone_id)
  REFERENCES public.cohort_milestones(id)
  ON DELETE CASCADE;
