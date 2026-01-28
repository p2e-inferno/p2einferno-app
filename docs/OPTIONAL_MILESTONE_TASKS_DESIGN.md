# Optional Milestone Tasks — Design & Implementation Plan

Author: Codex  
Status: Proposal (for review/approval)  
Last updated: 2026-01-27

## 1) Problem Statement

Milestones are currently considered complete only when **all** tasks in `public.milestone_tasks` for a milestone are completed by a user. This is enforced at the database layer via `public.update_user_milestone_progress()` and triggers that maintain `public.user_milestone_progress` based on `public.user_task_progress`.

We want to support **optional (bonus) milestone tasks** that:

1. Appear in the UI and can be completed/submitted like normal tasks.
2. Can award rewards (xDG) like normal tasks.
3. **Do not block milestone completion or milestone key claiming**.
4. Display a simple “Optional” badge in the UI (no complex UX).

Today, “optional” can only be represented as text in `submission_requirements`, which has **no effect** on completion logic.

## 2) Current Behavior (Codebase Reality Check)

### Completion logic is DB-triggered and counts all tasks

The current milestone completion model is computed in Postgres:

- `public.update_task_progress_on_submission()` maps `task_submissions.status` → `user_task_progress.status`
- `public.update_user_milestone_progress()` calculates:
  - `total_tasks_count = COUNT(*) FROM milestone_tasks WHERE milestone_id = …`
  - `completed_tasks_count = COUNT(*) FROM user_task_progress WHERE milestone_id = … AND status='completed'`
  - milestone status becomes `completed` only if `completed_tasks_count = total_tasks_count` (and `total_tasks_count > 0`)

Important: The “latest” canonical function definition is recreated in later migrations:

- `supabase/migrations/079_secure_milestone_progress_triggers.sql`
- `supabase/migrations/099_recreate_milestone_progress_triggers.sql`

Therefore, **we must not edit old migrations** like `045_add_milestone_progress_triggers.sql` and expect production behavior to change. We must ship a **new migration** that:

1. Adds an optionality flag to `milestone_tasks`
2. Replaces the latest `public.update_user_milestone_progress()` with optional-aware semantics

### UI / API coupling

- User-facing milestone data is served from `pages/api/user/cohort/[cohortId]/milestones.ts`, which explicitly selects task columns from `milestone_tasks`. Any new column must be added there or it won’t appear in the lobby UI.
- Task submission modal displays `submission_requirements` JSON (informational only). It does not affect completion logic.

## 3) Design Goals & Non-Goals

### Goals

- **True optional tasks**: required tasks determine milestone completion; optional tasks do not.
- Minimal UI changes: a simple “Optional” badge.
- Maintain current workflow: tasks still require admin review if configured; claims remain per-task.
- Avoid regressions in milestones without optional tasks.
- Ensure determinism and data integrity: completion should always be derived from authoritative DB state.

### Non-Goals

- No multi-tier completion states (“completed-with-bonus”, etc.) in this phase.
- No major UX redesign for milestones/tasks.
- No changes to auth/session middleware for admin APIs.

## 4) Proposed Data Model

### Add `milestone_tasks.is_optional`

Add a boolean column:

- `is_optional BOOLEAN NOT NULL DEFAULT FALSE`

This lives on the task record (not submission/progress), so optionality is consistent across all users.

Rationale:

- Optionality is part of curriculum design, not user state.
- A schema-level field enables safe filtering in triggers and consistent exposure in APIs.

## 5) Core Logic Change (Database)

### 5.1 Optional-aware milestone completion

We will update `public.update_user_milestone_progress()` to calculate milestone status using **required tasks only**:

- `total_tasks_count` counts tasks where `is_optional = FALSE`
- `completed_tasks_count` counts completed task progress for tasks where `is_optional = FALSE`
  - This requires a join `user_task_progress → milestone_tasks` because `user_task_progress` does not carry `is_optional`.

Rewards:

- `reward_amount` in `user_milestone_progress` is currently computed as sum of rewards for **completed tasks** (all tasks).
- We must decide semantics:
  - **Option A (recommended):** keep `reward_amount` as “total earned so far (required + optional)” since it reflects reality.
  - Completion gating remains required-only.

