# Check-in API Parity - Implementation Guide

**Objective**: Achieve true API parity with the service layer while avoiding regression and scope creep.

**Status**: ✅ Ready for implementation

---

## Executive Summary

The service layer already has **everything working correctly**. The API just needs to **reuse the existing strategies** to mirror the service's behavior exactly.

**Three documents define the full scope**:

1. **[checkin-service-vs-api-parity.md](checkin-service-vs-api-parity.md)** - Analysis of what the service does vs what the API currently does
2. **[api-dependency-reuse-guide.md](api-dependency-reuse-guide.md)** - How to reuse dependencies without duplication
3. **[checkin-api-parity-tests.md](checkin-api-parity-tests.md)** - What tests must pass

**Key Finding**: This is **NOT scope creep**. It's **reusing existing components** for parity.

---

## What Needs to Happen

### Current State (Broken)

The API is a **pass-through** without calculations:
```ts
// API receives from client:
{
  userProfileId,
  xpAmount,        // ← Client provides (service calculates)
  activityData: { greeting }  // ← Incomplete (service builds full object)
}

// API returns:
{
  success: true,
  newXP: 150,      // ← Wrong field name
  attestationUid: null,
  // Missing: newStreak, breakdown
}
```

**Problem**: Hook can't display streak because API doesn't return it.

### Target State (Fixed via Reuse)

The API should **mirror the service** using reused dependencies:
```ts
// API calculates using reused strategies:
const currentStreak = await streakCalculator.calculateStreak(userAddress);
const newStreak = currentStreak + 1;
const multiplier = multiplierStrategy.calculateMultiplier(newStreak);
const xpBreakdown = xpCalculator.calculateXPBreakdown(newStreak, multiplier);

// API builds complete activity data:
const activityData = {
  greeting,
  streak: newStreak,
  xpBreakdown,
  multiplier,
  tierInfo: multiplierStrategy.getCurrentTier(newStreak),
  // ... full data
}

// API returns proper response:
{
  success: true,
  xpEarned: xpBreakdown.totalXP,      // ← Calculated
  newStreak,                           // ← Calculated
  attestationUid: finalAttestation?.uid || null,
  breakdown: xpBreakdown,
}
```

**Result**: Hook receives correct response matching `CheckinResult` type.

---

## Implementation Steps

### Phase 1: Create Reusable Strategy Helpers (2 hours)

**File**: Create `lib/checkin/api/strategies.ts`

```ts
// Extract strategies from factory once at module load
export function getCheckInStrategies() {
  // Returns cached instances of:
  // - streakCalculator
  // - multiplierStrategy
  // - xpCalculator
}

// Helper to calculate XP
export async function calculateCheckinXP(userAddress: string) {
  // Returns: { xpBreakdown, newStreak, multiplier, tierInfo }
}

// Helper to build activity data
export function buildActivityData(...) {
  // Returns complete activity data object
}
```

**Why this approach**:
- ✅ No code duplication (reuses factory)
- ✅ Easy to test (pure functions)
- ✅ Cacheable at module level (performance)
- ✅ Reusable across endpoints

**Important correction**: `CheckinServiceFactory.createStreakCalculator/createMultiplierStrategy/createXPCalculator` are **private** in `lib/checkin/core/schemas.ts`, so you cannot call them from the API without unsafe type casting. The simplest “pure reuse” approach is to reuse the service’s **public methods** (`getCheckinPreview`, `canCheckinToday`, `getCurrentTier`) to compute the same values without touching private internals.

### Phase 2: Update API Endpoint (1.5 hours)

**File**: Update `pages/api/checkin/index.ts`

**Changes**:
1. Import reuse helpers
2. Use `calculateCheckinXP()` to get calculated values
3. Use `buildActivityData()` to construct activity object
4. Pass **calculated** xpAmount to RPC (not client input)
5. Pass **enriched** activityData to RPC (not just `{ greeting }`)
6. Return **proper response** with all fields
7. **Pre-check eligibility before delegated attestation** to avoid wasting server gas on a check-in that will 409.
8. **Bind delegated attestations to the profile wallet**: require `attestationSignature.recipient === profile.wallet_address` (and ideally `attester` matches too) so a user cannot update one profile while minting attestations for a different wallet.

