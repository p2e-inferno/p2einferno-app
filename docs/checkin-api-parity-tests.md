# Check-in API Parity Tests

## Purpose
The goal is to prove that `POST /api/checkin` behaves exactly like the existing `DailyCheckinService.performCheckin` flow. The service already provides the working logic for eligibility, streaks, attestation creation, XP math, and database updates, so the API must mirror the _outputs_, _DB interactions_, and _error surface_ before we can retire the old client path.

## Contract Reference (Phase 0)
Before implementing tests, align on the locked request/response + persistence contract:
- `docs/checkin-api-parity-contract.md`

## Test Strategy
1. Mock the Supabase RPC (`perform_daily_checkin`) so it returns controlled `ok`/`conflict`/`new_xp` results.
2. Mock `resolveSchemaUID`, `createDelegatedAttestation`, and any other helpers so the API runs deterministically.
3. Drive the API through `supertest` (or Next.js route handler testing) and assert:
   - Response payloads match the service’s return values (success, xp, attestation UID).
   - RPC is invoked with the exact `activityData` that the service builds.
   - Authorization, conflict, and failure cases match the service semantics.

Persisting the API test suite alongside the service tests ensures the _new path_ is regression-free before the client switches over.

## Shared Test Setup Example
```ts
// __tests__/pages/api/checkin-parity.spec.ts
import { createMocks } from "node-mocks-http";
import handler from "@/pages/api/checkin";
import { createDelegatedAttestation } from "@/lib/attestation/core/delegated";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/attestation/core/delegated");
jest.mock("@/lib/attestation/schemas/network-resolver");
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { id: "profile-id", privy_user_id: "privy-123", wallet_address: "0xabc" } }),
    rpc: jest.fn(),
    maybeSingle: jest.fn(),
  }),
}));

const mockResolveSchemaUID = resolveSchemaUID as jest.MockedFunction<typeof resolveSchemaUID>;
const mockCreateDelegatedAttestation = createDelegatedAttestation as jest.MockedFunction<typeof createDelegatedAttestation>;
```

## Test Cases

### 1. Happy path parity
- **Given:** Supabase RPC returns `{ ok: true, conflict: false, new_xp: 150 }`, `attestationSignature` is absent.
- **Expect:** API responds `status 200` with `{ success: true, xpEarned: 150, newStreak: <number>, attestationUid: null }`.
- **Why:** The hook expects `xpEarned` + `newStreak` (not `newXP`). Parity requires the API to surface the same fields as `CheckinResult`.
- **Snippet:**
```ts
mockRpc.mockResolvedValueOnce({ data: { ok: true, conflict: false, new_xp: 150 }, error: null });
const { statusCode, json } = await runApi({ body: { userProfileId: "profile-id", xpAmount: 150 } });
expect(statusCode).toBe(200);
expect(json).toEqual({
  success: true,
  xpEarned: 150,
  newStreak: expect.any(Number),
  attestationUid: null,
});
```

### 2. Delegated attestation branch
- **Given:** `attestationSignature` is provided and `isEASEnabled()` is true (mock env flag). `createDelegatedAttestation` resolves with `{ success: true, uid: "0xuid", txHash: "0xtx" }`.
- **Expect:** API builds `finalAttestation` identical to the service's `activityData.attestation` (UID, schema, attester, recipient, expiration) and forwards it to `perform_daily_checkin`. Response should return the UID, matching the service’s `attestationUid`.
- **Snippet:**
```ts
mockResolveSchemaUID.mockResolvedValue("0xdailyuid");
mockCreateDelegatedAttestation.mockResolvedValue({ success: true, uid: "0xuid" });
await runApi({ body: { userProfileId: "pid", xpAmount: 100, attestationSignature: delegatedPayload } });
expect(mockRpc).toHaveBeenCalledWith("perform_daily_checkin", expect.objectContaining({
  p_attestation: expect.objectContaining({
    uid: "0xuid",
    schemaUid: "0xdailyuid",
    data: expect.objectContaining({ platform: "P2E Inferno Gasless" }),
  }),
}));
```

