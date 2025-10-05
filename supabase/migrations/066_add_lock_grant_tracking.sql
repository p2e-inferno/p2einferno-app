-- Migration: Add lock manager grant tracking to entities with locks
-- Description: Track whether the server wallet was successfully granted lock manager role
--              This allows retry functionality when the grant transaction fails during deployment

-- Add Lock Manager grant tracking columns to quests table
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS lock_manager_granted BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS grant_failure_reason TEXT;

-- Add Lock Manager grant tracking columns to cohort_milestones table
ALTER TABLE cohort_milestones
ADD COLUMN IF NOT EXISTS lock_manager_granted BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS grant_failure_reason TEXT;

-- Add Lock Manager grant tracking columns to cohorts table
ALTER TABLE cohorts
ADD COLUMN IF NOT EXISTS lock_manager_granted BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS grant_failure_reason TEXT;

-- Add Lock Manager grant tracking columns to bootcamp_programs table
ALTER TABLE bootcamp_programs
ADD COLUMN IF NOT EXISTS lock_manager_granted BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS grant_failure_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN quests.lock_manager_granted IS 'Whether the server wallet was successfully granted lock manager role for this quest lock';
COMMENT ON COLUMN quests.grant_failure_reason IS 'Error message if the lock manager grant transaction failed';

COMMENT ON COLUMN cohort_milestones.lock_manager_granted IS 'Whether the server wallet was successfully granted lock manager role for this milestone lock';
COMMENT ON COLUMN cohort_milestones.grant_failure_reason IS 'Error message if the lock manager grant transaction failed';

COMMENT ON COLUMN cohorts.lock_manager_granted IS 'Whether the server wallet was successfully granted lock manager role for this cohort lock';
COMMENT ON COLUMN cohorts.grant_failure_reason IS 'Error message if the lock manager grant transaction failed';

COMMENT ON COLUMN bootcamp_programs.lock_manager_granted IS 'Whether the server wallet was successfully granted lock manager role for this bootcamp lock';
COMMENT ON COLUMN bootcamp_programs.grant_failure_reason IS 'Error message if the lock manager grant transaction failed';
