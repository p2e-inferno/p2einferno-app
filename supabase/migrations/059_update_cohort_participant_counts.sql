-- Update Cohort Participant Counts Migration
-- This migration fixes the current_participants field and adds automatic count updates

-- First, create function to update cohort participant count
CREATE OR REPLACE FUNCTION update_cohort_participant_count() RETURNS TRIGGER AS $$
BEGIN
    -- Handle INSERT - new enrollment
    IF TG_OP = 'INSERT' THEN
        -- Only count enrollments with 'enrolled' status
        IF NEW.enrollment_status = 'enrolled' THEN
            UPDATE cohorts 
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Handle DELETE - enrollment removed
    IF TG_OP = 'DELETE' THEN
        -- Only decrease count if the deleted enrollment was 'enrolled'
        IF OLD.enrollment_status = 'enrolled' THEN
            UPDATE cohorts 
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = OLD.cohort_id;
        END IF;
        RETURN OLD;
    END IF;

    -- Handle UPDATE - enrollment status change
    IF TG_OP = 'UPDATE' THEN
        -- If enrollment status changed from non-enrolled to enrolled
        IF OLD.enrollment_status != 'enrolled' AND NEW.enrollment_status = 'enrolled' THEN
            UPDATE cohorts 
            SET current_participants = current_participants + 1,
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        -- If enrollment status changed from enrolled to non-enrolled
        IF OLD.enrollment_status = 'enrolled' AND NEW.enrollment_status != 'enrolled' THEN
            UPDATE cohorts 
            SET current_participants = GREATEST(current_participants - 1, 0),
                updated_at = NOW()
            WHERE id = NEW.cohort_id;
        END IF;

        -- If cohort_id changed (enrollment moved to different cohort)
        IF OLD.cohort_id != NEW.cohort_id THEN
            -- Decrease count in old cohort (if was enrolled)
            IF OLD.enrollment_status = 'enrolled' THEN
                UPDATE cohorts 
                SET current_participants = GREATEST(current_participants - 1, 0),
                    updated_at = NOW()
                WHERE id = OLD.cohort_id;
            END IF;
            
            -- Increase count in new cohort (if is enrolled)
            IF NEW.enrollment_status = 'enrolled' THEN
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
-- Create trigger to automatically update participant counts
DROP TRIGGER IF EXISTS update_cohort_participants_on_enrollment_change ON bootcamp_enrollments;
CREATE TRIGGER update_cohort_participants_on_enrollment_change
    AFTER INSERT OR UPDATE OR DELETE ON bootcamp_enrollments
    FOR EACH ROW
    EXECUTE FUNCTION update_cohort_participant_count();
-- One-time fix: Update all existing cohort current_participants to actual counts
UPDATE cohorts 
SET current_participants = (
    SELECT COUNT(*) 
    FROM bootcamp_enrollments 
    WHERE cohort_id = cohorts.id 
    AND enrollment_status = 'enrolled'
),
updated_at = NOW();
-- Add helpful comment for future reference
COMMENT ON FUNCTION update_cohort_participant_count() IS 
'Automatically updates cohort current_participants count when bootcamp_enrollments change. Only counts enrollments with status = enrolled.';
COMMENT ON TRIGGER update_cohort_participants_on_enrollment_change ON bootcamp_enrollments IS 
'Maintains accurate current_participants count in cohorts table based on enrolled bootcamp_enrollments.';
