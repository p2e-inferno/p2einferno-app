# Check-in API Parity Tests - Deep Audit & Findings

**Audit Date**: 2026-01-21
**Status**: 🔴 CRITICAL GAPS FOUND - Document is aspirational but incomplete

---

## Overview

The updated `checkin-api-parity-tests.md` document correctly identifies WHAT should be tested but has significant implementation gaps:
- ✅ Identifies correct response structure (xpEarned, newStreak)
- ✅ Lists all necessary test cases
- ❌ Missing implementation details for many test cases
- ❌ Doesn't specify HOW to calculate newStreak
- ❌ Doesn't explain activityData flow
- ❌ Test mocks are incomplete for several scenarios

---

## Test Case Audit

### Test 1: Happy Path ✅ CORRECT but INCOMPLETE IMPLEMENTATION

**Expected by document:**
```ts
{ success: true, xpEarned: 150, newStreak: expect.any(Number), attestationUid: null }
```

**What API currently returns (pages/api/checkin/index.ts:199-203):**
```ts
{ success: true, newXP: 150, attestationUid: null }  // ← WRONG field names, missing newStreak
```

**What hook expects (useDailyCheckin.ts:379-381):**
```ts
result.xpEarned  // ✓ hook uses this
result.newStreak // ✓ hook uses this (in toast message)
```

**Issue**: API needs 2 changes:
1. ✅ Rename `newXP` → `xpEarned` (simple field rename)
2. ❌ Calculate `newStreak` (HOW? Not specified in test document)

**Gap Analysis**:
- The RPC (`perform_daily_checkin`) only returns `new_xp`, NOT `new_streak`
- API needs to either:
  - Option A: Query streak table after RPC succeeds
  - Option B: Modify RPC to also return new_streak
  - Option C: Derive from profile's current_streak

The test document doesn't specify which approach or provide an implementation hint.

**Critical**: If API just returns `expect.any(Number)`, it could return wrong values:
- Could return previous streak (wrong)
- Could return 0 or 1 (wrong)
- Could return null/undefined (fails test)

**Recommendation**: Test should validate the VALUE, not just type:
```ts
// After successful check-in with xpAmount of 100:
// If user had streak of 5, newStreak should be 6
expect(json.newStreak).toBe(6);
```

---

### Test 2: Delegated Attestation ✅ CONCEPT CORRECT, ⚠️ NEEDS VERIFICATION

**What document expects**:
- `attestationSignature` provided
- `isEASEnabled()` returns true
- `createDelegatedAttestation` returns `{ success: true, uid: "0xuid", txHash: "0xtx" }`
- API builds `finalAttestation` and forwards to RPC
- Response includes attestationUid

**What API actually does (pages/api/checkin/index.ts:78-147)**:
```ts
if (isEASEnabled() && attestationSignature && !attestation) {
  const resolvedSchemaUid = await resolveSchemaUID("daily_checkin", resolvedNetwork);
  if (!resolvedSchemaUid) {
    log.warn("Daily check-in schema UID not configured, skipping attestation", {...});
  } else {
    const attestationResult = await createDelegatedAttestation({
      schemaUid: resolvedSchemaUid,
      recipient: attestationSignature.recipient,
      data: attestationSignature.data,
      signature: attestationSignature.signature,
      deadline: attestationSignature.deadline,
      chainId: attestationSignature.chainId,
      expirationTime: attestationSignature.expirationTime,
      revocable: attestationSignature.revocable,
      refUID: attestationSignature.refUID,
    });

    if (attestationResult.success && attestationResult.uid) {
      finalAttestation = {
        uid: attestationResult.uid,
        schemaUid: resolvedSchemaUid,
        attester: attestationSignature.attester,
        recipient: attestationSignature.recipient,
        data: { platform: "P2E Inferno Gasless", txHash: attestationResult.txHash },
        expirationTime: Number(attestationSignature.expirationTime),
      };
    } else {
      // Continue with check-in without attestation
    }
  }
}
```

**Gap**: The test doesn't verify that if `attestationSignature` has NO attester field, it still works:
- The code uses `attestationSignature.attester` at line 124
- But the test doesn't specify whether `attestationSignature` MUST have this field
- If missing, this will be `undefined` in finalAttestation

