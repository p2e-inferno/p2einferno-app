-- Fix: lock down search_path for trigger function to avoid role/session-dependent resolution.
-- This addresses lint: "Function Search Path Mutable".

ALTER FUNCTION public.update_user_journey_preferences_updated_at()
  SET search_path = pg_catalog, public;

-- Fix: lock down search_path for notification trigger function (lint: "Function Search Path Mutable").
ALTER FUNCTION public.notify_on_task_progress()
  SET search_path = pg_catalog, public;

-- Fix: lock down search_path for task submission review notification trigger (lint: "Function Search Path Mutable").
ALTER FUNCTION public.notify_on_task_submission_review()
  SET search_path = pg_catalog, public;

-- Fix: lock down search_path for task submissions trigger guard (lint: "Function Search Path Mutable").
ALTER FUNCTION public.check_single_submission_per_user_task()
  SET search_path = pg_catalog, public;