### 5.2 Recalculation when optionality changes (important)

Today, progress recomputation triggers fire on `user_task_progress` changes, not on `milestone_tasks` changes. Introducing `is_optional` creates a common workflow: admin toggles a task required ↔ optional.

If we do nothing, milestone completion can become stale until the user generates a new progress write.

We need a mechanism to recompute milestone progress when `milestone_tasks.is_optional` changes.

Recommended approach: DB-triggered recompute on task definition change.

- Add a trigger on `public.milestone_tasks`:
  - `AFTER INSERT OR UPDATE OF is_optional OR DELETE`
  - For the affected `milestone_id`, “touch” rows in `public.user_task_progress` for that milestone by updating `updated_at = NOW()`.
  - This causes the existing `update_milestone_progress_on_task_change` trigger (on `user_task_progress`) to fire and recompute for each affected user row.

Tradeoff:

- This can be heavy for a large cohort. Mitigations:
  - Restrict to updates where `is_optional` actually changes.
  - Consider future optimization: a dedicated recalculation function that operates per-user-per-milestone, or async jobs.

## 6) Implementation Plan (Repo Changes)

### 6.1 New Supabase migration

Create: `supabase/migrations/14x_add_optional_milestone_tasks.sql`

Must include:

1) Add column:

```sql
ALTER TABLE public.milestone_tasks
ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;
```

2) Replace `public.update_user_milestone_progress()` (secured, with `SET search_path='public'`) following the latest canonical version in `099_recreate_milestone_progress_triggers.sql`, but with required-only completion logic:

```sql
-- Count required tasks only
SELECT COUNT(*) INTO total_tasks_count
FROM public.milestone_tasks
WHERE milestone_id = milestone_record.id
  AND is_optional = false;

-- Count completed required tasks only (join required)
SELECT COUNT(*) INTO completed_tasks_count
FROM public.user_task_progress utp
JOIN public.milestone_tasks mt ON mt.id = utp.task_id
WHERE utp.user_profile_id = COALESCE(NEW.user_profile_id, OLD.user_profile_id)
  AND utp.milestone_id = milestone_record.id
  AND utp.status = 'completed'
  AND mt.is_optional = false;
```

3) Recompute-on-task-change trigger:

```sql
CREATE OR REPLACE FUNCTION public.touch_milestone_progress_on_task_def_change()
RETURNS TRIGGER
SET search_path = 'public'
AS $$
DECLARE
  v_milestone_id uuid;
BEGIN
  v_milestone_id := COALESCE(NEW.milestone_id, OLD.milestone_id);
  IF v_milestone_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only necessary when optionality changes (or insert/delete affects required set).
  -- Touch user_task_progress so update_milestone_progress_on_task_change fires.
  UPDATE public.user_task_progress
  SET updated_at = NOW()
  WHERE milestone_id = v_milestone_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_milestone_progress_on_task_def_change ON public.milestone_tasks;
CREATE TRIGGER trg_touch_milestone_progress_on_task_def_change
AFTER INSERT OR UPDATE OF is_optional OR DELETE ON public.milestone_tasks
FOR EACH STATEMENT
EXECUTE FUNCTION public.touch_milestone_progress_on_task_def_change();
```

Notes:

- `FOR EACH STATEMENT` is preferred over `FOR EACH ROW` to reduce recomputation churn on bulk task changes.
- If we want to avoid recompute for updates that do not change `is_optional`, we can implement row-level triggers and check `OLD.is_optional IS DISTINCT FROM NEW.is_optional`. That is more precise but more work; statement-level is acceptable initially.

### 6.2 User milestone API must expose `is_optional`

Update: `pages/api/user/cohort/[cohortId]/milestones.ts`

- Add `is_optional` to the `MilestoneTask` interface.
- Add `is_optional` to the `milestone_tasks` select list:

```ts
// in the supabase .select(...) for milestone_tasks
is_optional,
```

Why:

- Lobby UI needs the field to render an “Optional” badge.

### 6.3 Admin task read endpoints

Admin endpoints like `app/api/admin/tasks/by-milestone/route.ts` use `select('*')`, so they will automatically include `is_optional` after the migration. No changes required unless we add server-side validation.

