# Check-in Service vs API Parity Analysis

**Question**: Does the service layer already handle all these issues? Should the API just mirror it exactly?

**Answer**: ✅ YES - the service handles everything correctly. For TRUE parity (avoiding regression), the API must mirror the service's implementation exactly, not introduce new things.

---

## Service Implementation Overview

### What DailyCheckinService.performCheckin() Does

**Method Signature**:
```ts
async performCheckin(
  userAddress: string,
  userProfileId: string,
  greeting: string = "GM",
  wallet: any,
): Promise<CheckinResult>
```

**Input Parameters**:
- ✓ `userAddress` - wallet address of user
- ✓ `userProfileId` - database profile ID
- ✓ `greeting` - greeting message (default "GM")
- ✓ `wallet` - wallet object for attestation

**Note**: Service does NOT take `xpAmount` - it CALCULATES it.

### Service Execution Steps

**Step 1: Verify Eligibility (Line 221-230)**
```ts
const canCheckin = await this.canCheckinToday(userAddress);
if (!canCheckin) {
  return {
    success: false,
    xpEarned: 0,
    newStreak: await this.streakCalculator.calculateStreak(userAddress),
    error: "Already checked in today",
  };
}
```
- ✅ Handles duplicate check-in conflict
- ✅ Returns calculated current streak even on conflict

**Step 2: Calculate Streak (Line 233-241)**
```ts
const currentStreak = await this.streakCalculator.calculateStreak(userAddress);
const newStreak = currentStreak + 1;
```
- ✅ Queries streak from database
- ✅ Increments for new check-in

**Step 3: Calculate Multiplier (Line 244)**
```ts
const multiplier = this.multiplierStrategy.calculateMultiplier(newStreak);
```
- ✅ Uses newStreak to determine multiplier tier
- ✅ Returns number or null based on tier config

**Step 4: Calculate XP Breakdown (Line 245-257)**
```ts
const xpBreakdown = this.xpCalculator.calculateXPBreakdown?.(
  newStreak,
  multiplier,
) || {
  baseXP: this.xpCalculator.calculateBaseXP(),
  streakBonus: this.xpCalculator.calculateStreakBonus(newStreak),
  multiplier,
  totalXP: this.xpCalculator.calculateTotalXP(
    baseXP,
    streakBonus,
    multiplier,
  ),
};
```
- ✅ Calculates baseXP
- ✅ Calculates streakBonus from streak
- ✅ Applies multiplier
- ✅ Returns structured breakdown

**Step 5: Create Attestation (Line 276-316)**
```ts
if (isEASEnabled()) {
  const resolvedSchemaUid = await resolveSchemaUID("daily_checkin", resolvedNetwork);
  if (!resolvedSchemaUid) {
    throw new AttestationError(
      "Daily check-in schema UID not configured...",
      { userAddress, resolvedNetwork },
    );
  }

  attestationResult = await this.attestationService.createAttestation({
    schemaUid: resolvedSchemaUid,
    recipient: userAddress,
    data: checkinData,
    wallet,
    allowMultiple: true,
  });

  if (!attestationResult.success) {
    throw new AttestationError(...);
  }
}
```
- ✅ Validates EAS is enabled
- ✅ Resolves schema UID from DB or env
- ✅ Throws error if schema UID missing (hard fail, not graceful)
- ✅ Creates attestation via service
- ✅ Throws error if attestation fails (hard fail, not graceful)

**Step 6: Build Rich Activity Data (Line 324-347)**
```ts
const activityData = {
  greeting,
  streak: newStreak,
  attestationUid: attestationResult.attestationUid,
  xpBreakdown,           // ← Full breakdown object
  multiplier,
  tierInfo: this.multiplierStrategy.getCurrentTier(newStreak),  // ← Tier lookup
  timestamp: new Date().toISOString(),
  activityType: "daily_checkin",
  attestation: {         // ← Nested attestation object
    uid: attestationResult.attestationUid,
    schemaUid: resolvedSchemaUidForCheckin,
    attester: wallet.address,
    recipient: userAddress,
    data: checkinData,
    expirationTime: undefined,
  }
};
```
- ✅ Includes streak (not just greeting)
- ✅ Includes full XP breakdown
- ✅ Includes multiplier value
- ✅ Includes tier information
- ✅ Includes attestation object (used by RPC)

**Step 7: Update User XP (Line 354-369)**
```ts
if (this.xpUpdater.updateUserXPWithActivity) {
  await this.xpUpdater.updateUserXPWithActivity(
    userProfileId,
    xpBreakdown.totalXP,    // ← CALCULATED total, not passed in
    activityData,
  );
}
```
- ✅ Calls RPC internally with calculated xpAmount
- ✅ Passes rich activity data to RPC

