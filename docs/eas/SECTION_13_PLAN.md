# Implementation Plan: Section 13 - Schema UID Hardcoding Fix

## Overview

Replace hardcoded placeholder schema UIDs (`0xp2e_daily_checkin_001`, etc.) with dynamic `(schema_key, network)` lookups to enable EAS schema deployment without code changes.

**Current Problem:**
- 8+ occurrences of hardcoded `0xp2e_daily_checkin_001` in SQL functions
- 2 hardcoded references in TypeScript code
- When real schemas are deployed to EAS, the system won't automatically use them

**Solution:**
- Add SQL helper function `get_schema_uid(p_schema_key, p_network)`
- Update 2 SQL streak functions to use dynamic lookup
- Fix 2 TypeScript files to use `resolveSchemaUID()` instead of hardcoded strings
- Phased rollout with backward compatibility
- Production-ready multi-network requires explicit network context in SQL; implement via new `*_v2(user_address, p_network)` functions (do not overload existing signatures).

---

## Phase A: SQL Changes (Backward-Compatible)

### ⚠️ CRITICAL: Regression Prevention Strategy

**Problem:** The proposed function changes add:
1. Dynamic schema UID lookup (instead of hardcoded)
2. Network filter (currently absent)

**Risk:** If `attestation_schemas` doesn't have matching `schema_key`/`network` rows, or if `attestations` have inconsistent `network` values, users will lose their streaks.

**Safe Migration Strategy:**

1. **Pre-flight verification** (MUST pass before migration):
   ```sql
   -- Verify schema_key exists for daily_checkin
   SELECT schema_uid, schema_key, network FROM public.attestation_schemas
   WHERE schema_uid = '0xp2e_daily_checkin_001';
   -- MUST return: schema_key = 'daily_checkin', network = 'base-sepolia'

   -- Verify all daily check-in attestations have consistent network
   SELECT network, COUNT(*) FROM public.attestations
   WHERE schema_uid = '0xp2e_daily_checkin_001'
   GROUP BY network;
   -- MUST return: only 'base-sepolia' (or single consistent value)
   ```

2. **Fallback with hardcoded UID** - If lookup fails, fall back to hardcoded UID (belt-and-suspenders)

3. **Optional network filter** - Only add network filter if we're confident all data is consistent

### 1. Create Migration 123

**File:** `supabase/migrations/123_add_schema_uid_helper_and_update_functions.sql`

**Security Requirements Checklist (Per Supabase Advisory 0011):**
- ✅ All functions with `SET search_path` - prevents search_path injection
- ✅ Use fully qualified table references: `public.table_name`
- ✅ Include documentation comment referencing advisory 0011

