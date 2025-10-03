-- Revert text IDs back to uuid to align remote with local
-- Safe forward migration: drops dependent FKs, converts types, restores defaults and FKs

-- Drop dependent foreign keys if present
alter table if exists public.user_milestones drop constraint if exists user_milestones_milestone_id_fkey;
alter table if exists public.user_milestone_progress drop constraint if exists user_milestone_progress_milestone_id_fkey;
alter table if exists public.milestone_tasks drop constraint if exists milestone_tasks_milestone_id_fkey;
alter table if exists public.cohort_milestones drop constraint if exists cohort_milestones_prerequisite_milestone_id_fkey;
-- Convert milestone identifiers back to uuid
alter table if exists public.cohort_milestones
  alter column id set data type uuid using id::uuid,
  alter column prerequisite_milestone_id set data type uuid using prerequisite_milestone_id::uuid;
alter table if exists public.milestone_tasks
  alter column id set data type uuid using id::uuid,
  alter column id set default gen_random_uuid(),
  alter column milestone_id set data type uuid using milestone_id::uuid;
alter table if exists public.user_milestone_progress
  alter column milestone_id set data type uuid using milestone_id::uuid;
alter table if exists public.user_milestones
  alter column milestone_id set data type uuid using milestone_id::uuid;
-- Revert other ids that were switched to text by the pull
alter table if exists public.program_highlights
  alter column id set data type uuid using id::uuid,
  alter column id set default gen_random_uuid();
alter table if exists public.program_requirements
  alter column id set data type uuid using id::uuid,
  alter column id set default gen_random_uuid();
alter table if exists public.task_submissions
  alter column id set data type uuid using id::uuid,
  alter column id set default gen_random_uuid(),
  alter column task_id set data type uuid using task_id::uuid;
-- Restore foreign keys
alter table if exists public.cohort_milestones
  add constraint cohort_milestones_prerequisite_milestone_id_fkey foreign key (prerequisite_milestone_id) references public.cohort_milestones(id);
alter table if exists public.milestone_tasks
  add constraint milestone_tasks_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
alter table if exists public.user_milestones
  add constraint user_milestones_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
alter table if exists public.user_milestone_progress
  add constraint user_milestone_progress_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