**Step 8: Return Success Result (Line 384-390)**
```ts
return {
  success: true,
  xpEarned: xpBreakdown.totalXP,    // ← CALCULATED
  newStreak,                         // ← CALCULATED
  attestationUid: attestationResult.attestationUid,
  breakdown: xpBreakdown,            // ← FULL breakdown included
};
```
- ✅ Returns calculated xpEarned
- ✅ Returns calculated newStreak
- ✅ Returns attestationUid (or undefined)
- ✅ Returns full XP breakdown for client transparency

**Error Handling (Line 391-411)**
```ts
catch (error) {
  return {
    success: false,
    xpEarned: 0,
    newStreak: 0,
    error: error instanceof Error ? error.message : "Unknown error occurred",
  };
}
```
- ✅ Catches all errors and returns graceful error result
- ✅ Does not throw - returns failure result

---

## API Implementation vs Service

### What API Currently Does

**Endpoint**: `POST /api/checkin`

**Input Parameters (pages/api/checkin/index.ts:27-46)**:
```ts
const {
  userProfileId,
  xpAmount,              // ← API takes as parameter (service calculates)
  activityData,          // ← API takes from client (service builds)
  attestation,           // ← Pre-built attestation object
  attestationSignature,  // ← Delegated attestation signature
} = req.body;
```

**What API Calculates**:
- ✗ Streak: Does NOT calculate
- ✗ Multiplier: Does NOT calculate
- ✗ XP Breakdown: Does NOT calculate
- ✗ Activity Data: Does NOT build, passes through from client

**What API Gets from Client**:
- ✓ `xpAmount`: Client provides (service calculates this)
- ✓ `activityData`: Client provides with just `{ greeting }` (service builds full object)
- ✓ `attestationSignature`: For gasless attestation

**What API Actually Does (Line 150-157)**:
```ts
const txResp = await supabase
  .rpc("perform_daily_checkin", {
    p_user_profile_id: userProfileId,
    p_xp_amount: xpAmount,                    // ← From client input
    p_activity_data: activityData || {},      // ← From client input (usually just { greeting })
    p_attestation: finalAttestation,
  })
  .single();
```
- Passes whatever client sends directly to RPC
- No calculation, pure pass-through

**What API Returns (Line 199-203)**:
```ts
return res.status(200).json({
  success: true,
  newXP,                                 // ← Wrong field name (should be xpEarned)
  attestationUid: finalAttestation?.uid || null,
});
```
- Returns what RPC returns
- Missing `newStreak`
- Missing `breakdown`

---

## Parity Gap Analysis

### Core Architectural Difference

| Aspect | Service | API | Gap |
|--------|---------|-----|-----|
| **Streak calculation** | ✅ Does it | ✗ Skips | Client doesn't have this |
| **Multiplier calc** | ✅ Does it | ✗ Skips | Client doesn't have this |
| **XP breakdown** | ✅ Calculates | ✗ Expects from client | Client can't calculate this |
| **Activity data** | ✅ Builds rich | ✗ Expects from client | Client only sends `{ greeting }` |
| **Attestation** | ✅ Built-in | ✅ Delegated option | Different approach but compatible |
| **Input xpAmount** | ✗ Calculates it | ✅ Takes as param | Fundamental difference |
| **Returns newStreak** | ✅ Yes | ✗ No | Missing in response |
| **Returns breakdown** | ✅ Yes | ✗ No | Missing in response |
| **Error handling** | ✅ Returns result | ✅ Same | Aligned |
| **Conflict handling** | ✅ Graceful 409 | ✅ Same | Aligned |

### The Core Issue

**Service Architecture**: Stateful calculator
```
userAddress + userProfileId → [calculate streak, multiplier, xp] → return calculated results
```

**API Architecture**: Stateless pass-through
```
client inputs → [pass to RPC] → return RPC results
```

These are incompatible for parity.

---

## What Needs to Happen for True Parity

### Option 1: API Mirrors Service Completely (PARITY ACHIEVED)

API would need to:
1. ✅ Calculate streak (query `user_streaks` table)
2. ✅ Calculate multiplier (use multiplier strategy)
3. ✅ Calculate XP breakdown (use XP calculator)
4. ✅ Build full activityData (like service does)
5. ✅ Return calculated values (xpEarned, newStreak, breakdown)

**What this requires**:
- API needs multiplier strategy dependency
- API needs XP calculator dependency
- API needs streak calculator dependency
- API needs to replicate service's calculation logic

**Result**: True parity, no regression risk

**Code would look like**:
```ts
// In API endpoint
const currentStreak = await streakCalculator.calculateStreak(profile.wallet_address);
const newStreak = currentStreak + 1;
const multiplier = multiplierStrategy.calculateMultiplier(newStreak);
const xpBreakdown = xpCalculator.calculateXPBreakdown(newStreak, multiplier);

// Then call RPC with calculated values
const result = await rpc("perform_daily_checkin", {
  p_user_profile_id: userProfileId,
  p_xp_amount: xpBreakdown.totalXP,   // ← Calculated, not from client
  p_activity_data: {
    greeting,
    streak: newStreak,
    xpBreakdown,
    multiplier,
    tierInfo,
    // ... full data
  },
  p_attestation: finalAttestation,
});

// Return service-compatible response
return {
  success: true,
  xpEarned: xpBreakdown.totalXP,      // ← Calculated
  newStreak,                           // ← Calculated
  attestationUid: finalAttestation?.uid || null,
  breakdown: xpBreakdown,
};
```