**Before**:
```ts
const txResp = await supabase.rpc("perform_daily_checkin", {
  p_xp_amount: xpAmount,              // ← From client input
  p_activity_data: activityData || {},  // ← Incomplete
});

return {
  success: true,
  newXP,  // ← Wrong field
  attestationUid: ...,
};
```

**After**:
```ts
const { xpBreakdown, newStreak, multiplier, tierInfo } =
  await calculateCheckinXP(profile.wallet_address);

const enrichedActivityData = buildActivityData(
  activityData?.greeting,
  newStreak,
  xpBreakdown,
  multiplier,
  tierInfo,
);

const txResp = await supabase.rpc("perform_daily_checkin", {
  p_xp_amount: xpBreakdown.totalXP,    // ← CALCULATED
  p_activity_data: enrichedActivityData,  // ← ENRICHED
});

return {
  success: true,
  xpEarned: xpBreakdown.totalXP,      // ← Correct field
  newStreak,                           // ← CALCULATED
  attestationUid: finalAttestation?.uid || null,
  breakdown: xpBreakdown,
};
```

### Phase 3: Verify Parity with Tests (2 hours)

**Update**: `__tests__/api/checkin-parity.test.ts` (create if needed)

**Test cases to implement** (from checkin-api-parity-tests.md):

1. ✅ Happy path - API returns calculated values
2. ✅ Delegated attestation - Full attestation object passed
3. ✅ Activity data - Complete metadata passed to RPC
4. ✅ Conflict handling - Returns 409 correctly
5. ✅ Authorization - 403 on privy_user_id mismatch
6. ✅ RPC failure - Returns 500
7. ✅ Attestation degrade - Continues on failure
8. ✅ Method validation - 405 for non-POST
9. ✅ Parameter validation - 400 for missing fields
10. ✅ Profile not found - 404
11. ✅ Unauthorized - 401
12. ✅ Schema UID failure - Graceful skip
13. ✅ Attestation exception - Graceful catch
14. ✅ Concurrent requests - One succeeds, one gets 409

### Phase 4: Update Hook to Use Correct Field Names (0.5 hours)

**File**: `hooks/checkin/useDailyCheckin.ts` (line 379)

**Current**:
```ts
log.info("Daily checkin successful", {
  userAddress,
  xpEarned: result.xpEarned,    // ← API now returns this
  newStreak: result.newStreak,  // ← API now returns this
  attestationUid: result.attestationUid,
});
```

No changes needed if response is correct! ✅

### Phase 5: Regression Testing (1 hour)

**Verify service behavior matches API**:

```ts
// Test: Service and API return identical results
const serviceResult = await checkinService.performCheckin(
  userAddress,
  userProfileId,
  "GM",
  wallet,
);

const apiResult = await fetch("/api/checkin", {
  method: "POST",
  body: JSON.stringify({
    userProfileId,
    xpAmount: undefined,  // ← API calculates this
    activityData: { greeting: "GM" },
  }),
});

expect(apiResult.xpEarned).toBe(serviceResult.xpEarned);
expect(apiResult.newStreak).toBe(serviceResult.newStreak);
expect(apiResult.attestationUid).toBe(serviceResult.attestationUid);
```

---

## Files to Create/Update

### New Files
- [ ] `lib/checkin/api/strategies.ts` - Reuse helpers

### Updated Files
- [ ] `pages/api/checkin/index.ts` - Use reused strategies
- [ ] `__tests__/api/checkin-parity.test.ts` - Add comprehensive tests
- [ ] `docs/checkin-api-parity-tests.md` - Add actual test code (already updated)

### No Changes Needed
- ✅ `lib/checkin/core/service.ts` - Already correct
- ✅ `lib/checkin/core/schemas.ts` - Factory already exists
- ✅ `hooks/checkin/useDailyCheckin.ts` - Will work with fixed API

---

## Dependency Injection Strategy

