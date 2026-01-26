# Check-in API Parity Tests - Comprehensive Review

**Status**: ⚠️ CRITICAL ISSUES FOUND
**Date**: 2026-01-21

## Executive Summary

The parity test document defines a solid strategy but has **several critical gaps and inconsistencies** that will prevent achieving true feature parity when porting to the API endpoint approach. The primary issues center around **response payload mismatches**, **missing data transformations**, and **incomplete test coverage** of edge cases.

---

## 1. CRITICAL ISSUES - Must Fix Before Implementation

### 1.1 Response Payload Mismatch ⚠️ CRITICAL

**Issue**: The API response structure doesn't match the expected `CheckinResult` type that the hook requires.

| Field | Expected (CheckinResult) | API Returns | Hook Expects |
|-------|--------------------------|------------|--------------|
| `success` | ✓ boolean | ✓ | ✓ |
| `xpEarned` | ✓ number | ✗ (uses `newXP` instead) | ✓ |
| `newStreak` | ✓ number | ✗ MISSING | ✓ |
| `attestationUid` | ✓ string\|null | ✓ | ✓ (displays in toast) |
| `breakdown` | ✓ XPBreakdown (optional) | ✗ MISSING | ✗ (not used in hook) |
| `error` | ✓ string (optional) | ✓ (only in error responses) | ✓ |