**Pros**: True parity, no regression, hook works without changes
**Cons**: API is more complex, duplicates service logic

---

### Option 2: API is Simpler, Hook Provides Missing Data (PARITY NOT ACHIEVED)

API stays as-is, hook compensates:

**API**:
- Takes xpAmount from client (no calculation)
- Takes activityData from client (no building)
- Returns what RPC returns

**Hook**:
- Calculates xpAmount before calling API
- Builds full activityData before calling API
- Handles missing newStreak calculation

**Result**: NOT true parity, hook and API are tightly coupled

**Code would look like**:
```ts
// In hook (useDailyCheckin.ts)
const currentStreak = await checkinService.getCheckinPreview(userAddress);
const xpAmount = currentStreak.previewXP;
const newStreak = currentStreak.nextStreak;  // ← Hook calculates this
const activityData = {
  greeting,
  streak: newStreak,
  xpBreakdown: currentStreak.breakdown,
  multiplier: currentStreak.nextMultiplier,
  tierInfo: await checkinService.getCurrentTier(newStreak),
};

const result = await fetch("/api/checkin", {
  body: JSON.stringify({
    userProfileId,
    xpAmount,
    activityData,  // ← Full data
    attestationSignature,
  }),
});

// Hook manually sets newStreak since API doesn't return it
const responseWithStreak = {
  ...result,
  newStreak,  // ← Hook fills in the missing field
};
```

**Pros**: API simpler, no new dependencies
**Cons**: NOT true parity, hook duplicates service logic, harder to maintain

---

## What the Test Document Should Specify

The test document currently doesn't clarify which option we're pursuing. It should say:

**For True Parity (Option 1)**:
- API calculates streak from database
- API calculates multiplier and XP breakdown
- API builds full activity data
- API returns calculated xpEarned and newStreak
- Hook can call API and display response directly

**For Looser Parity (Option 2)**:
- API is stateless pass-through
- Hook pre-builds activity data
- Hook stores newStreak value before calling API
- API response is supplemented by hook

---

## Service Handles All These Correctly Already

✅ **Streak calculation**: Service does it at line 233-235
✅ **Multiplier calculation**: Service does it at line 244
✅ **XP breakdown**: Service does it at line 245-257
✅ **Activity data building**: Service does it at line 324-347
✅ **Full metadata**: Service includes streak, multiplier, tier in activity data
✅ **Graceful attestation failure**: Service throws on missing schema UID (line 285-290)
✅ **Return structure**: Service returns proper CheckinResult at line 384-390
✅ **Error handling**: Service catches and returns error result at line 391-411

---

## Recommendation for Parity Without Regression

**Pursue Option 1** (API mirrors service):

This requires:
1. Inject multiplier strategy into API
2. Inject XP calculator into API
3. Inject streak calculator into API
4. API calculates all values before RPC call
5. API returns full CheckinResult structure

**Why this is better**:
- True parity with service (no regression risk)
- Hook doesn't need to know about streak/multiplier/XP logic
- Hook just calls API and displays response
- Easier to test (API returns deterministic values)
- Easier to maintain (logic in one place)
- RPC calls are consistent whether called from service or API

**Effort**:
- Extract strategy instantiation from service setup
- Inject into API handler
- Add calculations to API before RPC call
- Update response to return all fields
- Update tests to verify calculated values

**No scope creep**: All these calculations already exist in service, just reuse them.

---

## Summary

| Question | Answer |
|----------|--------|
| Does service handle all this? | ✅ YES, perfectly |
| Should API mirror service exactly? | ✅ YES, for true parity |
| Is this adding new things? | ❌ NO, reusing existing logic |
| Is this scope creep? | ❌ NO, parity requirement |
| What's the minimum for true parity? | Option 1 above |
| What about simple pass-through API? | Not true parity, regression risk |
| Why is streak calculation critical? | Hook displays it in toast |
| Why is activity data critical? | RPC stores it for analytics |

---

## Files Involved

**Service (source of truth)**:
- `lib/checkin/core/service.ts` - DailyCheckinService.performCheckin()

**API (needs to mirror)**:
- `pages/api/checkin/index.ts` - Handler that needs updating

**Hook (will call API)**:
- `hooks/checkin/useDailyCheckin.ts` - performCheckin() function

**Tests (should verify parity)**:
- `docs/checkin-api-parity-tests.md` - Test specifications
- Future: `__tests__/api/checkin-parity.test.ts` - Actual test code

---

## Conclusion

**For true parity with zero regression risk**: The API should be an adapter that uses the service's dependencies (multiplier strategy, XP calculator, streak calculator) to perform the same calculations and return the same response structure.

This is not introducing new things - it's **ensuring the API behaves identically to the service** which already works correctly.
