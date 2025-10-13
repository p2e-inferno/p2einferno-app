-- Fix type mismatch in check_lock_address_uniqueness function
-- Issue: Comparing TEXT entity_id with UUID NEW.id causes operator error
-- Solution: Cast both to TEXT for comparison

CREATE OR REPLACE FUNCTION check_lock_address_uniqueness()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM lock_registry
        WHERE lock_address = NEW.lock_address
        AND entity_type = TG_TABLE_NAME
        AND entity_id::text != NEW.id::text
    ) THEN
        RAISE EXCEPTION 'Lock address % is already in use by another entity', NEW.lock_address;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add security comment
COMMENT ON FUNCTION check_lock_address_uniqueness IS 'Secured with fixed search_path per Supabase advisory 0011. Fixed type casting for entity_id comparison.';