**Impact**: The hook at [useDailyCheckin.ts:379-381](hooks/checkin/useDailyCheckin.ts#L379-L381) expects to read `result.newStreak` for the toast message:
```ts
toast.success(`Daily check-in complete! +${result.xpEarned} XP (Streak: ${result.newStreak} days)`);
```

Currently this will fail with `undefined` values.

**Fix Required**:
- Rename `newXP` to `xpEarned` in API response
- Calculate and return `newStreak` in API response
- ⚠️ The RPC `perform_daily_checkin` only returns `new_xp`, NOT the new streak
  - Option A: Fetch streak data separately after RPC succeeds
  - Option B: Modify RPC to also return `new_streak`
  - Option C: Have the client calculate it from `new_xp` (risky)

**Test Case to Add**:
```ts
// Test: Response structure matches CheckinResult type
expect(result).toEqual({
  success: expect.any(Boolean),
  xpEarned: expect.any(Number),  // NOT newXP
  newStreak: expect.any(Number), // REQUIRED
  attestationUid: expect.any(String) || null,
  // error field only present on failure
});
```

---

### 1.2 Missing Streak Calculation in API ⚠️ CRITICAL

**Issue**: The API has no mechanism to determine the `newStreak` value to return.

**Current Code** (pages/api/checkin/index.ts):
```ts
return res.status(200).json({
  success: true,
  newXP,           // ← from RPC
  attestationUid: finalAttestation?.uid || null,
  // newStreak: ??? ← MISSING
});
```

**Why This Matters**:
- The service calculates `newStreak = currentStreak + 1` (lib/checkin/core/service.ts:235)
- The RPC doesn't return streak data
- Without this, the hook's toast will show undefined streak
- Clients need streak info for UI state management (displays in checkin card, etc.)

**Options**:
1. **Query streak table after RPC** (Recommended for API simplicity)
   ```ts
   // After RPC succeeds, fetch current streak
   const { data: streakData } = await supabase
     .from("user_streaks")
     .select("current_streak")
     .eq("wallet_address", profile.wallet_address)
     .single();
   const newStreak = streakData?.current_streak || 1;
   ```

2. **Modify RPC to return new_streak** (Better for atomicity)
   - Coordinate with DB team to update stored procedure

3. **Client-side calculation** (Not recommended)
   - Client would need to call streak calculator after API responds
   - Adds round-trip and increases complexity

---

### 1.3 Incomplete Activity Data Construction ⚠️ CRITICAL

**Issue**: The API doesn't construct rich activity data for logging/analytics, causing data loss.

**Test Case #3 Gap**: The test expects full activity data passed to RPC:
```ts
const expectedActivity = {
  greeting: "GM",
  streak: 5,              // ← Where does this come from?
  attestationUid: "0xuid",
  xpBreakdown: { totalXP: 100, baseXP: 50 },  // ← API doesn't calculate this
  multiplier: 2,          // ← API doesn't have multiplier data
  tierInfo: { name: "Silver" },  // ← API doesn't have tier info
  activityType: "daily_checkin",
};
```

**Current API Reality** (pages/api/checkin/index.ts:154):
```ts
p_activity_data: activityData || {}  // ← Just passes what client sends
```

**Current Hook Reality** (hooks/checkin/useDailyCheckin.ts:371):
```ts
activityData: { greeting },  // ← Only greeting sent!
```

**Problem**: The API lacks:
- Streak calculation → can't pass `streak` field
- Multiplier calculation → can't pass `multiplier` field
- Tier lookup → can't pass `tierInfo` field
- XP breakdown details → can't pass `xpBreakdown`

**For True Parity**: The API needs to calculate these or the service needs to pre-calculate and send them.

**Fix Strategy**:
1. **Option A** (Recommended): Client pre-calculates and sends full activityData
   ```ts
   // In hook's performCheckin()
   const currentStreak = await checkinService.getCheckinStatus(userAddress);
   const multiplier = checkinService.getCurrentMultiplier(currentStreak);
   const tier = checkinService.getCurrentTier(currentStreak);
   // ...then send full activityData to API
   ```

2. **Option B**: API calculates on-the-fly (adds complexity)
   - Would need streak calculator dependency
   - Would need multiplier strategy dependency
   - Would need tier lookup

**Test Case to Add**:
```ts
// Verify full activity data is passed
mockRpc.mockResolvedValueOnce({ data: { ok: true, conflict: false, new_xp: 150 } });
await runApi({
  body: {
    userProfileId,
    xpAmount: 100,
    activityData: {
      greeting: "GM",
      streak: 5,
      xpBreakdown: { baseXP: 50, streakBonus: 50, multiplier: 1, totalXP: 100 },
      multiplier: 1,
      tierInfo: { name: "Bronze" },
    },
  },
});
expect(mockRpc).toHaveBeenCalledWith(
  "perform_daily_checkin",
  expect.objectContaining({
    p_activity_data: expect.objectContaining({
      streak: 5,
      xpBreakdown: expect.any(Object),
      multiplier: expect.any(Number),
    }),
  })
);
```

---

## 2. SIGNIFICANT ISSUES - Should Fix for Completeness

### 2.1 Attestation Signature Interface Not Defined

**Issue**: The type `DelegatedAttestationCheckinSignature` is imported but not clearly defined in available code.

**API Expects** (pages/api/checkin/index.ts:101-111):
```ts
await createDelegatedAttestation({
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
```

**Test Gap**: The test setup doesn't verify all these fields are present in the signature object.

**Fix**: Add test case verifying signature structure:
```ts
// Test: Delegated attestation signature contains all required fields
const delegatedPayload = {
  recipient: "0xuser",
  data: encodedData,
  signature: "0x...",
  deadline: Math.floor(Date.now() / 1000) + 3600,
  chainId: 8453,
  expirationTime: Math.floor(Date.now() / 1000) + 86400,
  revocable: false,
  refUID: "0x",
  attester: "0xattester",
};
```

---

### 2.2 Missing Error Response Consistency Tests

**Issue**: Tests don't verify error response structure consistency.

**Current Tests Cover**:
- ✓ 401 Unauthorized
- ✓ 403 Forbidden
- ✓ 404 Profile not found
- ✓ 405 Method not allowed (implied)
- ✓ 409 Conflict
- ✓ 500 RPC failure

**Missing Tests**:
- ❌ 400 Missing required fields
- ❌ 400 Invalid xpAmount (negative, non-number)
- ❌ 500 new_xp is null despite ok=true
- ❌ 500 ok=false without conflict
- ❌ Error response structure (all errors should have `{ error: string }`)

**Test Cases to Add**:
```ts
// Test: Missing userProfileId
expect((await runApi({ body: { xpAmount: 100 } })).statusCode).toBe(400);

// Test: Missing xpAmount
expect((await runApi({ body: { userProfileId: "pid" } })).statusCode).toBe(400);

// Test: Invalid xpAmount type
expect((await runApi({ body: { userProfileId: "pid", xpAmount: "not-a-number" } })).statusCode).toBe(400);

// Test: RPC ok=true but new_xp is null
mockRpc.mockResolvedValueOnce({ data: { ok: true, conflict: false, new_xp: null } });
expect((await runApi({ body: { userProfileId: "pid", xpAmount: 100 } })).statusCode).toBe(500);

// Test: RPC ok=false but conflict=false
mockRpc.mockResolvedValueOnce({ data: { ok: false, conflict: false, new_xp: null } });
expect((await runApi({ body: { userProfileId: "pid", xpAmount: 100 } })).statusCode).toBe(500);
```

---

### 2.3 Schema UID Resolution Not Fully Tested

**Issue**: Test doesn't cover scenario where `resolveSchemaUID` returns null/falsy.

**Current Code** (pages/api/checkin/index.ts:92-99):
```ts
if (!resolvedSchemaUid) {
  log.warn("Daily check-in schema UID not configured, skipping attestation", {...});
  // Continue with finalAttestation = null
}
```

**Test Gap**: Should verify that check-in succeeds even when schema UID can't be resolved.

**Test Case to Add**:
```ts
// Test: Check-in succeeds when schema UID not configured
mockResolveSchemaUID.mockResolvedValue(null);
mockRpc.mockResolvedValueOnce({ data: { ok: true, conflict: false, new_xp: 150 } });
const { statusCode, json } = await runApi({ body: { userProfileId, xpAmount: 100, attestationSignature: payload } });
expect(statusCode).toBe(200);
expect(json).toEqual({ success: true, newXP: 150, attestationUid: null });
// Verify attestation creation was skipped
expect(mockCreateDelegatedAttestation).not.toHaveBeenCalled();
```

---

### 2.4 Weak Test for Attestation Creation Failure

**Issue**: Test #7 doesn't fully verify graceful degradation behavior.

**Current Test #7**:
```ts
// Test: Attestation creation failure (graceful degrade)
createDelegatedAttestation resolves with { success: false, error: "chain down" }
// Expect: API continues and returns success
```

**Test Gaps**:
- Doesn't verify what happens to `finalAttestation` (should be null)
- Doesn't verify check-in still succeeds (not just attestation fails)
- Doesn't test exception during attestation (only `success: false`)

**Improved Test Cases**:
```ts
// Test: Attestation creation returns success: false
mockCreateDelegatedAttestation.mockResolvedValue({ success: false, error: "Chain unreachable" });
const { statusCode, json } = await runApi({ ... });
expect(statusCode).toBe(200);
expect(json.attestationUid).toBeNull();
expect(mockRpc).toHaveBeenCalledWith("perform_daily_checkin", expect.objectContaining({ p_attestation: null }));

// Test: Attestation creation throws exception
mockCreateDelegatedAttestation.mockRejectedValue(new Error("Unexpected error"));
const { statusCode, json } = await runApi({ ... });
expect(statusCode).toBe(200); // Still succeeds
expect(json.attestationUid).toBeNull();
```

---

### 2.5 Authorization Check Incomplete

**Issue**: Test #5 doesn't fully specify the mock setup.

**Current Test #5**:
```ts
// "Ensure createAdminClient().from("user_profiles")... returns a profile with privy_user_id !== requestor"
```

**Problem**: The mock setup in the preamble doesn't handle this scenario. The current mock returns:
```ts
single: jest.fn().mockResolvedValue({
  data: { id: "profile-id", privy_user_id: "privy-123", wallet_address: "0xabc" }
})
```

But for the 403 test, it needs to return a different privy_user_id than the mocked user.

**Clearer Test Case**:
```ts
// Test: Authorization - privy_user_id mismatch
const mockGetPrivyUser = getPrivyUser as jest.MockedFunction<typeof getPrivyUser>;
mockGetPrivyUser.mockResolvedValue({ id: "different-privy-id" }); // Different from profile

const profileMock = {
  id: "profile-id",
  privy_user_id: "privy-123", // Different from requester
  wallet_address: "0xabc",
};
// Setup mock to return this profile
const { statusCode } = await runApi({ body: { userProfileId: "profile-id", xpAmount: 100 } });
expect(statusCode).toBe(403);
expect(json).toEqual({ error: "Forbidden" });
```

---

## 3. MISSING TEST CASES - Coverage Gaps

### 3.1 Missing: HTTP Method Validation
```ts
// Test 8: Method not allowed (only POST)
const { statusCode } = await runApi({ method: "GET", body: {} });
expect(statusCode).toBe(405);
expect(json).toEqual({ error: "Method not allowed" });
```

### 3.2 Missing: Profile Not Found (404)
```ts
// Test 9: Profile query returns error or null
mockProfileQuery.mockResolvedValue({ data: null, error: null });
const { statusCode } = await runApi({ body: { userProfileId: "nonexistent", xpAmount: 100 } });
expect(statusCode).toBe(404);
expect(json).toEqual({ error: "Profile not found" });
```

### 3.3 Missing: Unauthorized (401)
```ts
// Test 10: Missing Privy authentication
mockGetPrivyUser.mockResolvedValue(null); // No user
const { statusCode } = await runApi({ body: { userProfileId: "pid", xpAmount: 100 } });
expect(statusCode).toBe(401);
expect(json).toEqual({ error: "Unauthorized" });
```

### 3.4 Missing: XP Amount Validation
```ts
// Test 11: Negative XP amount (should probably fail)
const { statusCode } = await runApi({ body: { userProfileId: "pid", xpAmount: -100 } });
expect(statusCode).toBe(400); // Or should API allow negative? Depends on design.

// Test 12: Zero XP amount
const { statusCode } = await runApi({ body: { userProfileId: "pid", xpAmount: 0 } });
// Should this be allowed? Test should clarify.
```

### 3.5 Missing: Attestation with No EAS Enabled
```ts
// Test 13: Attestation signature provided but EAS disabled
jest.spyOn(easConfig, 'isEASEnabled').mockReturnValue(false);
const { statusCode, json } = await runApi({
  body: { userProfileId, xpAmount: 100, attestationSignature: payload }
});
// Should still work, but attestation ignored
expect(json.attestationUid).toBeNull();
expect(mockCreateDelegatedAttestation).not.toHaveBeenCalled();
```

### 3.6 Missing: Conflicting Concurrent Requests
```ts
// Test 14: Two simultaneous requests from same user
const [result1, result2] = await Promise.all([
  runApi({ body: { userProfileId, xpAmount: 100 } }),
  runApi({ body: { userProfileId, xpAmount: 100 } }),
]);
// First should succeed (200), second should conflict (409)
expect([result1.statusCode, result2.statusCode]).toEqual(
  expect.arrayContaining([200, 409])
);
```

---

## 4. ARCHITECTURAL ISSUES - Design Problems

### 4.1 API Currently Lacks Streak Calculation Capability

The API endpoint cannot calculate streak because it doesn't have access to:
- StreakCalculatorStrategy (a dependency of the service)
- Multiplier strategy
- Tier information

**Solution Options**:
1. **Option A**: Client pre-calculates and sends all required data
   - Keeps API simple
   - Requires hook changes to compute these values

2. **Option B**: API needs to query streak table after RPC
   - Adds DB query to API
   - Simple implementation

3. **Option C**: Enhance RPC to return more data
   - Cleanest for atomicity
   - Requires DB schema/procedure changes

---

### 4.2 Data Duplication Between Service and API

**Current State**:
- Service builds rich activityData before calling `updateUserXPWithActivity()` (service.ts:324-347)
- API only passes raw `activityData` from client (line 154)

**Problem**: Two different data structures for the same logical operation.

**Solution**:
- Either the service completely takes over (client calls service, not API)
- Or the API takes over completely and client provides all needed data

**Current Hybrid Approach**: Client calls API directly (bypassing service) but doesn't provide all data the service would provide.

---

## 5. RECOMMENDATIONS - Priority Order

### Priority 1 (MUST DO - Blocks Implementation)
- [ ] Fix response payload: rename `newXP` → `xpEarned`
- [ ] Add `newStreak` to API response (fetch after RPC succeeds)
- [ ] Update test document with correct response structure
- [ ] Add test for response structure matching `CheckinResult` type

### Priority 2 (SHOULD DO - High Importance)
- [ ] Fix hook to build and send complete activityData
- [ ] Add test for full activityData structure passing to RPC
- [ ] Add test case for schema UID resolution failure
- [ ] Add test case for attestation creation exception

### Priority 3 (NICE TO HAVE - Completeness)
- [ ] Add remaining error case tests (400s for missing params, etc.)
- [ ] Add attestation signature structure validation test
- [ ] Add concurrent request handling test
- [ ] Document why certain behaviors (e.g., negative XP) are allowed/not allowed

### Priority 4 (Documentation)
- [ ] Add section on "What changed from service to API"
- [ ] Add section on "Hook integration requirements"
- [ ] Add section on data flow diagrams for clarity

---

## 6. HOOK INTEGRATION STATUS

### Current State
- Hook **already calls the API** (line 363-374 in useDailyCheckin.ts)
- Hook **expects specific response fields** that don't match API

### Issues Found
1. Hook expects `result.newStreak` → API doesn't provide it
2. Hook expects `result.xpEarned` → API returns `result.newXP`
3. Hook only sends `{ greeting }` as activityData → Should send full data

### Required Fixes
```ts
// In useDailyCheckin.ts, around line 363-374:
// Before calling API, build full activity data
const currentStreak = await checkinService.getCheckinPreview(userAddress);
const multiplier = checkinService.getCurrentMultiplier(currentStreak.nextStreak);
const tier = checkinService.getCurrentTier(currentStreak.nextStreak);

// Then call API with complete data
const result = await fetch("/api/checkin", {
  body: JSON.stringify({
    userProfileId,
    xpAmount,
    activityData: {
      greeting,
      streak: currentStreak.nextStreak,
      xpBreakdown: currentStreak.breakdown,
      multiplier,
      tierInfo: tier,
    },
    attestationSignature,
  }),
}).then(res => res.json());

// API will return { success, xpEarned, newStreak, attestationUid }
if (result.success) {
  toast.success(`Daily check-in complete! +${result.xpEarned} XP (Streak: ${result.newStreak} days)`);
}
```

---

## 7. TEST COVERAGE SUMMARY

| Test Case | Status | Priority | Notes |
|-----------|--------|----------|-------|
| Happy path | ✓ Covered | - | Works as-is |
| Delegated attestation | ⚠️ Partial | P1 | Missing signature validation |
| Activity data structure | ❌ Missing | P1 | Critical gap for analytics |
| Conflict (409) | ✓ Covered | - | Works as-is |
| Authorization (403) | ⚠️ Partial | P1 | Mock setup unclear |
| RPC failure (500) | ✓ Covered | - | Works as-is |
| Attestation failure | ⚠️ Partial | P2 | Missing exception case |
| Method validation | ❌ Missing | P3 | 405 for non-POST |
| Missing parameters | ❌ Missing | P3 | 400 for missing fields |
| Profile not found | ❌ Missing | P3 | 404 coverage |
| Unauthorized | ❌ Missing | P3 | 401 coverage |
| Schema UID failure | ❌ Missing | P2 | Graceful degradation |
| Concurrent requests | ❌ Missing | P2 | Race condition test |

**Current Coverage**: ~50% of critical paths
**Recommended Coverage**: ~85% of critical + error paths

---

## 8. CONCLUSION

The parity test strategy is sound in principle but has several **critical implementation gaps** that must be addressed before claiming feature parity:

1. **Response payload mismatch** - API returns wrong field names and is missing `newStreak`
2. **Missing activity data** - API doesn't construct rich metadata for analytics
3. **Incomplete test coverage** - Many error cases and edge cases not tested

**Recommendation**: Delay implementation until:
- ✓ Response payload issue is resolved
- ✓ Streak calculation is added to API
- ✓ Test cases are updated with complete coverage
- ✓ Hook is updated to work with correct API contract

**Estimated effort to fix**: 2-3 hours for implementation + 1-2 hours for comprehensive test coverage