### 6.4 Admin milestone form: authoring optional tasks

Update: `components/admin/MilestoneFormEnhanced.tsx`

- Extend `TaskForm` with:

```ts
is_optional: boolean;
```

- Default new tasks to `false`.
- Add a checkbox UI control per task:
  - Label: “Optional (does not block milestone completion)”
- Ensure `is_optional` is included in task create/update payloads sent to `/api/admin/milestone-tasks`.

Why:

- Without this, optional tasks cannot be authored from the UI.

### 6.5 Lobby UI: optional badge

Update: `pages/lobby/bootcamps/[cohortId].tsx`

- Render an “Optional” badge when `task.is_optional === true`.
- No logic changes to submit/claim flows.

Optional (nice-to-have):

- Update `pages/bootcamp/[id]/cohort/[cohortId].tsx` to include “Optional” tag in the 3-task preview list if desired.

### 6.6 Types

Update: `lib/supabase/types.ts` (and/or regenerate types if this repo expects it)

- Ensure milestone task type used in the lobby includes `is_optional?: boolean`.

If the project relies on generated types (`types-gen.ts`), regenerate via the existing workflow and include the updated output. (No network should be required if local Supabase is available; otherwise do it manually for the handful of interfaces used in-app.)

## 7) Rewards & “Total Reward” Semantics (Decision Required)

Current behavior:

- `cohort_milestones.total_reward` is maintained by a trigger that sums `milestone_tasks.reward_amount` across all tasks.
- UI displays this as “Total Reward” in multiple places.

With optional tasks, this becomes “Maximum possible reward” rather than “guaranteed reward for completion”.

Recommended decision for phase 1:

- Keep DB behavior as-is and interpret displayed value as “Up to”.
- Optionally update UI label later (“Total Reward (Up to)”).

Alternative:

- Change the total reward trigger to sum required-only tasks and add a separate `bonus_reward` field. This is more invasive and requires UI updates.

## 8) Regression & Risk Review

### Risks

- **Stale completion after toggling optionality** if we do not implement a recomputation mechanism (addressed by the task-definition trigger).
- **Performance**: touching `user_task_progress` for large cohorts can be expensive. Mitigations:
  - statement-level trigger
  - consider narrowing the update to only impacted users (future)
  - run optionality changes off-peak if needed

### Backward compatibility

- Default `is_optional = false` means existing tasks remain required.
- Existing milestones behave identically unless optionality is explicitly enabled.

### Security

- Keep `SET search_path='public'` for any new or replaced trigger functions to maintain hardening introduced in migration 079.

## 9) Test Plan (What to Write)

### 9.1 Database-level behavior tests (highest value)

Prefer tests that run against local Supabase (integration tests). Suggested cases:

1) **Optional does not block completion**
   - Milestone has 1 required + 1 optional task
   - Complete only required task
   - Assert `user_milestone_progress.status = 'completed'`, `total_tasks = 1`, `tasks_completed = 1`

2) **Optional reward still claimable**
   - Complete optional task after milestone completed
   - Assert reward claim works and earned totals increase appropriately

3) **Toggle required → optional recomputes immediately**
   - Start with two required tasks; complete one
   - Toggle second to optional
   - Assert milestone becomes completed without new user submissions

4) **Toggle optional → required invalidates completion** (policy decision)
   - If we allow invalidation: assert status returns to `in_progress`
   - If we freeze completion once achieved: assert it remains `completed` (this would require additional logic; default behavior will invalidate)

### 9.2 API contract test

- Ensure `pages/api/user/cohort/[cohortId]/milestones.ts` returns `is_optional` on tasks and that TypeScript models align.

### 9.3 UI tests

- Lobby renders “Optional” badge when `task.is_optional` is true.
- Admin form toggling persists the field into API payloads.

## 10) Rollout Notes

- Apply migration locally: `supabase migration up --local` (do not reset DB).
- Validate with a cohort that has a milestone containing both required + optional tasks.
- Confirm:
  - user can claim milestone key after completing required tasks only
  - optional tasks still appear and can be submitted/claimed