**SECURITY DEFINER Rules:**
- ❌ `get_schema_uid()` - NO SECURITY DEFINER (`attestation_schemas` has `USING (true)` RLS - publicly readable)
- ❌ `get_user_checkin_streak()` - NO SECURITY DEFINER (current function doesn't have it)
- ❌ `has_checked_in_today()` - NO SECURITY DEFINER (current function doesn't have it)

**Why:** None of these functions need elevated privileges. Adding SECURITY DEFINER unnecessarily increases attack surface.

**Part 1: Add Helper Function**

```sql
CREATE OR REPLACE FUNCTION public.get_schema_uid(
  p_schema_key TEXT,
  p_network TEXT
)
RETURNS TEXT
SET search_path = 'public'  -- Prevents search_path injection per Supabase advisory 0011
LANGUAGE plpgsql
AS $$
DECLARE
  v_schema_uid TEXT;
BEGIN
  -- Returns latest schema UID for given (key, network)
  SELECT schema_uid INTO v_schema_uid
  FROM public.attestation_schemas  -- Fully qualified table reference
  WHERE schema_key = p_schema_key
    AND network = p_network
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_schema_uid;
END;
$$;

COMMENT ON FUNCTION public.get_schema_uid(TEXT, TEXT) IS
  'Resolves latest schema UID for given key and network. Returns NULL if not found. Secured with fixed search_path per Supabase advisory 0011.';

-- Leave default EXECUTE permissions (do NOT restrict to service_role only)
-- Reason: streak functions run as the caller and must be able to call this helper
```

**Part 2: Update `get_user_checkin_streak`** (same signature, no SECURITY DEFINER)

⚠️ **CRITICAL**: Keep SAME function signature `(user_address TEXT)` - adding optional parameter creates a NEW overload and the old function continues to be called!

⚠️ **CRITICAL**: Do NOT add SECURITY DEFINER - current function only has `SET search_path` (see migration 070). Adding SECURITY DEFINER would expand privileges unnecessarily.

```sql
-- Replace the existing (text) function - same signature
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak(user_address TEXT)
RETURNS INTEGER
SET search_path = 'public'  -- Keep this, but NO SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
  attestation_count INTEGER;
  profile_id UUID;
  v_checkin_schema_uid TEXT;
  -- HARDCODED FALLBACK for backward compatibility
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  -- Network fallback (testnet default)
  -- Phase A2 introduces v2 functions that accept an explicit p_network; this is just a safe fallback
  c_network CONSTANT TEXT := 'base-sepolia';
BEGIN
  -- Try dynamic schema UID lookup first
  v_checkin_schema_uid := get_schema_uid('daily_checkin', c_network);

  -- SAFETY: Fall back to hardcoded UID if lookup fails (prevents regression)
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
    -- No RAISE WARNING - these are hot-path functions, would spam logs
  END IF;

  -- Check if attestations exist (NO network filter - backward compatible)
  SELECT COUNT(*) INTO attestation_count
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND is_revoked = false
  LIMIT 1;

  IF attestation_count > 0 THEN
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.attestations
        WHERE recipient = user_address
          AND schema_uid = v_checkin_schema_uid
          AND is_revoked = false
          AND DATE(created_at) = current_date_check
      ) INTO checkin_exists;

      IF checkin_exists THEN
        streak_count := streak_count + 1;
        current_date_check := current_date_check - INTERVAL '1 day';
      ELSE
        EXIT;
      END IF;

      IF streak_count > 365 THEN
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- Fallback to user_activities table (unchanged)
    profile_id := get_user_profile_id_from_address(user_address);
    IF profile_id IS NOT NULL THEN
      streak_count := get_user_checkin_streak_from_activities(profile_id);
    END IF;
  END IF;

  RETURN streak_count;
END;
$$;

COMMENT ON FUNCTION public.get_user_checkin_streak(TEXT) IS
  '[Migration 123] Updated to use dynamic schema lookup via get_schema_uid(). Secured with fixed search_path per Supabase advisory 0011.';
```

**Part 3: Update `has_checked_in_today`** (same signature, no SECURITY DEFINER)

⚠️ Same rules apply: keep SAME signature, NO SECURITY DEFINER, NO RAISE WARNING.

```sql
-- Replace the existing (text) function - same signature
CREATE OR REPLACE FUNCTION public.has_checked_in_today(user_address TEXT)
RETURNS BOOLEAN
SET search_path = 'public'  -- Keep this, but NO SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  has_attestation BOOLEAN;
  profile_id UUID;
  has_activity BOOLEAN;
  v_checkin_schema_uid TEXT;
  -- HARDCODED FALLBACK for backward compatibility
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
  -- Network fallback (testnet default)
  -- Phase A2 introduces v2 functions that accept an explicit p_network; this is just a safe fallback
  c_network CONSTANT TEXT := 'base-sepolia';
BEGIN
  -- Try dynamic schema UID lookup first
  v_checkin_schema_uid := get_schema_uid('daily_checkin', c_network);

  -- SAFETY: Fall back to hardcoded UID if lookup fails
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
    -- No RAISE WARNING - hot-path function
  END IF;

  -- Check attestations (NO network filter - backward compatible)
  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE recipient = user_address
      AND schema_uid = v_checkin_schema_uid
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  ) INTO has_attestation;

  IF has_attestation THEN
    RETURN TRUE;
  END IF;

  -- Fallback to user_activities (unchanged)
  profile_id := get_user_profile_id_from_address(user_address);
  IF profile_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_activities
      WHERE user_profile_id = profile_id
        AND activity_type = 'daily_checkin'
        AND DATE(created_at) = CURRENT_DATE
    ) INTO has_activity;
    RETURN has_activity;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.has_checked_in_today(TEXT) IS
  '[Migration 123] Updated to use dynamic schema lookup via get_schema_uid(). Secured with fixed search_path per Supabase advisory 0011.';
```

**Part 4: Post-Migration Verification** (run manually, NOT in migration)

Move these to ops runbook / deployment checklist - do NOT include in migration file:

```sql
-- OPS: Verify schema_key coverage
SELECT schema_key, network, schema_uid, created_at
FROM public.attestation_schemas
WHERE schema_key IS NOT NULL
ORDER BY schema_key, network, created_at DESC;

-- OPS: Test the new helper function
SELECT get_schema_uid('daily_checkin', 'base-sepolia') AS resolved_uid;
-- Expected: returns '0xp2e_daily_checkin_001' (or real UID if deployed)

-- OPS: Verify no orphan schemas
SELECT COUNT(*) FROM public.attestation_schemas
WHERE schema_key IS NULL AND schema_uid LIKE '0xp2e_%';
-- Expected: 0
```

### 2. Deployment

```bash
# Apply migration locally first
npm run db:migrate

# Test helper function works
# (run verification queries from migration)

# Apply to remote when ready
supabase db push
```

### 3. Validation

**Security Validation:**
- ✅ All functions have `SET search_path = 'public'` (no SECURITY DEFINER in this migration)
- ✅ All functions use fully qualified table names (`public.table_name`)
- ✅ `get_schema_uid` is callable by invoker functions (do not restrict to service_role only unless you also make callers SECURITY DEFINER, which we avoid)

**Functional Validation:**
- ✅ Helper function returns current schema UIDs (run ops verification queries)
- ✅ Streak functions still work with placeholder UIDs (fallback works silently)
- ✅ Same function signatures - existing callers unchanged
- ✅ No performance degradation
- ✅ **CRITICAL: Compare streak counts before/after for sample users**

---

## Phase A2: Add Network Context (Production Multi-Network)

Phase A intentionally uses a `c_network = 'base-sepolia'` fallback and does **not** add a network filter to avoid regressions.

To become production-ready for dynamic networks, SQL must receive an explicit network value. Supabase/Postgres does not provide a safe built-in `current_setting('app.network')` context by default, so the network must be passed as a parameter.

**Only proceed with Phase A2 after:**
1. Phase A deployed successfully for 24-48 hours
2. Data verification queries confirm `attestations.network` is populated and consistent for daily check-ins

### Migration 124: Add network-aware v2 functions (no overloads)

**File:** `supabase/migrations/124_add_network_aware_checkin_functions.sql`

**Why v2 instead of optional params / overloads:**
- Adding optional params creates a NEW overload; existing callers keep using the old signature.
- Overloading keeps old behavior alive and creates ambiguity.
- v2 functions allow a safe, explicit rollout without breaking existing callers.

Create new functions (names are explicit, signatures are stable):

```sql
-- 124_add_network_aware_checkin_functions.sql
-- Adds network-aware variants without changing existing signatures.

-- OPS (run manually before applying this migration):
-- Ensure attestations.network is fully populated for daily check-ins.
-- If any NULLs exist, backfill before enabling network-aware functions.

-- Network-aware streak function
CREATE OR REPLACE FUNCTION public.get_user_checkin_streak_v2(
  user_address TEXT,
  p_network TEXT
)
RETURNS INTEGER
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date_check DATE := CURRENT_DATE;
  checkin_exists BOOLEAN;
  attestation_count INTEGER;
  profile_id UUID;
  v_checkin_schema_uid TEXT;
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
BEGIN
  v_checkin_schema_uid := get_schema_uid('daily_checkin', p_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  SELECT COUNT(*) INTO attestation_count
  FROM public.attestations
  WHERE recipient = user_address
    AND schema_uid = v_checkin_schema_uid
    AND network = p_network
    AND is_revoked = false
  LIMIT 1;

  IF attestation_count > 0 THEN
    LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.attestations
        WHERE recipient = user_address
          AND schema_uid = v_checkin_schema_uid
          AND network = p_network
          AND is_revoked = false
          AND DATE(created_at) = current_date_check
      ) INTO checkin_exists;

      IF checkin_exists THEN
        streak_count := streak_count + 1;
        current_date_check := current_date_check - INTERVAL '1 day';
      ELSE
        EXIT;
      END IF;

      IF streak_count > 365 THEN
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- Optional: keep user_activities fallback behavior consistent with v1
    profile_id := get_user_profile_id_from_address(user_address);
    IF profile_id IS NOT NULL THEN
      streak_count := get_user_checkin_streak_from_activities(profile_id);
    END IF;
  END IF;

  RETURN streak_count;
END;
$$;

-- Network-aware today check
CREATE OR REPLACE FUNCTION public.has_checked_in_today_v2(
  user_address TEXT,
  p_network TEXT
)
RETURNS BOOLEAN
SET search_path = 'public'
LANGUAGE plpgsql
AS $$
DECLARE
  has_attestation BOOLEAN;
  last_checkin TIMESTAMP WITH TIME ZONE;
  v_checkin_schema_uid TEXT;
  c_fallback_schema_uid CONSTANT TEXT := '0xp2e_daily_checkin_001';
BEGIN
  v_checkin_schema_uid := get_schema_uid('daily_checkin', p_network);
  IF v_checkin_schema_uid IS NULL THEN
    v_checkin_schema_uid := c_fallback_schema_uid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attestations
    WHERE recipient = user_address
      AND schema_uid = v_checkin_schema_uid
      AND network = p_network
      AND is_revoked = false
      AND DATE(created_at) = CURRENT_DATE
  ) INTO has_attestation;

  IF has_attestation THEN
    RETURN TRUE;
  END IF;

  -- EAS-disabled fallback: use existing helper (migration 097)
  -- Avoids relying on user_activities RLS inside an invoker function.
  last_checkin := get_last_checkin_date(user_address);
  IF last_checkin IS NOT NULL THEN
    RETURN DATE(last_checkin) = CURRENT_DATE;
  END IF;

  RETURN FALSE;
END;
$$;
```

### Phase A2 Rollout
- Add the v2 functions first (no caller changes yet).
- Update application callers (Phase B2) to call `*_v2(..., resolvedNetwork)` explicitly.
- Keep v1 functions for backward compatibility until you’re confident all callers have migrated.

---

## Phase B: TypeScript Changes

⚠️ **CRITICAL**: Do NOT return 0/false if `resolveSchemaUID` returns null - the resolver already has DB → env fallback. Returning early would regress if env placeholders are still used.

⚠️ **CRITICAL**: Do NOT add `.eq("network", ...)` filter yet - can regress if data is inconsistent. Add in Phase B2 after verification.

### 1. Update `lib/attestation/database/queries.ts`

**Location:** Line 205 in `getUserDailyCheckinStreak()` function

**Current Code:**
```typescript
.eq("schema_uid", "0xp2e_daily_checkin_001") // Daily check-in schema UID
```

**Changes (minimal - just replace hardcoded UID):**

```typescript
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";

export const getUserDailyCheckinStreak = async (
  userAddress: string,
  network?: string,
): Promise<number> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();

    // Get daily check-ins for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Resolve schema UID dynamically (resolver has DB → env fallback)
    const dailyCheckinSchemaUid = await resolveSchemaUID('daily_checkin', resolvedNetwork);
    // NOTE: Do NOT check for null/return 0 - resolver has fallback built in

    const { data: checkins } = await supabase
      .from("attestations")
      .select("created_at")
      .eq("recipient", userAddress)
      .eq("schema_uid", dailyCheckinSchemaUid)  // CHANGED: use resolved UID
      // NOTE: No network filter yet - add in Phase B2 after data verification
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    // ... rest of streak calculation (unchanged)
  } catch (error) {
    log.error("Error calculating streak", { error });
    return 0;
  }
};
```

**Also add wrapper function in same file (optional - for cleaner API):**

```typescript
/**
 * Check if user has attestation for specific schema key
 * Cleaner API than passing UID directly
 */
export const hasUserAttestationBySchemaKey = async (
  userAddress: string,
  schemaKey: SchemaKey,
  network?: string,
): Promise<boolean> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    // Resolver has DB → env fallback, so this won't return null unless truly misconfigured
    const schemaUid = await resolveSchemaUID(schemaKey, resolvedNetwork);

    return hasUserAttestation(userAddress, schemaUid, resolvedNetwork);
  } catch (error) {
    return false;
  }
};
```

### 2. Update `hooks/attestation/useAttestationQueries.ts`

**Location:** Line 130 in `useUserAttestationStats` hook

**Current Code:**
```typescript
hasUserAttestation(address, "0xp2e_daily_checkin_001"),
```

**Changes:**

```typescript
// Update imports
import {
  getUserAttestations,
  getAttestationsBySchema,
  getUserAttestationCount,
  getUserDailyCheckinStreak,
  hasUserAttestation,
  hasUserAttestationBySchemaKey,  // NEW import
  getSchemaStatistics,
  Attestation,
} from "@/lib/attestation";

// In fetchStats function:
const [totalCount, streak, hasCheckedIn] = await Promise.all([
  getUserAttestationCount(address),
  getUserDailyCheckinStreak(address),
  hasUserAttestationBySchemaKey(address, 'daily_checkin'), // CHANGED
]);
```

### 3. Deployment

```bash
# Run tests locally
npm run test:unit
npm run test:coverage

# Build and deploy
npm run build
# Deploy to production (method varies)
```

### 4. Validation

After deployment:
- ✅ Streak calculations match pre-change values
- ✅ No increase in API response times
- ✅ Resolver cache hit rate > 90% (check logs)
- ✅ No errors in application logs

---

## Phase B2: Switch Callers to Network-Aware SQL (if/where RPC is used)

If any runtime paths call `public.get_user_checkin_streak` / `public.has_checked_in_today` via RPC, update them to call the v2 variants with explicit network:
- `get_user_checkin_streak_v2(user_address, resolvedNetwork)`
- `has_checked_in_today_v2(user_address, resolvedNetwork)`

This is the production-safe path for multi-network support because it does not rely on hardcoded network constants inside SQL.

## Testing

### SQL Helper Function Tests

**Create:** `__tests__/integration/db/schema-uid-resolution.test.ts` (already added in repo)

```typescript
// See: __tests__/integration/db/schema-uid-resolution.test.ts
```

### TypeScript Tests

**Update:** `__tests__/unit/lib/attestation/database/queries.test.ts`

```typescript
import { getUserDailyCheckinStreak } from "@/lib/attestation/database/queries";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";

jest.mock("@/lib/attestation/schemas/network-resolver");

describe("getUserDailyCheckinStreak with dynamic lookup", () => {
  it("resolves schema UID before querying", async () => {
    const mockSchemaUid = "0x" + "a".repeat(64);
    (resolveSchemaUID as jest.Mock).mockResolvedValue(mockSchemaUid);

    await getUserDailyCheckinStreak("0x1234567890123456789012345678901234567890");

    expect(resolveSchemaUID).toHaveBeenCalledWith("daily_checkin", "base-sepolia");
  });

  // NOTE: We do NOT test "returns 0 when schema UID not found" because
  // the resolver has DB → env fallback. Null is exceptional (misconfiguration).
  // Instead, test that the resolved UID is used correctly in the query.
});
```

---

## Rollback Plan

### SQL Rollback Strategy

**Option 1 (Preferred): Git Revert + Re-run Migration**
```bash
# Revert the migration commit
git revert <migration-commit-hash>

# Re-apply migrations (will restore original functions from 096)
npm run db:migrate
```

**Option 2: Manual Rollback Migration**

If git revert isn't feasible, create `supabase/migrations/124_rollback_123.sql` with the FULL original function bodies from migration 096. Do NOT use placeholder comments.

```sql
-- Drop the new helper function
DROP FUNCTION IF EXISTS public.get_schema_uid(TEXT, TEXT);

-- Restore original get_user_checkin_streak from 096
-- (Copy the FULL function body from 096_add_user_activities_streak_calculation.sql lines 81-131)

-- Restore original has_checked_in_today from 096
-- (Copy the FULL function body from 096_add_user_activities_streak_calculation.sql lines 140-181)
```

**Note:** The original functions do NOT have SECURITY DEFINER - only `SET search_path = 'public'`.

### TypeScript Rollback

```bash
# Revert TypeScript changes
git revert <typescript-commit-hash>

# Rebuild and deploy
npm run build
```

---

## Critical Files to Modify

### New Files (Create):
1. `supabase/migrations/123_add_schema_uid_helper_and_update_functions.sql` (~200 lines)
2. `__tests__/integration/db/schema-uid-resolution.test.ts` (~100 lines)

### Existing Files (Modify):
3. `lib/attestation/database/queries.ts`
   - Line 205: Update `getUserDailyCheckinStreak()` to use `resolveSchemaUID()`
   - Add `hasUserAttestationBySchemaKey()` wrapper (~15 lines)

4. `hooks/attestation/useAttestationQueries.ts`
   - Line 130: Switch to `hasUserAttestationBySchemaKey()` (~2 lines)

### Test Files (Update):
5. `__tests__/unit/lib/attestation/database/queries.test.ts`
   - Add mocks for `resolveSchemaUID()` (~50 lines)

6. `__tests__/unit/hooks/attestation/useAttestationQueries.test.ts`
   - Update to test new wrapper function (~30 lines)

---

## Success Criteria

### Phase A (SQL):
- ✅ Helper function returns correct UIDs for all 4 schema keys
- ✅ Streak functions work with existing placeholder UIDs
- ✅ Ops verification queries pass
- ✅ No performance degradation (< 10ms helper function execution)

### Phase B (TypeScript):
- ✅ Streak calculations match pre-change baseline
- ✅ API response times unchanged
- ✅ Cache hit rate > 90%
- ✅ All tests passing

### Overall:
- ✅ System automatically uses new schema UIDs when deployed to EAS
- ✅ No code changes required when schemas change
- ✅ Backward compatible with existing env vars
- ✅ Safe rollback available at each phase

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| NULL schema UIDs break streaks | **ELIMINATED** | High | **Hardcoded fallback UID** - if lookup fails, uses `'0xp2e_daily_checkin_001'` |
| Network filter excludes attestations | **ELIMINATED** | High | **No network filter in Phase A** - query unchanged except UID source |
| Schema lookup returns wrong UID | Low | High | Pre-flight verification query + ops runbook checks |
| Cache stale data (30s) | Medium | Low | Acceptable for admin operations; UI shows propagation delay notice |
| Performance degradation | Low | Low | Existing index optimizes lookups; single additional function call (~1ms) |

### Backward Compatibility Guarantees (Phase A)

1. **Function signature**: SAME as current `(user_address TEXT)` - no changes to callers
2. **Query behavior**: Identical to current (hardcoded UID fallback, no network filter)
3. **Return values**: Identical for all existing data
4. **No logging overhead**: Silent fallback (no RAISE WARNING in hot-path functions)

---

## Deployment Checklist

### Pre-Deployment:
- [ ] **SECURITY**: Verify all functions have `SET search_path = 'public'` (no SECURITY DEFINER needed)
- [ ] **DATA**: Run pre-flight verification queries (schema_key exists, network consistency)
- [ ] All unit tests passing
- [ ] Migration tested on local `supabase db reset`
- [ ] Migration tested on staging
- [ ] Ops verification queries return expected results
- [ ] Rollback plan reviewed (git revert + re-run migration)

### Phase A Deployment:
- [ ] Apply migration: `supabase db push`
- [ ] Run verification queries
- [ ] Monitor logs for 1 hour
- [ ] Verify no user-facing issues

### Phase B Deployment:
- [ ] Deploy TypeScript changes
- [ ] Monitor API response times for 1 hour
- [ ] Check resolver cache performance in logs
- [ ] Verify user stats are correct

### Post-Deployment:
- [ ] Update CLAUDE.md with schema UID resolution guidelines
- [ ] Document in migration guide
- [ ] Notify team of completion

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| Phase A (SQL) | 4-6 hours | None (existing infrastructure) |
| Phase B (TypeScript) | 3-4 hours | Phase A complete |
| Testing | 4-6 hours | Both phases |
| Documentation | 2-3 hours | Implementation complete |
| **Total** | **13-19 hours** | |

---

## Security Best Practices Summary

**Supabase Advisory 0011 - Search Path Injection:**
1. ✅ **ALWAYS** include `SET search_path = 'public'` for any function
2. ✅ Use fully qualified table names: `public.table_name`
3. ✅ Include comment documenting security per advisory 0011

**When to use SECURITY DEFINER:**
- ✅ Use when function needs elevated privileges (e.g., bypass RLS)
- ❌ Do NOT add to existing non-definer functions (behavior change, expands privileges)
- ❌ Do NOT use on views (use RLS instead)

**This Migration:**
- `get_schema_uid()` - NO SECURITY DEFINER (`attestation_schemas` has `USING (true)` - publicly readable)
- `get_user_checkin_streak()` - NO SECURITY DEFINER (match existing behavior)
- `has_checked_in_today()` - NO SECURITY DEFINER (match existing behavior)

**All functions in this migration use only `SET search_path = 'public'` without SECURITY DEFINER.**

## Implementation Notes

- **Existing Infrastructure:** System already has `attestation_schemas` with `schema_key` and `network` columns, `resolveSchemaUID()` function in network-resolver.ts, and proper indexes from migration 122
- **Network Context:** SQL functions use `c_network CONSTANT` internally; TS code passes network to resolver
- **Caching:** TypeScript resolver has 30s TTL cache; SQL has no cache but relies on PostgreSQL query planner + index
- **Schema Upgrades:** Design supports future schema upgrades - new row with same `(schema_key, network)` but different `schema_uid`; helper returns latest by `created_at DESC`
- **Function Arity:** Keep SAME function signatures `(text)` - adding optional parameters creates new overloads that won't be called
