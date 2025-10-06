-- Remove cohort validation triggers that were too restrictive
-- Users should be able to register even after cohort starts, so we remove database-level validation
-- Form validation on the frontend is sufficient

DROP TRIGGER IF EXISTS validate_cohort_dates_insert ON public.cohorts;
DROP TRIGGER IF EXISTS validate_cohort_dates_update ON public.cohorts;
-- Remove the validation function as well since we don't need it anymore
DROP FUNCTION IF EXISTS validate_cohort_dates();
