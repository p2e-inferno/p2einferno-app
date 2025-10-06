-- Standardize milestone-related IDs to UUID using deterministic mapping (UUID v5)
-- This migration only updates cohort_milestones.id and dependent FKs in:
--   milestone_tasks.milestone_id, user_milestone_progress.milestone_id, user_milestones.milestone_id
-- It preserves relationships by mapping old text IDs to stable UUIDs.

-- Ensure required extension
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
-- Namespace UUID for deterministic mapping (constant)
-- Change only if you want a different mapping; must remain stable thereafter
-- Example fixed namespace: 4b3f1f17-6e2f-4c2a-9e83-6f0f9a3ef7f1

-- 1) Prepare mapping on cohort_milestones
alter table if exists public.cohort_milestones add column if not exists new_id uuid;
update public.cohort_milestones cm
set new_id = case
  when cm.new_id is not null then cm.new_id
  when (cm.id::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then cm.id::uuid
  else uuid_generate_v5('4b3f1f17-6e2f-4c2a-9e83-6f0f9a3ef7f1'::uuid, cm.id::text)
end
where cm.new_id is null;
-- 2) Add staging columns in dependent tables
alter table if exists public.milestone_tasks add column if not exists new_milestone_id uuid;
alter table if exists public.user_milestone_progress add column if not exists new_milestone_id uuid;
alter table if exists public.user_milestones add column if not exists new_milestone_id uuid;
alter table if exists public.user_task_progress add column if not exists new_milestone_id uuid;
-- 3) Populate staging columns by joining on old text IDs
update public.milestone_tasks mt
set new_milestone_id = cm.new_id
from public.cohort_milestones cm
where mt.new_milestone_id is null and (mt.milestone_id)::text = (cm.id)::text;
update public.user_milestone_progress ump
set new_milestone_id = cm.new_id
from public.cohort_milestones cm
where ump.new_milestone_id is null and (ump.milestone_id)::text = (cm.id)::text;
update public.user_milestones um
set new_milestone_id = cm.new_id
from public.cohort_milestones cm
where um.new_milestone_id is null and (um.milestone_id)::text = (cm.id)::text;
update public.user_task_progress utp
set new_milestone_id = cm.new_id
from public.cohort_milestones cm
where utp.new_milestone_id is null and (utp.milestone_id)::text = (cm.id)::text;
-- 4) Drop dependent foreign keys (if present)
alter table if exists public.milestone_tasks drop constraint if exists milestone_tasks_milestone_id_fkey;
alter table if exists public.user_milestone_progress drop constraint if exists user_milestone_progress_milestone_id_fkey;
alter table if exists public.user_milestones drop constraint if exists user_milestones_milestone_id_fkey;
alter table if exists public.user_task_progress drop constraint if exists user_task_progress_milestone_id_fkey;
alter table if exists public.cohort_milestones drop constraint if exists cohort_milestones_prerequisite_milestone_id_fkey;
-- 5) Swap columns in cohort_milestones
alter table if exists public.cohort_milestones drop constraint if exists cohort_milestones_pkey;
alter table if exists public.cohort_milestones add column if not exists old_id_text text;
update public.cohort_milestones set old_id_text = id where old_id_text is null;
alter table if exists public.cohort_milestones alter column id drop default;
-- rename id -> id_old, new_id -> id
alter table if exists public.cohort_milestones rename column id to id_old;
alter table if exists public.cohort_milestones rename column new_id to id;
alter table if exists public.cohort_milestones add primary key (id);
alter table if exists public.cohort_milestones alter column id set default gen_random_uuid();
-- 6) Remap self-reference prerequisite_milestone_id
alter table if exists public.cohort_milestones add column if not exists new_prerequisite_milestone_id uuid;
update public.cohort_milestones cm
set new_prerequisite_milestone_id = cm2.id
from public.cohort_milestones cm2
where cm.new_prerequisite_milestone_id is null and (cm.prerequisite_milestone_id)::text = (cm2.id_old)::text;
alter table if exists public.cohort_milestones drop column if exists prerequisite_milestone_id;
alter table if exists public.cohort_milestones rename column new_prerequisite_milestone_id to prerequisite_milestone_id;
alter table if exists public.cohort_milestones add constraint cohort_milestones_prerequisite_milestone_id_fkey foreign key (prerequisite_milestone_id) references public.cohort_milestones(id);
-- 7) Swap columns in dependent tables and restore FKs
alter table if exists public.milestone_tasks drop column if exists milestone_id;
alter table if exists public.milestone_tasks rename column new_milestone_id to milestone_id;
alter table if exists public.milestone_tasks add constraint milestone_tasks_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
alter table if exists public.user_milestone_progress drop column if exists milestone_id;
alter table if exists public.user_milestone_progress rename column new_milestone_id to milestone_id;
alter table if exists public.user_milestone_progress add constraint user_milestone_progress_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
alter table if exists public.user_milestones drop column if exists milestone_id;
alter table if exists public.user_milestones rename column new_milestone_id to milestone_id;
alter table if exists public.user_milestones add constraint user_milestones_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
alter table if exists public.user_task_progress drop column if exists milestone_id;
alter table if exists public.user_task_progress rename column new_milestone_id to milestone_id;
alter table if exists public.user_task_progress add constraint user_task_progress_milestone_id_fkey foreign key (milestone_id) references public.cohort_milestones(id);
-- 8) Clean up legacy column holder
alter table if exists public.cohort_milestones drop column if exists id_old;
