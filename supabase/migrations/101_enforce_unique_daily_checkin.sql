-- 101_enforce_unique_daily_checkin.sql
-- Enforce uniqueness for daily check-ins per user_profile_id per calendar day
-- Implementation: partial unique index on (user_profile_id, DATE(created_at)) where activity_type='daily_checkin'

-- 1) Deduplicate any existing duplicate daily_checkin records to allow index creation.
--    Keep the earliest record per (user_profile_id, DATE(created_at)) and delete later ones.
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_profile_id, DATE(created_at)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.user_activities
  WHERE activity_type = 'daily_checkin'
)
DELETE FROM public.user_activities ua
USING duplicates d
WHERE ua.id = d.id
  AND d.rn > 1;

-- 2) Add a persisted helper column for the UTC calendar day of created_at
--    We avoid expression indexes on DATE(created_at) because that cast on timestamptz
--    is not immutable in Postgres. A stored column + trigger guarantees correctness.
ALTER TABLE public.user_activities
  ADD COLUMN IF NOT EXISTS checkin_day_utc DATE;

-- 3) Backfill the column for all existing rows
UPDATE public.user_activities
SET checkin_day_utc = (created_at AT TIME ZONE 'UTC')::date
WHERE checkin_day_utc IS NULL;

-- 4) Ensure the column remains accurate on new/updated rows via trigger
CREATE OR REPLACE FUNCTION public.user_activities_set_checkin_day_utc()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.checkin_day_utc := (NEW.created_at AT TIME ZONE 'UTC')::date;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_activities_set_checkin_day_utc ON public.user_activities;
CREATE TRIGGER trg_user_activities_set_checkin_day_utc
BEFORE INSERT OR UPDATE OF created_at ON public.user_activities
FOR EACH ROW
EXECUTE FUNCTION public.user_activities_set_checkin_day_utc();

-- 5) Enforce NOT NULL after backfill (safe because we filled it above)
ALTER TABLE public.user_activities
  ALTER COLUMN checkin_day_utc SET NOT NULL;

-- 6) Create the partial unique index using the persisted date column
CREATE UNIQUE INDEX IF NOT EXISTS user_activities_daily_checkin_unique_per_day
  ON public.user_activities (user_profile_id, checkin_day_utc)
  WHERE activity_type = 'daily_checkin';

COMMENT ON INDEX user_activities_daily_checkin_unique_per_day IS
  'Prevents more than one daily_checkin per user_profile_id per UTC calendar day.';
