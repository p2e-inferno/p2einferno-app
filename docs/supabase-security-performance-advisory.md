# Supabase Security & Performance Advisory Report

**Generated**: December 2024  
**Database**: p2einferno-app Supabase Project  
**Postgres Version**: supabase-postgres-17.4.1.064  
**Last CLI Check**: December 2024 (CLI v2.34.3)

## Executive Summary

This report contains security and performance advisories from Supabase's database linter for the p2einferno-app project. The analysis identified **2 critical security issues**, **23 security warnings**, and **extensive performance optimizations** that should be addressed to improve database security and query performance.

### Current Status (December 2024)
- **Local Database**: Running and accessible
- **CLI Version**: v2.34.3 (latest available: v2.48.3)
- **New Issues Found**: 1 SQL ambiguity error in `fix_orphaned_applications` function
- **Performance**: No bloat detected, minimal table sizes, no long-running queries or blocking issues

## 🔒 Security Advisories

### Critical Issues (ERROR Level)

#### 1. SQL Ambiguity Error (NEW - December 2024)
**Severity**: CRITICAL  
**Function**: `public.fix_orphaned_applications`

**Issue**: Column reference "user_profile_id" is ambiguous in UPDATE statement at line 26. The reference could refer to either a PL/pgSQL variable or a table column.

**SQL Statement**:
```sql
UPDATE applications 
SET user_profile_id = user_profile_id 
WHERE id = app.id
```

**Risk**: This ambiguity can cause incorrect data updates or runtime errors.

**Remediation**: 
- Qualify the column reference with the table name: `applications.user_profile_id`
- Or use a different variable name to avoid conflicts
- Test the function thoroughly after fixing

#### 2. Security Definer Views
**Severity**: CRITICAL  
**Count**: 2 instances

**Affected Views**:
- `public.all_applications_view`
- `public.user_applications_view`

**Issue**: These views are defined with the SECURITY DEFINER property, which enforces Postgres permissions and row level security policies (RLS) of the view creator rather than the querying user. This can bypass intended security controls.

**Risk**: Potential privilege escalation and unauthorized data access.

**Remediation**: 
- Review view definitions and ensure they align with security requirements
- Consider removing SECURITY DEFINER if not necessary
- Implement proper RLS policies on underlying tables
- [Security Definer View Guide](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)

### Warning Issues (WARN Level)

#### 2. Function Search Path Mutable
**Severity**: HIGH  
**Count**: 22 instances

**Affected Functions**:
- `award_xp_to_user`
- `get_user_checkin_streak`
- `has_checked_in_today`
- `update_cohort_participant_count`
- `notify_on_task_completion`
- `notify_on_milestone_progress`
- `notify_on_enrollment_change`
- `notify_on_application_status`
- `check_duplicate_submission`
- `update_updated_at_column`
- `set_updated_at`
- `update_quest_progress_on_task_change`
- `fix_orphaned_applications`
- `ensure_user_application_status`
- `is_admin`
- `update_milestone_total_reward`
- `create_notification_v2`
- `handle_successful_payment`
- `check_lock_address_uniqueness`
- `recalculate_quest_progress`

**Issue**: Functions have a mutable search_path parameter, which can be exploited for SQL injection attacks.

**Risk**: SQL injection vulnerabilities through search_path manipulation.

