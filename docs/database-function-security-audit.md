# Database Function Security Audit - Missing SET search_path

## Issue Summary

During investigation of milestone progress tracking bugs, discovered that critical trigger functions were missing `SET search_path = 'public'` security directives. This affects functions called by `service_role` (admin operations).

## Background

**Security Migrations 070-078** added `SET search_path = 'public'` to prevent SQL injection via search_path manipulation (Supabase security advisory). However, some functions were missed.

## Functions That Were Successfully Secured (070-078)

✅ The following functions WERE secured and should work correctly:
- `check_duplicate_submission`
- `check_lock_address_uniqueness`
- `ensure_user_application_status`
- `is_admin`
- `public.award_xp_to_user`
- `public.create_notification`
- `public.create_notification_v2`
- `public.exec_sql`
- `public.get_user_checkin_streak`
- `public.handle_successful_payment`
- `public.has_checked_in_today`
- `public.notify_on_application_status`
- `public.notify_on_enrollment_change`
- `public.notify_on_milestone_progress`
- `public.notify_on_task_completion`
- `public.set_updated_at`
- `public.update_updated_at_column`
- `recalculate_quest_progress`
- `update_cohort_participant_count`
- `update_milestone_total_reward`
- `update_quest_progress_on_task_change`

## Functions That Were MISSED (Need Securing)

⚠️ **CRITICAL - Directly affects milestone tracking:**
1. **`update_task_progress_on_submission`** (migration 045)
   - Trigger: Fires on task_submissions INSERT/UPDATE
   - Impact: Admin task completion marking may fail to update user_task_progress
   - Symptoms: Task shows "Completed" badge but progress doesn't sync

2. **`update_user_milestone_progress`** (migration 045)
   - Trigger: Fires on user_task_progress INSERT/UPDATE/DELETE
   - Impact: Milestone progress aggregation fails when called by service_role
   - Symptoms: Milestone stats don't update, claim button doesn't appear

⚠️ **MODERATE - May affect other features:**
3. **`check_single_submission_per_user_task`** (migration 037)
   - Constraint: Prevents duplicate task submissions
   - Impact: May allow duplicate submissions or incorrectly reject valid ones

4. **`compute_user_application_status`** (migration 019)
   - Logic: Computes application status
   - Impact: Application status may be incorrect

5. **`sync_application_status`** (migration 025)
   - Trigger: Syncs application status changes
   - Impact: Application status may not sync properly

6. **`reconcile_all_application_statuses`** (migration 063)
   - Utility: Fixes orphaned applications
   - Impact: One-time migration function, less critical

7. **`fix_orphaned_applications`** (migration 063)
   - Utility: Fixes orphaned applications
   - Impact: One-time migration function, less critical

⚠️ **LOW - Notification functions:**
8. **`public.notify_on_task_progress`** (migration 061)
   - Trigger: Sends notifications on task progress
   - Impact: Notifications may not fire correctly
   - Note: Similar function `notify_on_task_completion` WAS secured

9. **`public.notify_on_task_submission_review`** (migration 052)
   - Trigger: Sends notifications when task reviewed
   - Impact: Users may not receive review notifications

⚠️ **INFORMATIONAL - Simple triggers:**
10. **`update_user_journey_preferences_updated_at`** (migration 050)
    - Simple timestamp update trigger
    - Low risk but should be secured for consistency

## Why This Matters

### Service Role Context
- Admin API routes use `createAdminClient()` with `service_role` permissions
- `service_role` has different search_path context than regular authenticated users
- Without explicit `SET search_path = 'public'`, functions may:
  - Fail silently
  - Use wrong schema
  - Be vulnerable to SQL injection via search_path manipulation

### Why It Worked Before But Fails Now
- Normal user flows work (authenticated users have correct search_path)
- Admin operations (service_role) fail silently
- The manual reconciliation code added in commit 563eeb8 was a band-aid that only fixed `user_task_progress`, not `user_milestone_progress`

## Recommended Fix

**Migration 079** has been created to secure the two CRITICAL functions:
- `update_task_progress_on_submission`
- `update_user_milestone_progress`

### Additional Work Needed

**Migration 080** should secure the remaining functions:
- `check_single_submission_per_user_task`
- `compute_user_application_status`
- `sync_application_status`
- `reconcile_all_application_statuses`
- `fix_orphaned_applications`
- `public.notify_on_task_progress`
- `public.notify_on_task_submission_review`
- `update_user_journey_preferences_updated_at`

## Testing Strategy

After applying migrations:

1. **Test milestone tracking flow:**
   - Admin marks task submission as "completed"
   - Verify `user_task_progress` updates
   - Verify `user_milestone_progress` updates
   - Verify milestone claim button appears
   - Verify stats counter updates

2. **Test application flow:**
   - Create application
   - Update application status
   - Verify status syncs correctly

3. **Test notifications:**
   - Submit task for review
   - Admin reviews task
   - Verify user receives notification

## Prevention

- All new trigger functions MUST include `SET search_path = 'public'`
- Add this to CLAUDE.md as a requirement
- Consider adding a pre-commit hook to check for this pattern

## References

- Security advisory: `docs/supabase-security-performance-advisory.md`
- Original trigger migrations: `045_add_milestone_progress_triggers.sql`
- Security hardening: `070-078_secure_*_functions_search_path.sql`
- Fix migration: `079_secure_milestone_progress_triggers.sql`