### How to Reuse (NOT Recreate)

```ts
// ✅ GOOD: Reuse the service’s public methods to compute parity values
import { getDefaultCheckinService } from "@/lib/checkin";

const service = getDefaultCheckinService();
const preview = await service.getCheckinPreview(userAddress);
const newStreak = preview.nextStreak;
const xpBreakdown = preview.breakdown;
const tierInfo = service.getCurrentTier(newStreak);

// ❌ BAD: Don't recreate the logic
// const newStreak = currentStreak + 1; // ← Already done in service
// const multiplier = calcMultiplierFromStreak(newStreak); // ← Don't duplicate
```

### Cache Pattern (Module Level)

```ts
// strategies.ts

let cachedStrategies = null;

export function getCheckInStrategies() {
  if (!cachedStrategies) {
    // Create once on first call
    const config = getEnvironmentConfig();
    cachedStrategies = {
      streakCalculator: CheckinServiceFactory["createStreakCalculator"](config.streak),
      multiplierStrategy: CheckinServiceFactory["createMultiplierStrategy"](config.multiplier),
      xpCalculator: CheckinServiceFactory["createXPCalculator"](config.xp),
    };
  }
  return cachedStrategies;
}
```

**Why**:
- Creates strategies once per server start
- No per-request overhead
- Same as service singleton pattern

---

## Response Structure Validation

### Required CheckinResult Type

From `lib/checkin/core/types.ts`:

```ts
export interface CheckinResult {
  success: boolean;
  xpEarned: number;        // ← MUST be "xpEarned", not "newXP"
  newStreak: number;       // ← MUST be returned
  attestationUid?: string;
  error?: string;
  breakdown?: XPBreakdown;
}
```

### Validation Test

```ts
// API response must pass this validation
expect(response).toMatchObject({
  success: true,
  xpEarned: expect.any(Number),
  newStreak: expect.any(Number),
  attestationUid: expect.any(String) || null,
  breakdown: {
    baseXP: expect.any(Number),
    streakBonus: expect.any(Number),
    multiplier: expect.any(Number),
    totalXP: expect.any(Number),
  },
});
```

---

## Activity Data Structure

### What RPC Expects

From service (`lib/checkin/core/service.ts:324-347`):

```ts
{
  greeting: "GM",
  streak: 6,                    // ← Current streak + 1
  attestationUid: "0xuid" || undefined,
  xpBreakdown: {
    baseXP: 10,
    streakBonus: 30,
    multiplier: 1.5,
    totalXP: 60,
  },
  multiplier: 1.5,              // ← Tier multiplier
  tierInfo: { name: "Silver" }, // ← Current tier
  timestamp: "2026-01-21T...",
  activityType: "daily_checkin",
}
```

### What Hook Sends (Current)

```ts
activityData: { greeting }  // ← INCOMPLETE
```

### What Must Be Sent (After Fix)
For true parity and regression safety, the **API should compute** this enriched activity data server-side (so the client can remain minimal and cannot spoof XP or streak), then pass it to `perform_daily_checkin`.

```ts
activityData: {
  greeting,
  streak,
  xpBreakdown,
  multiplier,
  tierInfo,
  // ... other fields
}
```

---

## Parity Verification Checklist

### API Calculations
- [ ] Streak calculated correctly
- [ ] Multiplier calculated correctly
- [ ] XP breakdown matches service logic
- [ ] Tier information correct

### Response Structure
- [ ] `success` field present
- [ ] `xpEarned` field (not `newXP`)
- [ ] `newStreak` field
- [ ] `attestationUid` field
- [ ] `breakdown` field included
- [ ] `error` field on failure

### Activity Data
- [ ] `greeting` included
- [ ] `streak` included and correct
- [ ] `xpBreakdown` complete
- [ ] `multiplier` included
- [ ] `tierInfo` included
- [ ] `attestationUid` included
- [ ] `timestamp` included
- [ ] `activityType` included