**Remediation**:
- Set `search_path` parameter to a fixed, secure value
- Use `SET search_path = 'public'` or similar in function definitions
- [Function Search Path Guide](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

#### 3. Vulnerable Postgres Version
**Severity**: HIGH  
**Count**: 1 instance

**Current Version**: `supabase-postgres-17.4.1.064`

**Issue**: The current Postgres version has outstanding security patches available.

**Risk**: Known security vulnerabilities may be exploitable.

**Remediation**:
- Upgrade to the latest Postgres version available in Supabase
- [Upgrade Guide](https://supabase.com/docs/guides/platform/upgrading)

## ⚡ Performance Advisories

### Current Performance Status (December 2024)
- **Database Bloat**: ✅ No bloat detected - all tables are clean
- **Long-running Queries**: ✅ No queries running longer than 5 minutes
- **Blocking Queries**: ✅ No blocking queries detected
- **Table Sizes**: All tables are small (largest is 96 kB for user_profiles)
- **Index Usage**: Many indexes are unused (35 instances) but this is expected for a development database
- **Sequential Scans**: Present but minimal due to small dataset size

### Information Level Issues

#### 1. Unindexed Foreign Keys
**Severity**: MEDIUM  
**Count**: 7 instances

**Affected Tables & Foreign Keys**:
- `bootcamp_enrollments.cohort_id` → `bootcamp_enrollments_cohort_id_fkey`
- `cohort_milestones.prerequisite_milestone_id` → `cohort_milestones_prerequisite_milestone_id_fkey`
- `cohorts.bootcamp_program_id` → `cohorts_bootcamp_program_id_fkey`
- `milestone_tasks.milestone_id` → `milestone_tasks_milestone_id_fkey`
- `user_application_status.application_id` → `user_application_status_application_id_fkey`
- `user_milestone_progress.milestone_id` → `user_milestone_progress_milestone_id_fkey`
- `user_milestones.milestone_id` → `user_milestones_milestone_id_fkey`

**Issue**: Foreign key constraints without covering indexes can lead to suboptimal query performance.

**Impact**: Slower JOIN operations and foreign key constraint checks.

**Remediation**:
- Add covering indexes for all foreign key columns
- [Unindexed Foreign Keys Guide](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)

#### 2. Unused Indexes
**Severity**: LOW  
**Count**: 35 instances

**Affected Tables & Indexes**:
- `task_submissions`: `idx_task_submissions_status`
- `applications`: `idx_applications_cohort_id`, `idx_applications_current_payment_transaction_id`, `idx_applications_user_profile_id`
- `quest_tasks`: `idx_quest_tasks_order_index`
- `user_profiles`: `idx_user_profiles_wallet_address`
- `attestations`: `idx_attestations_schema_uid`, `idx_attestations_attester`, `idx_attestations_recipient`, `idx_attestations_created_at`
- `attestation_schemas`: `idx_attestation_schemas_category`, `idx_attestation_schemas_schema_uid`
- `lock_registry`: `idx_lock_registry_lock_address`
- `milestone_tasks`: `idx_milestone_tasks_task_type`, `idx_milestone_tasks_contract_network`, `idx_milestone_tasks_contract_address`
- `payment_transactions`: `idx_payment_transactions_created_at`, `idx_payment_transactions_transaction_hash`, `idx_payment_transactions_network_chain_id`
- `tos_signatures`: `idx_tos_signatures_user_id`, `idx_tos_signatures_wallet_address`
- `user_activities`: `idx_user_activities_activity_type`
- `user_application_status`: `idx_user_application_status_status`
- `user_milestones`: `idx_user_milestones_user_id`
- `user_milestone_progress`: `idx_user_milestone_progress_status`
- `user_quest_keys`: `idx_user_quest_keys_user_id`
- `user_task_completions`: `idx_user_task_completions_quest_id`

**Issue**: Indexes that have never been used and may be candidates for removal.

**Impact**: Unnecessary storage overhead and slower write operations.

**Remediation**:
- Review query patterns before removing indexes
- Consider if indexes might be needed for future queries
- [Unused Index Guide](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

### Warning Level Issues

#### 3. Auth RLS Initialization Plan
**Severity**: HIGH  
**Count**: 100+ instances

**Issue**: Row Level Security (RLS) policies are re-evaluating `current_setting()` and `auth.<function>()` for each row, causing suboptimal query performance at scale.

**Affected Tables**: All tables with RLS policies including:
- `user_task_completions`
- `bootcamp_programs`
- `cohort_milestones`
- `lock_registry`
- `program_highlights`
- `milestone_tasks`
- `program_requirements`
- `cohorts`
- `quest_tasks`
- `quests`
- `user_activities`
- `user_application_status`
- `bootcamp_enrollments`
- `user_profiles`
- `payment_transactions`
- `tos_signatures`
- `user_quest_progress`
- `task_submissions`
- `notifications`
- `applications`
- `user_milestone_progress`
- `attestation_schemas`
- `attestations`
- `user_milestones`
- `user_quest_keys`

**Impact**: Significant performance degradation on queries involving large datasets.

**Remediation**:
- Replace `auth.<function>()` with `(select auth.<function>())` in RLS policies
- This moves the function call to the initialization plan instead of per-row evaluation
- [RLS Performance Guide](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)

#### 4. Multiple Permissive Policies
**Severity**: MEDIUM  
**Count**: 200+ instances

**Issue**: Multiple permissive RLS policies exist for the same role and action on various tables, causing performance overhead as each policy must be executed for every relevant query.

**Affected Tables**: All major tables including:
- `applications`
- `bootcamp_enrollments`
- `bootcamp_programs`
- `cohort_milestones`
- `cohorts`
- `lock_registry`
- `milestone_tasks`
- `notifications`
- `payment_transactions`
- `program_highlights`
- `program_requirements`
- `quest_tasks`
- `quests`
- `tos_signatures`
- `user_activities`
- `user_application_status`
- `user_milestone_progress`
- `user_profiles`
- `user_quest_progress`
- `user_task_completions`

**Impact**: Increased query execution time due to multiple policy evaluations.

**Remediation**:
- Consolidate multiple permissive policies into single, more efficient policies
- Use conditional logic within policies instead of separate policies
- [Multiple Permissive Policies Guide](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)

## 🎯 Priority Recommendations

### Immediate (Critical Security)
1. **Fix SQL Ambiguity Error** - Resolve the column reference ambiguity in `fix_orphaned_applications` function
2. **Fix Security Definer Views** - Address the 2 critical security issues with views
3. **Update Postgres Version** - Upgrade to latest version for security patches

### High Priority (Security & Performance)
3. **Fix Function Search Paths** - Secure all 22 functions with mutable search_path
4. **Optimize RLS Policies** - Replace auth function calls in 100+ policies

### Medium Priority (Performance)
5. **Add Missing Indexes** - Create covering indexes for 7 foreign key constraints
6. **Consolidate RLS Policies** - Merge multiple permissive policies for better performance

### Low Priority (Maintenance)
7. **Remove Unused Indexes** - Clean up 35 unused indexes after careful review

## Implementation Plan

### Phase 1: Critical Security (Week 1)
- [ ] Fix SQL ambiguity error in `fix_orphaned_applications` function
- [ ] Review and fix Security Definer views
- [ ] Plan Postgres version upgrade
- [ ] Audit function search_path configurations

### Phase 2: Security Hardening (Week 2)
- [ ] Implement secure search_path for all functions
- [ ] Execute Postgres version upgrade
- [ ] Test security fixes

### Phase 3: Performance Optimization (Week 3-4)
- [ ] Optimize RLS policies (auth function calls)
- [ ] Add missing foreign key indexes
- [ ] Consolidate multiple permissive policies

### Phase 4: Maintenance (Week 5)
- [ ] Review and remove unused indexes
- [ ] Performance testing and validation
- [ ] Documentation updates

## Monitoring & Validation

### Security Validation
- Re-run Supabase security advisors after each phase
- Verify RLS policies work as expected
- Test function security configurations

### Performance Validation
- Monitor query performance before/after changes
- Use Supabase performance monitoring tools
- Validate index usage and effectiveness

## CLI Update Recommendation

**Current Version**: v2.34.3  
**Latest Available**: v2.48.3

The current Supabase CLI version is significantly behind the latest release. Updating to v2.48.3 would provide access to:
- Enhanced security and performance advisory features
- Improved database inspection tools
- Latest bug fixes and security patches

**Update Command** (varies by installation method):
```bash
# If installed via npm
npm update -g supabase

# If installed via Homebrew (macOS)
brew upgrade supabase

# If installed via direct download
# Download latest from: https://github.com/supabase/cli/releases
```

## Resources

- [Supabase Database Linter Documentation](https://supabase.com/docs/guides/database/database-linter)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/security.html)
- [Row Level Security Performance Guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase CLI Installation Guide](https://supabase.com/docs/guides/cli/getting-started)

---

**Note**: This report should be reviewed regularly as the database schema and usage patterns evolve. Consider setting up automated monitoring for these advisory types to catch issues early.