**Issue**: The mock setup in the document doesn't specify the full structure of `attestationSignature`:
```ts
// Document shows this but INCOMPLETE:
mockCreateDelegatedAttestation.mockResolvedValue({ success: true, uid: "0xuid" });
await runApi({ body: { userProfileId: "pid", xpAmount: 100, attestationSignature: delegatedPayload } });
// What's in delegatedPayload? Not specified!
```

**Recommendation**: Test should specify full attestationSignature structure:
```ts
const attestationSignature = {
  recipient: "0xuser",
  data: "0xencoded",
  signature: "0xsig",
  deadline: Math.floor(Date.now() / 1000) + 3600,
  chainId: 8453,
  expirationTime: Math.floor(Date.now() / 1000) + 86400,
  revocable: false,
  refUID: "0x",
  attester: "0xattester",  // ← API expects this at line 124
};
```

---

### Test 3: Activity Data Structure ⚠️ CRITICAL GAP - UNRESOLVED DESIGN DECISION

**Document says**:
> "The current hook only sends `{ greeting }`. For parity, the client must send full activity data or the API must compute it before calling the RPC."

**What document expects**:
```ts
const expectedActivity = {
  greeting: "GM",
  streak: 5,
  attestationUid: "0xuid",
  xpBreakdown: { totalXP: 100, baseXP: 50 },
  multiplier: 2,
  tierInfo: { name: "Silver" },
  activityType: "daily_checkin",
};
```

**What hook currently sends (useDailyCheckin.ts:371)**:
```ts
activityData: { greeting }  // ← Only greeting!
```

**What API currently passes to RPC (pages/api/checkin/index.ts:154)**:
```ts
p_activity_data: activityData || {}  // ← Just passes through whatever client sends
```

**What service builds before calling RPC (lib/checkin/core/service.ts:324-347)**:
```ts
const activityData = {
  greeting,
  streak: newStreak,
  attestationUid: attestationResult.attestationUid,
  xpBreakdown,           // ← Requires XPCalculatorStrategy
  multiplier,            // ← Requires MultiplierStrategy
  tierInfo: this.multiplierStrategy.getCurrentTier(newStreak),
  timestamp: new Date().toISOString(),
  activityType: "daily_checkin",
  attestation: { ... }   // ← Optional nested attestation object
};
```

**Critical Issue**: The document identifies the problem but DOESN'T SPECIFY THE SOLUTION:

**Option A: Hook pre-calculates**
- Pros: Keeps API stateless
- Cons: Hook needs multiplier strategy (doesn't have it currently)
- Cons: Multiple calculations/queries on client

**Option B: API calculates**
- Pros: Centralized logic
- Cons: API needs multiplier strategy dependency
- Cons: API needs to query streak table

**Option C: RPC takes full responsibility**
- Pros: Atomic operation
- Cons: Requires DB schema/procedure changes

**The test document assumes Option A** (client sends full data) but:
1. ❌ Doesn't explain how hook gets multiplier strategy
2. ❌ Doesn't provide hook implementation
3. ❌ Doesn't verify if hook has required dependencies

**Recommendation**: Document should either:
1. Add section "Implementation Strategy: How to Build Activity Data on Client"
2. Or specify "API must calculate using streak calculator dependency"
3. Or specify "RPC must handle this calculation"

---

### Test 4: Conflict Handling ✅ CORRECT

**Expected**: 409 with "Already checked in today"

**API does (pages/api/checkin/index.ts:174-176)**:
```ts
if (txData.conflict) {
  log.warn("Duplicate daily check-in detected by RPC", { userProfileId });
  return res.status(409).json({ error: "Already checked in today" });
}
```

**Hook validates (useDailyCheckin.ts:404-408)**:
```ts
const already = isAlreadyCheckedIn(result.error);
if (showToasts) {
  if (already) {
    toast("Already checked in today");
```

✅ **All aligned - no issues**

---

### Test 5: Authorization Guard ⚠️ INCOMPLETE TEST SETUP

**Expected**: 403 Forbidden when `privy_user_id` doesn't match

**API does (pages/api/checkin/index.ts:71-72)**:
```ts
if (profile.privy_user_id !== user.id) {
  return res.status(403).json({ error: "Forbidden" });
}
```

**Test description says**:
> "ensure `createAdminClient().from("user_profiles")...` returns a profile with `privy_user_id !== requestor` and `getPrivyUser` returns a different ID."

**Problem**: The test setup mock doesn't support this scenario. Current mock setup (line 32):
```ts
single: jest.fn().mockResolvedValue({
  data: { id: "profile-id", privy_user_id: "privy-123", wallet_address: "0xabc" }
})
```

This always returns the SAME privy_user_id. To test the 403 case, the mock needs to be reconfigurable:

**Needed setup**:
```ts
// First, mock getPrivyUser to return different ID
const mockGetPrivyUser = getPrivyUser as jest.MockedFunction<typeof getPrivyUser>;
mockGetPrivyUser.mockResolvedValue({ id: "different-privy-id" });

// Then mock profile query to return mismatched privy_user_id
const mockAdminClient = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn().mockResolvedValue({
          data: { id: "profile-id", privy_user_id: "privy-123", wallet_address: "0xabc" }
        })
      }))
    }))
  }))
};

jest.spyOn(supabaseServer, 'createAdminClient').mockReturnValue(mockAdminClient);
```

**Issue**: The document description is correct but the mock setup is incomplete.

---

### Test 6: RPC Failure ✅ CORRECT

**Expected**: 500 when RPC fails

**API does (pages/api/checkin/index.ts:162-172)**:
```ts
if (txErr || !txData) {
  log.error("perform_daily_checkin RPC failed", {...});
  return res.status(500).json({ error: "Failed to perform check-in" });
}
```

✅ **No issues**

---

### Test 7: Attestation Failure Graceful Degrade ⚠️ INCOMPLETE

**Expected**: API continues if attestation creation fails

**API does (pages/api/checkin/index.ts:132-139)**:
```ts
else {
  log.error("Failed to create delegated attestation", {...});
  // Continue with check-in without attestation (graceful degradation)
}
```

**Test says**:
> "verify `finalAttestation` stays `null` and the response still contains `attestationUid: null`"

**Problem**: No actual test code provided. The test case is just a description.

**Missing code coverage**:
1. ❌ When `createDelegatedAttestation` returns `{ success: false, error: "..." }`
2. ❌ When `createDelegatedAttestation` throws an exception (caught at line 140-146)
3. ❌ Verify check-in still succeeds despite attestation failure

**Recommendation**: Add actual test code:
```ts
// Test 7a: createDelegatedAttestation returns success: false
mockCreateDelegatedAttestation.mockResolvedValue({
  success: false,
  error: "Chain temporarily unavailable"
});
mockRpc.mockResolvedValueOnce({ data: { ok: true, conflict: false, new_xp: 150 } });
const { statusCode, json } = await runApi({ body: { userProfileId, xpAmount: 100, attestationSignature: payload } });
expect(statusCode).toBe(200);
expect(json.success).toBe(true);
expect(json.attestationUid).toBeNull();

// Test 7b: createDelegatedAttestation throws
mockCreateDelegatedAttestation.mockRejectedValue(new Error("Unexpected error"));
// Same expectations
```

---

### Test 8: Method Validation ✅ CORRECT

**Expected**: 405 for non-POST

**API does (pages/api/checkin/index.ts:17-19)**:
```ts
if (req.method !== "POST") {
  return res.status(405).json({ error: "Method not allowed" });
}
```

✅ **Correct**

---

### Test 9: Parameter Validation ⚠️ INCOMPLETE

**Expected**: 400 for missing/invalid parameters

**Sub-cases**:
1. **Missing userProfileId** ✅
   - API checks: `if (!userProfileId || typeof xpAmount !== "number")`
   - Returns: 400
2. **Missing xpAmount** ✅
   - Same check
   - Returns: 400
3. **Non-number xpAmount** ✅
   - Same check
   - Returns: 400
4. **ok=true but new_xp is null** ✅
   - API checks (line 187-193): `if (txData.new_xp == null)`
   - Returns: 500
5. **ok=false without conflict** ✅
   - API checks (line 179-185): `if (txData.ok === false)`
   - Returns: 500

**Problem**: No actual test code provided. Just descriptions.

**Missing edge cases**:
- Negative xpAmount? (Currently allowed by API)
- Zero xpAmount? (Currently allowed by API)
- Non-integer xpAmount? (JavaScript allows floats as numbers)
- xpAmount as extremely large number? (Could overflow DB integer)

**Recommendation**: Add validation logic and tests:
```ts
// Should API allow negative XP? Currently yes, but should it?
// Should API validate xpAmount >= 0?
// Should API validate xpAmount is integer?
// Should API validate xpAmount <= MAX_INT?
```

---

### Test 10-15: Error/Edge Cases ⚠️ MOSTLY DESCRIPTIONS, FEW CODE EXAMPLES

**Test 10: Profile not found** - Description only, no code
**Test 11: Unauthorized** - Description only, no code
**Test 12: Schema UID resolution failure** - Description only, no code
**Test 13: Attestation exception handling** - Description only, no code
**Test 14: Attestation signature shape** - Description only, ambiguous
**Test 15: Concurrent requests** - Description only, no code

**Issue**: The document provides test descriptions but doesn't provide actual test implementation code for most of these.

---

## Mock Setup Audit

The shared test setup (lines 16-40) has gaps:

**Current setup**:
```ts
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: { id: "profile-id", privy_user_id: "privy-123", wallet_address: "0xabc" }
    }),
    rpc: jest.fn(),
    maybeSingle: jest.fn(),
  }),
}));
```

**Problems**:
1. ❌ `rpc` is mocked but never configured - tests need to set up responses per test
2. ❌ The chain `.from().select().eq().single()` might not work - needs intermediate chaining verification
3. ❌ No mock for `getPrivyUser` - tests need this to vary the logged-in user
4. ❌ No mock for `isEASEnabled` - needs to toggle EAS on/off per test
5. ❌ No mock for `getDefaultNetworkName` - could affect schema resolution
6. ❌ Profile query doesn't support multiple scenarios (not found, mismatch privy_user_id, etc.)

**Recommendation**: Expand setup to be more flexible:
```ts
jest.mock("@/lib/auth/privy");
jest.mock("@/lib/attestation/core/config");
jest.mock("@/lib/attestation/core/network-config");

const mockGetPrivyUser = getPrivyUser as jest.MockedFunction<typeof getPrivyUser>;
const mockIsEASEnabled = isEASEnabled as jest.MockedFunction<typeof isEASEnabled>;
const mockRpc = jest.fn();

// Per-test configuration
beforeEach(() => {
  mockGetPrivyUser.mockResolvedValue({ id: "test-user-123" });
  mockIsEASEnabled.mockReturnValue(true);

  const mockAdminClient = {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { id: "profile-id", privy_user_id: "test-user-123", wallet_address: "0xabc" }
          })
        }))
      }))
    })),
    rpc: mockRpc,
  };

  jest.spyOn(supabaseServer, 'createAdminClient').mockReturnValue(mockAdminClient);
});
```

---

## Critical Unresolved Design Questions

### Q1: How should `newStreak` be calculated?

**Options**:
1. **Query streak table after RPC succeeds**
   ```ts
   const { data: streak } = await supabase
     .from("user_streaks")
     .select("current_streak")
     .eq("wallet_address", profile.wallet_address)
     .single();
   ```
   - Pro: Simple, can be done in API
   - Con: Extra DB query (performance)

2. **Modify RPC to return new_streak**
   ```ts
   const txData = { ok: true, conflict: false, new_xp: 150, new_streak: 6 };
   ```
   - Pro: Atomic, no extra query
   - Con: Requires DB schema change

3. **Calculate from profile.experience_points**
   ```ts
   // After RPC, re-fetch profile and use experience_points?
   ```
   - Pro: No extra table query
   - Con: Indirect calculation, might be wrong

**Document decision**: None of the above. Just says `expect.any(Number)`.

**Recommendation**: Document should specify one approach and provide implementation.

---

### Q2: How should activityData be built?

**Options**:
1. **Hook pre-builds before API call**
   - Hook needs: multiplier strategy, tier lookup (doesn't have currently)
   - Requires hook refactor

2. **API receives raw data, passes through**
   - Matches document's test case #3
   - But hook currently doesn't send full data
   - Requires hook to be updated to compute values

3. **API computes from database/config**
   - API needs dependencies (multiplier strategy)
   - Requires API enhancement
   - Requires dependencies injection

**Document decision**: "Client must send full activity data or API must compute it" (ambiguous)

**Recommendation**: Document should specify one approach with code example.

---

### Q3: Should API validate attestationSignature fields?

**Current behavior** (pages/api/checkin/index.ts):
- No validation
- If `attestationSignature.attester` is missing, it's `undefined` in finalAttestation
- No error thrown

**Test 14 says**: "API should either reject with `400` (if validation is added) or log and continue; define expected behavior before porting."

**Problem**: The behavior is not defined yet.

**Recommendation**: Document should specify:
- Which fields are required?
- What happens if missing?
- Should API validate or just pass through?

---

## Test Coverage Summary

| Test # | Name | Status | Issues |
|--------|------|--------|--------|
| 1 | Happy path | ⚠️ Partial | newStreak calculation HOW not specified |
| 2 | Delegated attestation | ⚠️ Partial | attestationSignature structure incomplete |
| 3 | Activity data | ❌ Critical gap | Design decision (who builds?) not made |
| 4 | Conflict | ✅ Complete | No issues |
| 5 | Authorization | ⚠️ Partial | Mock setup incomplete |
| 6 | RPC failure | ✅ Complete | No issues |
| 7 | Attestation degrade | ⚠️ Incomplete | No actual test code |
| 8 | Method validation | ✅ Complete | No issues |
| 9 | Parameter validation | ⚠️ Incomplete | Edge cases not defined |
| 10 | Profile not found | ❌ Description only | No test code |
| 11 | Unauthorized | ❌ Description only | No test code |
| 12 | Schema UID failure | ❌ Description only | No test code |
| 13 | Attestation exception | ❌ Description only | No test code |
| 14 | Attestation signature | ❌ Ambiguous | Behavior not defined |
| 15 | Concurrent requests | ❌ Description only | No test code |

**Overall Coverage**: ~40% (some descriptions, few complete implementations)

---

## Hook Integration Issues

### Current Hook Behavior (useDailyCheckin.ts)

**Line 363-374**:
```ts
const result = await fetch("/api/checkin", {
  method: "POST",
  body: JSON.stringify({
    userProfileId,
    xpAmount,
    activityData: { greeting },    // ← ONLY greeting!
    attestationSignature,
  }),
}).then(res => res.json());
```

**Line 376-388**:
```ts
if (result.success) {
  log.info("Daily checkin successful", {
    userAddress,
    xpEarned: result.xpEarned,     // ← Hook expects this
    newStreak: result.newStreak,    // ← Hook expects this
    attestationUid: result.attestationUid,
  });

  if (showToasts) {
    toast.success(
      `Daily check-in complete! +${result.xpEarned} XP (Streak: ${result.newStreak} days)`
    );
  }
```

### Mismatch Between Hook and API

| Field | Hook Expects | API Returns | Status |
|-------|--------------|-------------|--------|
| `success` | ✓ boolean | ✓ boolean | ✅ Match |
| `xpEarned` | ✓ used | ✗ sends `newXP` | ❌ Mismatch |
| `newStreak` | ✓ used in toast | ✗ not sent | ❌ Missing |
| `attestationUid` | ✓ used | ✓ sent | ✅ Match |
| `error` | ✓ used on failure | ✓ sent on error | ✅ Match |

### Hook activityData Issue

Hook only sends `{ greeting }` but test expects full data with:
- streak
- xpBreakdown
- multiplier
- tierInfo

**This means**: Either:
1. The hook needs to be updated to compute these values, OR
2. The test case is aspirational (not achievable with current hook)

---

## Recommendations - Implementation Order

### Phase 1: Fix Critical API Issues (MUST DO)

**1.1 Rename response field**
```ts
// pages/api/checkin/index.ts line 201
- newXP,
+ xpEarned: newXP,
```

**1.2 Add newStreak calculation**
```ts
// After RPC succeeds, add:
const { data: streakData } = await supabase
  .from("user_streaks")
  .select("current_streak")
  .eq("wallet_address", profile.wallet_address)
  .single();

const newStreak = (streakData?.current_streak || 0) + 1;

// Then return:
return res.status(200).json({
  success: true,
  xpEarned: newXP,
  newStreak,
  attestationUid: finalAttestation?.uid || null,
});
```

### Phase 2: Make Design Decisions (MUST DO)

**2.1 Activity Data Strategy**
- [ ] Decide: Client builds vs API builds vs RPC handles
- [ ] Document decision in test document
- [ ] Add code example to guide implementation

**2.2 Attestation Signature Validation**
- [ ] Define required fields
- [ ] Define error behavior (400 or continue?)
- [ ] Add validation code to API or document that validation is intentionally skipped

**2.3 XP Amount Validation**
- [ ] Define allowed range (negative? zero? max?)
- [ ] Add validation to API or document why open-ended
- [ ] Add test cases for edge values

### Phase 3: Complete Test Implementation (MUST DO)

**3.1 Add test code for description-only cases**
- Tests 10-15 currently lack actual test code
- Add complete Jest test blocks with assertions

**3.2 Enhance mock setup**
- Make RPC configurable per test
- Add getPrivyUser mock
- Add isEASEnabled mock
- Support multiple profile scenarios (not found, unauthorized, etc.)

**3.3 Add value validation tests**
- Don't just check `expect.any(Number)` for streak
- Verify streak increments correctly
- Verify XP calculations are correct

### Phase 4: Update Hook (MUST DO)

**4.1 Build full activityData before API call**
```ts
// Pre-calculate activity metadata
const currentStreak = await checkinService.getCheckinPreview(userAddress);
const multiplier = checkinService.getCurrentMultiplier(currentStreak.nextStreak);
const tier = checkinService.getCurrentTier(currentStreak.nextStreak);

const activityData = {
  greeting,
  streak: currentStreak.nextStreak,
  xpBreakdown: currentStreak.breakdown,
  multiplier,
  tierInfo: tier,
};

// Then call API with full data
const result = await fetch("/api/checkin", {
  body: JSON.stringify({
    userProfileId,
    xpAmount,
    activityData,  // Now complete
    attestationSignature,
  }),
});
```

---

## Regression Prevention Checklist

- [ ] Test verifies API returns exact response structure (not just field presence)
- [ ] Test verifies newStreak is incremented correctly (not just any number)
- [ ] Test verifies full activityData is passed to RPC, not filtered
- [ ] Test verifies attestation fields are all forwarded correctly
- [ ] Test verifies each error code is returned for correct scenario
- [ ] Test verifies error messages match expectation
- [ ] Test verifies graceful degradation (attestation failure doesn't break checkin)
- [ ] Test verifies concurrent requests handled correctly by DB
- [ ] Test verifies mock setup supports all test scenarios
- [ ] Test verifies hook receives correct response structure
- [ ] Test verifies hook displays correct toast messages
- [ ] Integration test verifies end-to-end flow (not just API in isolation)

---

## Conclusion

The updated `checkin-api-parity-tests.md` is **aspirational but incomplete**:

**Strengths**:
- ✅ Identifies all necessary test cases
- ✅ Acknowledges data flow gaps
- ✅ Updates expected response structure
- ✅ Adds regression checklist

**Weaknesses**:
- ❌ Many test cases lack actual test code
- ❌ Design decisions are unresolved
- ❌ Mock setup incomplete for all scenarios
- ❌ newStreak calculation strategy not specified
- ❌ activityData responsibility not assigned
- ❌ Doesn't guide implementation
- ❌ Hook integration issues not addressed

**Before implementation can start**:
1. ✅ Make and document design decisions (Activity data strategy, etc.)
2. ✅ Add complete test code for all 15 test cases
3. ✅ Enhance mock setup for flexibility
4. ✅ Update hook to build full activity data
5. ✅ Implement newStreak calculation in API
6. ✅ Verify all response fields match expectations

**Estimated implementation effort**: 6-8 hours for API + hook changes + comprehensive tests

**Risk if skipped**: Tests will fail or pass incorrectly; parity will not be achieved; bugs will reach production.