### Error Handling
- [ ] 401 Unauthorized (no user)
- [ ] 403 Forbidden (privy_user_id mismatch)
- [ ] 404 Profile not found
- [ ] 405 Method not allowed
- [ ] 400 Missing parameters
- [ ] 409 Conflict (duplicate check-in)
- [ ] 500 RPC failure
- [ ] 500 on graceful attestation failure

### Test Coverage
- [ ] 15 test cases implemented
- [ ] Mock setup flexible
- [ ] All scenarios testable
- [ ] Hook integration verified

---

## Effort Estimate

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Create strategy helpers | 2 hours |
| 2 | Update API endpoint | 1.5 hours |
| 3 | Implement tests | 2 hours |
| 4 | Update hook (if needed) | 0.5 hours |
| 5 | Regression testing | 1 hour |
| **Total** | | **7 hours** |

### What's NOT Included
- ❌ Creating new calculation logic (service already has it)
- ❌ Database schema changes (RPC already works)
- ❌ New features beyond parity
- ❌ Refactoring service layer

---

## Risk Assessment

### Low Risk ✅
- Reusing proven factory pattern
- No new dependencies
- No database changes
- Aligns with existing architecture

### What Could Go Wrong ❌
- API returns wrong field names → **Test catches this**
- Activity data incomplete → **Test verifies payload**
- Streak not calculated → **Test validates values**
- Response misses fields → **Type checking catches this**

### Mitigation
- ✅ Run all 15 test cases before merging
- ✅ Compare service vs API results in regression tests
- ✅ Use TypeScript types to catch field mismatches
- ✅ Run integration test (service + API side-by-side)

---

## Success Criteria

### Must Have
- ✅ API returns `xpEarned` field (not `newXP`)
- ✅ API returns `newStreak` field
- ✅ API returns `breakdown` field
- ✅ Response matches `CheckinResult` type
- ✅ Complete activityData passed to RPC
- ✅ All 15 test cases pass
- ✅ Hook displays streak in toast

### Should Have
- ✅ No code duplication (reuse strategies)
- ✅ Comprehensive error handling
- ✅ Clear logging for debugging
- ✅ Regression tests pass

### Nice to Have
- ✅ Performance optimization (caching)
- ✅ Helper functions for reuse
- ✅ Clear documentation

---

## Next Steps

1. **Review this guide** with team
2. **Create `lib/checkin/api/strategies.ts`** with helpers
3. **Update `pages/api/checkin/index.ts`** to use helpers
4. **Implement `__tests__/api/checkin-parity.test.ts`** with all 15 test cases
5. **Verify response structure** matches CheckinResult type
6. **Run regression tests** (service vs API comparison)
7. **Merge when all tests pass**

---

## Key Principle

**This is NOT inventing new features.**

**This is reusing existing, proven components to achieve parity.**

- Service has streak calculation ✅ → API reuses it
- Service has multiplier strategy ✅ → API reuses it
- Service has XP calculator ✅ → API reuses it
- Service has activity data building ✅ → API reuses it

**Result**: True parity, zero regression, minimal code.

---

## References

- **Service Implementation**: `lib/checkin/core/service.ts` (performCheckin method)
- **Factory Pattern**: `lib/checkin/core/schemas.ts` (CheckinServiceFactory)
- **Hook Usage**: `hooks/checkin/useDailyCheckin.ts` (performCheckin hook)
- **Test Specifications**: `docs/checkin-api-parity-tests.md`
- **Reuse Strategy**: `docs/api-dependency-reuse-guide.md`
- **Parity Analysis**: `docs/checkin-service-vs-api-parity.md`

---

## Questions?

**Q: Is this scope creep?**
A: No. Service already does everything correctly. API just reuses the components.

**Q: Will this introduce new bugs?**
A: No. We're reusing tested code, not creating new logic.

**Q: How much code duplication?**
A: None. Pure reuse via factory pattern.

**Q: Can we simplify further?**
A: This is already the simplest approach that achieves parity.

**Q: What about performance?**
A: Strategies cached at module level, same as service.

---

**Status**: ✅ Ready to implement

**Decision**: Use **Option 3 (Strategy Helpers)** from reuse guide for cleanest approach.
