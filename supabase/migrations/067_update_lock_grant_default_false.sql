-- 067_update_lock_grant_default_false.sql
-- Set default of lock_manager_granted to FALSE for future inserts
-- We do not modify existing row values to avoid unintended behavioral changes.

ALTER TABLE quests
  ALTER COLUMN lock_manager_granted SET DEFAULT false;

ALTER TABLE cohort_milestones
  ALTER COLUMN lock_manager_granted SET DEFAULT false;

ALTER TABLE cohorts
  ALTER COLUMN lock_manager_granted SET DEFAULT false;

ALTER TABLE bootcamp_programs
  ALTER COLUMN lock_manager_granted SET DEFAULT false;