### 3. Activity data structure parity
- **Given:** API receives `activityData` built the same way the service would (greeting, streak, xpBreakdown, multiplier, tierInfo).
- **Expect:** `perform_daily_checkin` receives `p_activity_data` containing the same fields the service logs (`greeting`, `attestationUid`, `xpBreakdown`, etc.), so analytics using `user_activities.activity_data` stay coherent.
- **Note:** The current hook only sends `{ greeting }`. For parity, the client must send full activity data or the API must compute it before calling the RPC.
- **Snippet:**
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
await runApi({ body: { userProfileId, xpAmount: 100, activityData: expectedActivity } });
expect(mockRpc).toHaveBeenCalledWith("perform_daily_checkin", expect.objectContaining({
  p_activity_data: expectedActivity,
}));
```

### 4. Conflict (duplicate check-in) handling
- **Given:** RPC returns `{ conflict: true }`.
- **Expect:** API responds `409` with `"Already checked in today"`, mirroring the service’s conflict path before it ever touches XP/attestation.
- **Snippet:**
```ts
mockRpc.mockResolvedValueOnce({ data: { ok: false, conflict: true, new_xp: null } });
const { statusCode, json } = await runApi({ body: { userProfileId, xpAmount: 100 } });
expect(statusCode).toBe(409);
expect(json.error).toMatch(/Already checked in today/);
```

### 5. Authorization guard
- **Given:** The Supabase profile query returns `privy_user_id` different from the requester's Privy token (mock `getPrivyUser` to return `id: "other"`).
- **Expect:** API returns `403 "Forbidden"`, matching the service’s expectation that only the profile owner can call `perform_daily_checkin`.
- **Snippet:** ensure `createAdminClient().from("user_profiles")...` returns a profile with `privy_user_id !== requestor` and `getPrivyUser` returns a different ID.

### 6. RPC failure surface
- **Given:** Supabase RPC throws or returns `error`.
- **Expect:** API catches it, logs, and returns `500`. This matches the service’s `throw new CheckinError` plus the API’s `status 500` fallback when it sees `txErr` or `txData.ok === false`.
- **Snippet:**
```ts
mockRpc.mockRejectedValueOnce(new Error("rpc-failure"));
const { statusCode } = await runApi(...);
expect(statusCode).toBe(500);
```

### 7. Attestation creation failure (graceful degrade)
- **Given:** `createDelegatedAttestation` resolves with `{ success: false, error: "chain down" }`.
- **Expect:** API continues to run (does not throw) and still returns success as long as RPC succeeds, matching the service’s best-effort attestation persistence (`perform_daily_checkin` swallows attestation insert errors).
- **Snippet:** verify `finalAttestation` stays `null` and the response still contains `attestationUid: null`.

### 8. Method validation
- **Given:** non-`POST` request.
- **Expect:** `405` and `{ error: "Method not allowed" }`.

### 9. Parameter validation
- **Missing `userProfileId`:** expect `400`.
- **Missing `xpAmount`:** expect `400`.
- **Non-number `xpAmount`:** expect `400`.
- **RPC returns `ok=true` but `new_xp` is null:** expect `500`.
- **RPC returns `ok=false` without conflict:** expect `500`.

### 10. Profile not found
- **Given:** profile lookup returns `null` (or query error).
- **Expect:** `404` with `{ error: "Profile not found" }`.

### 11. Unauthorized
- **Given:** `getPrivyUser` returns null.
- **Expect:** `401` with `{ error: "Unauthorized" }`.

### 12. Schema UID resolution failure
- **Given:** `resolveSchemaUID` returns `null` and `attestationSignature` is present.
- **Expect:** API logs a warning, skips attestation creation, and still succeeds if RPC succeeds.

### 13. Attestation exception handling
- **Given:** `createDelegatedAttestation` throws.
- **Expect:** API continues (no thrown error) and still succeeds if RPC succeeds.

### 14. Attestation signature shape
- **Given:** `attestationSignature` missing required fields.
- **Expect:** API should either reject with `400` (if validation is added) or log and continue; define expected behavior before porting.

### 15. Concurrent requests
- **Given:** two simultaneous requests for the same user/day.
- **Expect:** one `200` and one `409` (unique index conflict is enforced by the RPC).

## Regression Checklist
1. Run these new tests on every change to `/api/checkin`.
2. Compare the API response + Supabase RPC payload with the service’s logged `activityData` (the service writes rich metadata; the API must duplicate it verbatim).
3. Confirm the API returns `xpEarned` + `newStreak` (not `newXP`) so the hook’s UI remains correct.
4. After confirming parity, update the hook to call `/api/checkin` only and remove the old service-based flow.

Once the API version passes this suite, it can replace the service path with minimal risk because the test matrix proves the two behave identically.
