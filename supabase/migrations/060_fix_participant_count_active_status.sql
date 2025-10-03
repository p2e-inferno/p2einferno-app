-- Fix Cohort Participant Counts - Correct Status Migration
-- Fixes the previous migration to use 'active' enrollment status instead of 'enrolled'

-- Drop the old trigger and function first
DROP TRIGGER IF EXISTS update_cohort_participants_on_enrollment_change ON bootcamp_enrollments;
DROP FUNCTION IF EXISTS update_cohort_participant_count();
-- Create corrected function to update cohort participant count using 'active' status
CREATE OR REPLACE FUNCTION update_cohort_participant_count() RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT - new enrollment
    IF TG_OP = 'INSERT' THEN
        -- Count enrollments with 'active' status (the actual status used in the system)
        IF NEW.enrollment_status = 'active' THEN
            UPDATE cohorts 
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Handle DELETE - enrollment removed
    IF TG_OP = 'DELETE' THEN
        -- Only decrease count if the deleted enrollment was 'active'
        IF OLD.enrollment_status = 'active' THEN
            UPDATE cohorts 
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = OLD.cohort_id;
        END IF;
        RETURN OLD;
    END IF;

    -- Handle UPDATE - enrollment status change
    IF TG_OP = 'UPDATE' THEN
        -- If enrollment status changed from non-active to active
        IF OLD.enrollment_status != 'active' AND NEW.enrollment_status = 'active' THEN
            UPDATE cohorts 
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        -- If enrollment status changed from active to non-active
        IF OLD.enrollment_status = 'active' AND NEW.enrollment_status != 'active' THEN
            UPDATE cohorts 
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        -- If cohort_id changed (enrollment moved to different cohort)
        IF OLD.cohort_id != NEW.cohort_id THEN
            -- Decrease count in old cohort (if was active)
            IF OLD.enrollment_status = 'active' THEN
                UPDATE cohorts 
                SET current_participants = GREATEST(current_participants - 1, 0),
                    updated_at = NOW()
                WHERE id = OLD.cohort_id;
            END IF;
            
            -- Increase count in new cohort (if is active)
            IF NEW.enrollment_status = 'active' THEN
                UPDATE cohorts 
                SET current_participants = current_participants + 1,
                    updated_at = NOW()
                WHERE id = NEW.cohort_id;
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
-- Create corrected trigger to automatically update participant counts
CREATE TRIGGER update_cohort_participants_on_enrollment_change
    AFTER INSERT OR UPDATE OR DELETE ON bootcamp_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_cohort_participant_count();
-- Corrected one-time fix: Update all existing cohort current_participants to actual counts using 'active' status
UPDATE cohorts 
SET current_participants = (
    SELECT COUNT(*) 
    FROM bootcamp_enrollments 
    WHERE cohort_id = cohorts.id 
    AND enrollment_status = 'active'
),
updated_at = NOW();
-- Update helpful comments for future reference
COMMENT ON FUNCTION update_cohort_participant_count() IS 
'Automatically updates cohort current_participants count when bootcamp_enrollments change. Only counts enrollments with status = active (corrected from enrolled).';
COMMENT ON TRIGGER update_cohort_participants_on_enrollment_change ON bootcamp_enrollments IS 
'Maintains accurate current_participants count in cohorts table based on active bootcamp_enrollments (corrected version).';
