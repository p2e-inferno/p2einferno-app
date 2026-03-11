# Wallet Link/Unlink Guard (Sticky Wallet→DID Map) — Implementation Details

## Status (current implementation)
As of 2026-03-04, this plan is implemented with a **safe, additive** approach:
- Step 1 (migration) implemented as written.
- Step 2 (race-safe claim utility) implemented with the updated conflict code `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP`.
- Step 3 (central choke point) implemented in `lib/auth/privy.ts#validateWalletOwnership`.
- Step 3b (wallet-list-based filtering via `getUserWalletAddresses`) is **DEFERRED** (not implemented) to avoid behavioral regressions.
- Touch points were updated to map the conflict to HTTP `409` while preserving existing response JSON shapes.

## Goal
Prevent a single external wallet address from being reused across multiple Privy accounts in **p2einferno**, even if the user unlinks/relinks the wallet in Privy.

This is implemented as an **immutable, server-only map**:

- Input: `wallet_address`
- Output: `privy_user_id` (Privy DID)

Rules:
- A wallet address can map to **exactly one** `privy_user_id` forever.
- A `privy_user_id` can map to **many** wallet addresses.
- The mapping is claimed **only after** the backend has validated (via Privy) that the wallet currently belongs to the user making the request.

This design is intentionally modeled after the existing GoodDollar permanent map:
- DB table: `public.gooddollar_verified_wallet_map` (migration `147`)
- RLS hardening: migration `148`
- Race-safe claim utility: `lib/gooddollar/verification-ownership.ts`

This new guard is **additive** and does not modify GoodDollar flows.

---

## Why this is needed (current behavior)
Today, the app performs wallet ownership validation by calling Privy in:
- `validateWalletOwnership()` in `lib/auth/privy.ts`
- `extractAndValidateWalletFromHeader()` in `lib/auth/privy.ts`
- `extractAndValidateWalletFromSignature()` in `lib/attestation/api/helpers.ts` (internally uses `validateWalletOwnership`)

If a user unlinks a wallet in Privy, another Privy user can later link that same wallet. The Privy validation would then succeed for the new user, unless **p2einferno** adds a sticky guard at the app layer.

The existing DB uniqueness constraint on `public.user_profiles.wallet_address` is not sufficient, because `wallet_address` can be set to `NULL`, allowing the same wallet to be registered again later.

---

## Security posture
The new mapping table must be:
- **Server-only**: not readable/writable by PostgREST clients (`anon`, `authenticated`).
- Writable only by `service_role` (backend).

This prevents wallet-address enumeration and makes the map a backend enforcement mechanism.

---

## Implementation (exact steps)

### Step 1 — Add a Supabase migration

Create a new migration file:
- `supabase/migrations/152_add_wallet_link_map.sql`

Use the following **exact SQL**:

```sql
-- 152_add_wallet_link_map.sql
-- Immutable mapping between any wallet address and a Privy user (DID).
-- Purpose: prevent one wallet from being reused across multiple Privy accounts in this app.

CREATE TABLE IF NOT EXISTS public.wallet_link_map (
  wallet_address TEXT PRIMARY KEY,
  privy_user_id TEXT NOT NULL,
  first_linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_link_map_wallet_lowercase
    CHECK (wallet_address = LOWER(wallet_address))
);

CREATE INDEX IF NOT EXISTS idx_wallet_link_map_privy_user_id
  ON public.wallet_link_map (privy_user_id);

COMMENT ON TABLE public.wallet_link_map IS
  'Maps a wallet address to exactly one Privy user (DID) to prevent cross-account wallet reuse, even if unlinked in Privy.';

-- Keep updated_at consistent with existing patterns in this repo
-- (user_profiles uses update_updated_at_column()).
-- IMPORTANT: do not redefine update_updated_at_column() here.
-- This repo already defines it in an earlier migration (user_profiles schema).
-- Redefining it in a later migration risks unintended global behavior changes.

DROP TRIGGER IF EXISTS update_wallet_link_map_updated_at ON public.wallet_link_map;
CREATE TRIGGER update_wallet_link_map_updated_at
  BEFORE UPDATE ON public.wallet_link_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Optional backfill (safe, additive):
-- Claim current wallet_address from user_profiles if present.
-- Conflicts (same wallet already mapped) are ignored to avoid breaking deploy.
--
-- IMPORTANT:
-- - Do NOT backfill from user_profiles.linked_wallets here.
--   In this codebase, linked_wallets is synced from client-provided data in /api/user/profile
--   and is not trustworthy enough to “permanently claim” a wallet forever.
-- - Backfill should only use sources that were historically validated server-side.

-- Backfill from wallet_address
INSERT INTO public.wallet_link_map (wallet_address, privy_user_id, source)
SELECT
  LOWER(up.wallet_address) AS wallet_address,
  up.privy_user_id AS privy_user_id,
  'backfill:user_profiles.wallet_address' AS source
FROM public.user_profiles up
WHERE
  up.wallet_address IS NOT NULL
  AND up.wallet_address ~* '^0x[0-9a-f]{40}$'
ON CONFLICT (wallet_address) DO NOTHING;

-- RLS hardening: server-only table (mirror GoodDollar wallet map hardening).
-- Apply AFTER the optional backfill above to avoid any execution-context surprises.
ALTER TABLE public.wallet_link_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_link_map FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wallet_link_map FROM anon, authenticated;

CREATE POLICY wallet_link_map_deny_anon
  ON public.wallet_link_map
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY wallet_link_map_deny_authenticated
  ON public.wallet_link_map
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY wallet_link_map_allow_service_role
  ON public.wallet_link_map
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

Apply it locally (non-destructive):
- `supabase migration up --local`

Then regenerate TypeScript types so the new table is available to Supabase client queries:
- `npm run db:types`

---

### Step 2 — Add a new backend utility (race-safe claim + conflict)

Create a new file:
- `lib/auth/wallet-link-map.ts`

Use the following **exact TypeScript**:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("auth:wallet-link-map");

export const WALLET_LINK_CONFLICT_CODE =
  "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP";

export type WalletLinkClaimResult =
  | { ok: true; walletAddress: `0x${string}`; privyUserId: string }
  | {
      ok: false;
      code: typeof WALLET_LINK_CONFLICT_CODE;
      walletAddress: `0x${string}`;
      message: string;
    };

function normalizeWalletAddressOrThrow(walletAddress: string): `0x${string}` {
  const normalized = walletAddress.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("Invalid wallet address format");
  }
  return normalized as `0x${string}`;
}

/**
 * Claim (or validate) the immutable wallet→Privy DID mapping.
 *
 * Contract:
 * - Idempotent: same wallet + same user is always OK.
 * - Conflict: same wallet + different user returns WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP.
 * - Race-safe: handles concurrent claims via INSERT + 23505 fallback re-read.
 *
 * IMPORTANT: Call this ONLY AFTER Privy has verified the wallet is currently linked
 * to the requesting Privy user. This avoids trusting client-supplied wallet lists.
 */
export async function claimOrValidateWalletLink({
  supabase,
  walletAddress,
  privyUserId,
  source,
}: {
  supabase: SupabaseClient;
  walletAddress: string;
  privyUserId: string;
  source: string;
}): Promise<WalletLinkClaimResult> {
  const normalized = normalizeWalletAddressOrThrow(walletAddress);

  // Fast path: does this wallet already have an owner?
  const { data: existing, error: readErr } = await supabase
    .from("wallet_link_map")
    .select("wallet_address, privy_user_id")
    .eq("wallet_address", normalized)
    .maybeSingle();

  if (readErr) {
    log.error("wallet_link_map read failed", {
      walletAddress: normalized,
      privyUserId,
      source,
      error: readErr,
    });
    throw readErr;
  }

  if (existing?.privy_user_id && existing.privy_user_id !== privyUserId) {
    return {
      ok: false,
      code: WALLET_LINK_CONFLICT_CODE,
      walletAddress: normalized,
      message:
        "This wallet can’t be used with this account. Please reconnect it to the account that originally linked it, or contact support.",
    };
  }

  // Touch existing mapping (idempotent)
  if (existing?.privy_user_id === privyUserId) {
    const { error: touchErr } = await supabase
      .from("wallet_link_map")
      .update({
        last_seen_at: new Date().toISOString(),
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("wallet_address", normalized)
      .eq("privy_user_id", privyUserId);

    if (touchErr) {
      log.error("wallet_link_map touch failed", {
        walletAddress: normalized,
        privyUserId,
        source,
        error: touchErr,
      });
      throw touchErr;
    }

    return { ok: true, walletAddress: normalized, privyUserId };
  }

  // Insert new mapping claim
  const nowIso = new Date().toISOString();
  const { error: insertErr } = await supabase.from("wallet_link_map").insert({
    wallet_address: normalized,
    privy_user_id: privyUserId,
    first_linked_at: nowIso,
    last_seen_at: nowIso,
    source,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (!insertErr) {
    return { ok: true, walletAddress: normalized, privyUserId };
  }

  // Race-safe fallback: if insert conflicted, re-read and resolve
  if (insertErr.code === "23505") {
    const { data: raced, error: racedReadErr } = await supabase
      .from("wallet_link_map")
      .select("wallet_address, privy_user_id")
      .eq("wallet_address", normalized)
      .maybeSingle();

    if (racedReadErr) {
      log.error("wallet_link_map re-read after conflict failed", {
        walletAddress: normalized,
        privyUserId,
        source,
        error: racedReadErr,
      });
      throw racedReadErr;
    }

    if (raced?.privy_user_id === privyUserId) {
      return { ok: true, walletAddress: normalized, privyUserId };
    }

    if (raced?.privy_user_id && raced.privy_user_id !== privyUserId) {
      return {
        ok: false,
        code: WALLET_LINK_CONFLICT_CODE,
        walletAddress: normalized,
        message:
          "This wallet can’t be used with this account. Please reconnect it to the account that originally linked it, or contact support.",
      };
    }

    // If the row still isn't visible, surface DB error so callers can retry.
    throw insertErr;
  }

  log.error("wallet_link_map insert failed", {
    walletAddress: normalized,
    privyUserId,
    source,
    error: insertErr,
  });
  throw insertErr;
}
```

---

### Step 3 — Enforce the guard at the *central wallet ownership choke point*

Edit:
- `lib/auth/privy.ts`

Add imports at the top:
- `import { createAdminClient } from "@/lib/supabase/server";`
- `import { claimOrValidateWalletLink, WALLET_LINK_CONFLICT_CODE } from "@/lib/auth/wallet-link-map";`

Then, in `validateWalletOwnership(...)`, after the wallet is confirmed to belong to the user via Privy linked accounts, claim the mapping:

**Required behavior (exact):**
1. Perform the current Privy validation exactly as it works today.
2. If Privy validation passes:
   - Create an admin supabase client: `const supabase = createAdminClient();`
   - Call `claimOrValidateWalletLink({ supabase, walletAddress, privyUserId: userId, source: context })`
3. If `claimOrValidateWalletLink` returns `{ ok: false, code: WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP }`:
   - Throw a **non-misleading** `WalletValidationError` with code `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP` and the user-safe message from `result.message`.

Reason: `AuthorizationError` is currently converted by `extractAndValidateWalletFromHeader()` into `WalletValidationError("NOT_OWNED", ...)`, which is misleading. This feature must be distinguishable from “wallet not owned”.

#### Required change to WalletValidationError codes

In `lib/auth/privy.ts`, update the `WalletValidationError` class to include the new code.

**Before:**
```ts
export class WalletValidationError extends Error {
  public readonly code: "NOT_OWNED" | "HEADER_REQUIRED" | "INVALID_FORMAT";

  constructor(
    code: "NOT_OWNED" | "HEADER_REQUIRED" | "INVALID_FORMAT",
    message: string,
  ) {
```

**After:**
```ts
export class WalletValidationError extends Error {
  public readonly code: "NOT_OWNED" | "HEADER_REQUIRED" | "INVALID_FORMAT" | "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP";

  constructor(
    code: "NOT_OWNED" | "HEADER_REQUIRED" | "INVALID_FORMAT" | "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP",
    message: string,
  ) {
```

Both the `code` property type and the constructor parameter type must be updated.

**Exact code to insert inside `validateWalletOwnership(...)` right before the final `return walletAddress;`:**

```ts
    const supabase = createAdminClient();
    const linkRes = await claimOrValidateWalletLink({
      supabase,
      walletAddress,
      privyUserId: userId,
      source: context,
    });

    if (!linkRes.ok && linkRes.code === WALLET_LINK_CONFLICT_CODE) {
      throw new WalletValidationError("WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP", linkRes.message);
    }
```

This makes the guard automatically apply to:
- `validateWalletOwnership()` callers (direct)
- `extractAndValidateWalletFromHeader()` (because it calls `validateWalletOwnership`)
- `extractAndValidateWalletFromSignature()` (because it calls `validateWalletOwnership`)

No endpoint-by-endpoint changes are required for enforcement.

---

## Coverage note (important)

This guard is guaranteed to apply anywhere that calls `validateWalletOwnership()` (directly or indirectly).

However, some flows in this codebase do **not** call `validateWalletOwnership()` and instead operate on “all wallets on the Privy user” (e.g., via `getUserWalletAddresses()` inside `lib/services/user-key-service.ts`).

If you want this feature to be a **global invariant** (“a wallet can never be used by another Privy account anywhere in the app”), then you must ensure those wallet-list-based flows also consult `wallet_link_map` (either by filtering out wallets claimed by other DIDs, or by failing closed).

The smallest-change place to do that is to update `getUserWalletAddresses()` in `lib/auth/privy.ts` to:
- fetch wallets from Privy (as it does today),
- then claim them against `wallet_link_map` using a service-role Supabase client and filter out any wallet already claimed by another Privy DID.

In the current implementation, this is **deferred** to avoid regressions. Do not implement partial enforcement without documenting it, or this feature will appear “randomly enforced” depending on endpoint.

### Step 3b — Wallet-list-based flows (`getUserWalletAddresses`) (DEFERRED)

This step is intentionally **not implemented** in the current codebase to avoid regressions.

Changing `getUserWalletAddresses()` to filter/claim wallets:
- changes semantics for existing callers, and
- can cause a wallet-link conflict to be misreported as “NOT_OWNED” (because the conflicting wallet may be filtered out before `validateWalletOwnership()` evaluates it).

If you later need wallet-list-based enforcement, implement it as a **new function** (or an explicit option flag) rather than changing `getUserWalletAddresses()` default behavior.

## Expected runtime behavior (server)

### Case A — First time a wallet is seen (valid)
- Privy confirms wallet belongs to `did:privy:abc`
- `wallet_link_map` has no entry
- Insert succeeds
- Request proceeds

### Case B — Wallet is reused by the same user (idempotent)
- Privy confirms wallet belongs to `did:privy:abc`
- `wallet_link_map` has `(wallet → did:privy:abc)`
- Update `last_seen_at` and proceed

### Case C — Wallet is attempted by a different user (blocked)
- Privy confirms wallet belongs to `did:privy:def` (because user linked it in Privy)
- `wallet_link_map` has `(wallet → did:privy:abc)`
- Guard returns conflict and the request fails with a `409` error:
  - Message: `"This wallet can't be used with this account. Please reconnect it to the account that originally linked it, or contact support."`

---

## Error handling requirements (API responses)

This implementation requires a distinct, user-safe error for wallet-link conflicts (`WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP`) so that it is not misreported as “wallet not owned”.

If an endpoint currently catches wallet validation errors and returns `500`, update it to return an appropriate user-facing error status and message.

#### Known endpoint requiring targeted fix: `pages/api/quests/sign-tos.ts`

This endpoint calls `validateWalletOwnership` directly (not through `extractAndValidateWalletFromHeader`). Its current catch block is a single generic `catch (error)` returning `500` for everything, including wallet ownership failures. After the guard is injected into `validateWalletOwnership`, this endpoint can receive either `AuthorizationError` (wallet not owned) or `WalletValidationError("WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP")`.

**Required change:** Add `WalletValidationError` to imports and wrap the `validateWalletOwnership` call in its own try-catch:

Add to imports:
```ts
import { getPrivyUser, validateWalletOwnership, WalletValidationError } from "@/lib/auth/privy";
```

Replace the bare `await validateWalletOwnership(userId, walletAddress, "tos-signing");` (line 30) with:
```ts
    try {
      await validateWalletOwnership(userId, walletAddress, "tos-signing");
    } catch (walletErr: unknown) {
      if (walletErr instanceof WalletValidationError && walletErr.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP") {
        return res.status(409).json({ error: walletErr.message });
      }
      const message = walletErr instanceof Error ? walletErr.message : "Wallet validation failed";
      return res.status(403).json({ error: message });
    }
```

#### Known endpoint requiring targeted fix: `pages/api/checkin/index.ts`

This endpoint has **two** separate wallet validation paths that both need updating:

**Path 1 — EAS signature (direct `validateWalletOwnership` call, line 92-101):**

Current code catches all errors and returns 403. Replace:
```ts
      try {
        await validateWalletOwnership(
          user.id,
          attestationSignature.recipient,
          "checkin",
        );
        userWalletAddress = attestationSignature.recipient;
      } catch (error: any) {
        return res.status(403).json({ error: error.message });
      }
```

With:
```ts
      try {
        await validateWalletOwnership(
          user.id,
          attestationSignature.recipient,
          "checkin",
        );
        userWalletAddress = attestationSignature.recipient;
      } catch (walletErr: unknown) {
        if (walletErr instanceof WalletValidationError && walletErr.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP") {
          return res.status(409).json({ error: walletErr.message });
        }
        const message = walletErr instanceof Error ? walletErr.message : "Wallet validation failed";
        return res.status(403).json({ error: message });
      }
```

**Path 2 — Non-EAS header path (`extractAndValidateWalletFromHeader`, line 126-129):**

Current code uses substring matching (`error.message?.includes("required") ? 400 : 403`). Replace:
```ts
      } catch (error: any) {
        const status = error.message?.includes("required") ? 400 : 403;
        return res.status(status).json({ error: error.message });
      }
```

With:
```ts
      } catch (walletErr: unknown) {
        const status = walletValidationErrorToHttpStatus(walletErr);
        const safeStatus = status === 500 ? 400 : status;
        const message = walletErr instanceof Error ? walletErr.message : "Wallet validation failed";
        return res.status(safeStatus).json({ error: message });
      }
```

Add to checkin imports:
```ts
import { WalletValidationError, walletValidationErrorToHttpStatus } from "@/lib/auth/privy";
```

(`WalletValidationError` is needed for Path 1; `walletValidationErrorToHttpStatus` is needed for Path 2.)

#### Additional direct `validateWalletOwnership` callers (missed in initial plan)

These endpoints call `validateWalletOwnership` directly (not via `extractAndValidateWalletFromHeader`), so `WalletValidationError("WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP")` will propagate without being converted. Each needs targeted error handling:

**`pages/api/user/profile.ts`** — Two call sites:

1. Inside `createOrUpdateUserProfile()` (line 67): The catch block re-throws `AuthorizationError` and `PrivyUnavailableError` but wraps all other errors in `new Error(...)`, losing the `WalletValidationError` type. The outer handler then returns 500.

   Replace the catch block (lines 72-86):
   ```ts
       } catch (error) {
         if (
           error instanceof AuthorizationError ||
           error instanceof PrivyUnavailableError
         ) {
           throw error;
         }
         throw new Error(
           `Wallet ownership validation failed: ${
             error instanceof Error ? error.message : "Unknown error"
           }`,
         );
       }
   ```

   With:
   ```ts
       } catch (error) {
         if (
           error instanceof AuthorizationError ||
           error instanceof PrivyUnavailableError ||
           error instanceof WalletValidationError
         ) {
           throw error;
         }
         throw new Error(
           `Wallet ownership validation failed: ${
             error instanceof Error ? error.message : "Unknown error"
           }`,
         );
       }
   ```

   Then in the outer catch block (around line 536), add `WalletValidationError` handling before the generic fallback:
   ```ts
       if (error instanceof WalletValidationError && error.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP") {
         return res.status(409).json({ error: error.message });
       }
   ```

   Add `WalletValidationError` to the existing imports from `@/lib/auth/privy`.

2. In the PUT handler (line 506): The bare `await validateWalletOwnership(...)` propagates to the outer catch. The same outer-catch fix above covers this path.

**`app/api/token/withdraw/route.ts`** (line 82): Currently catches all errors and returns 403. Replace:
```ts
    } catch (error: any) {
      log.error("Wallet validation failed for withdrawal", {
        userId: user.id,
        walletAddress,
        error: error.message,
      });
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 },
      );
    }
```

With:
```ts
    } catch (walletErr: unknown) {
      const message = walletErr instanceof Error ? walletErr.message : "Wallet validation failed";
      log.error("Wallet validation failed for withdrawal", {
        userId: user.id,
        walletAddress,
        error: message,
      });
      if (walletErr instanceof WalletValidationError && walletErr.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP") {
        return NextResponse.json(
          { success: false, error: message },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { success: false, error: message },
        { status: 403 },
      );
    }
```

Add import: `import { WalletValidationError } from "@/lib/auth/privy";`

**`pages/api/payment/verify/[reference].ts`** (line 189): This is an internal server function (payment verification), not directly user-facing. The catch block returns `{ success: false, error: "..." }`. After the plan's changes, a wallet link conflict would be treated as a generic validation failure. This is acceptable for payment verification (the wallet was already claimed), but the error message should distinguish the failure reason for logging.

Replace:
```ts
    } catch (validationError: any) {
      if (validationError instanceof PrivyUnavailableError) {
        log.error(
          `Privy API unavailable while validating wallet ownership for user ${userProfile.privy_user_id}`,
          { error: validationError },
        );
      } else {
        log.error(
          `Wallet ownership validation failed for user ${userProfile.privy_user_id}`,
          { error: validationError },
        );
      }
      return {
        success: false,
        error: `Wallet ownership validation failed: ${validationError.message}`,
      };
```

With:
```ts
    } catch (validationError: any) {
      if (validationError instanceof PrivyUnavailableError) {
        log.error(
          `Privy API unavailable while validating wallet ownership for user ${userProfile.privy_user_id}`,
          { error: validationError },
        );
      } else if (validationError instanceof WalletValidationError && validationError.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP") {
        log.error(
          `Wallet already linked to another account for user ${userProfile.privy_user_id}`,
          { error: validationError },
        );
      } else {
        log.error(
          `Wallet ownership validation failed for user ${userProfile.privy_user_id}`,
          { error: validationError },
        );
      }
      return {
        success: false,
        error: `Wallet ownership validation failed: ${validationError.message}`,
      };
```

Add import: `import { WalletValidationError } from "@/lib/auth/privy";`

### WalletValidationError → HTTP mapping (required for consistent UX)

This feature introduces (or requires) a distinct wallet guard error code:
- `WalletValidationError.code === "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP"`

To avoid misleading UX, endpoints must map it differently from `NOT_OWNED`.

**Required mapping:**
- `HEADER_REQUIRED` → `400`
- `INVALID_FORMAT` → `400`
- `NOT_OWNED` → `403`
- `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP` → `409`

**User-facing message requirement:**
- Do not mention “another user” or any identifier. Use the message returned by `claimOrValidateWalletLink(...)`, which is already sanitized.

**Exact helper code (recommended to avoid drift):**

To avoid fragmentation and unnecessary abstractions, add this helper directly to the bottom of `lib/auth/privy.ts`:

```ts
export function walletValidationErrorToHttpStatus(err: unknown): number {
  if (err instanceof WalletValidationError) {
    switch (err.code) {
      case "HEADER_REQUIRED":
      case "INVALID_FORMAT":
        return 400;
      case "NOT_OWNED":
        return 403;
      case "WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP":
        return 409;
      default:
        return 400;
    }
  }
  if (err instanceof PrivyUnavailableError) {
    return 503;
  }
  // AuthorizationError is thrown by validateWalletOwnership() for ownership failures.
  // Endpoints calling validateWalletOwnership directly (not via extractAndValidateWalletFromHeader)
  // will see this error type instead of WalletValidationError("NOT_OWNED").
  if (err instanceof AuthorizationError) {
    return 403;
  }
  return 500;
}
```

Note: `AuthorizationError` handling is required because `validateWalletOwnership` throws `AuthorizationError` for "wallet not owned" (not `WalletValidationError`). Only `extractAndValidateWalletFromHeader` converts it to `WalletValidationError("NOT_OWNED")`. Endpoints like `sign-tos.ts` and `checkin/index.ts` (EAS path) that call `validateWalletOwnership` directly will see `AuthorizationError`.

Then in any endpoint that catches `extractAndValidateWalletFromHeader(...)` or `validateWalletOwnership(...)` errors, replace ad-hoc status logic with `walletValidationErrorToHttpStatus(...)` **while preserving the endpoint’s existing response JSON shape** (see the two patterns below for signature-based vs header-based callers).

### Known touch points: `extractAndValidateWalletFromSignature` callers

**Status**: implemented in this codebase (preserving each endpoint’s response JSON shape).

These files call `extractAndValidateWalletFromSignature` (which internally calls `validateWalletOwnership`). They use substring-based error mapping (`error.message?.includes("required") ? 400 : 403`) which will map `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP` to `403` (wrong; should be `409`):

- `pages/api/milestones/claim.ts`
- `pages/api/quests/claim-task-reward.ts`
- `pages/api/user/task/[taskId]/claim.ts`
- `pages/api/bootcamp/certificate/claim.ts`
- `app/api/token/withdraw/commit-attestation/route.ts`
- `pages/api/subscriptions/commit-renewal-attestation.ts`
- `pages/api/quests/get-trial.ts`
- `pages/api/quests/commit-completion-attestation.ts`

All use this identical pattern:
```ts
    } catch (error: any) {
      const status = error.message?.includes("required") ? 400 : 403;
      return res.status(status).json({ error: error.message });
    }
```

**Implemented replacement pattern (preserve response shape):**
```ts
    } catch (walletErr: unknown) {
      const status = walletValidationErrorToHttpStatus(walletErr);
      // Preserve historical behavior: these endpoints previously never returned 500 for wallet errors.
      const safeStatus = status === 500 ? 403 : status;
      const message =
        walletErr instanceof Error ? walletErr.message : "Wallet validation failed";
      return res.status(safeStatus).json({ error: message });
    }
```

Each file must add this import (unless already present):
```ts
import { walletValidationErrorToHttpStatus } from "@/lib/auth/privy";
```

### Known touch points: `extractAndValidateWalletFromHeader` callers

**Status**: implemented in this codebase (preserving each endpoint’s response JSON shape).

These files call `extractAndValidateWalletFromHeader` and use the same inline catch pattern that maps `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP` to `400` (wrong; should be `409`):

- `pages/api/quests/complete-task.ts`
- `pages/api/daily-quests/[runId].ts`
- `pages/api/daily-quests/[runId]/start.ts`
- `pages/api/daily-quests/index.ts`
- `pages/api/daily-quests/complete-task.ts`
- `pages/api/daily-quests/complete-quest.ts`
- `pages/api/daily-quests/claim-task-reward.ts`

All use this identical pattern:
```ts
    } catch (walletErr: unknown) {
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      const status =
        walletErr instanceof WalletValidationError &&
        walletErr.code === "NOT_OWNED"
          ? 403
          : 400;
      return res.status(status).json({ error: message });
    }
```

**Implemented replacement pattern (preserve response shape):**
```ts
    } catch (walletErr: unknown) {
      const status = walletValidationErrorToHttpStatus(walletErr);
      // Preserve historical behavior: header-validation failures were previously treated as 400 by default.
      const safeStatus = status === 500 ? 400 : status;
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      return res.status(safeStatus).json({ error: message });
    }
```

Each file must add `walletValidationErrorToHttpStatus` to its imports from `@/lib/auth/privy`. Since the replacement catch block no longer references `WalletValidationError` directly (the helper encapsulates it), **remove `WalletValidationError` from the import** if it is not used elsewhere in the file to avoid unused-import lint errors.

Note: `pages/api/checkin/index.ts` and `pages/api/quests/sign-tos.ts` are handled separately above because they have additional direct `validateWalletOwnership` calls.

Recommended HTTP status for wallet-link conflict:
- `409` (conflict; safe default; does not disclose cross-account details)

Recommended message:
- `"This wallet can’t be used with this account. Please reconnect it to the account that originally linked it, or contact support."`

---

## Notes on what is (and is not) enforced

### Enforced
- The guard binds the wallet address the backend is about to trust (header wallet, signature wallet, or direct wallet ownership checks).

### Not enforced (by design)
- The `user_profiles.linked_wallets` JSON list is not trusted to claim ownership. The map is only claimed after Privy validates ownership.

---

## Local verification checklist

### Core guard (validateWalletOwnership path)
1. Apply migration locally:
   - `supabase migration up --local`
   - `npm run db:types`
2. Link wallet `0x...` to user A, perform any action that triggers `validateWalletOwnership` (e.g., a flow using `X-Active-Wallet`).
3. Confirm DB row exists:
   - `wallet_link_map.wallet_address = lower(0x...)`
   - `wallet_link_map.privy_user_id = user A DID`
4. Repeat step 2 as the same user. Confirm request succeeds (idempotent) and `last_seen_at` is updated.
5. Unlink wallet in Privy from user A, link to user B.
6. Retry the same action as user B with the same wallet.
7. Expected: request is blocked with HTTP `409` and the conflict message (not `403` or `500`).

### getUserWalletAddresses filtering (Step 3b)
Not applicable: Step 3b is **DEFERRED** in the current implementation.

### Error response format
11. Trigger the `WALLET_ALREADY_LINKED_TO_ANOTHER_USER_IN_APPP` conflict from an `extractAndValidateWalletFromHeader`-based endpoint (e.g., daily-quests).
12. Expected: HTTP `409`, body `{ "error": "This wallet can't be used with this account. ..." }`.
13. Trigger the same conflict from `sign-tos.ts` (direct `validateWalletOwnership` caller).
14. Expected: HTTP `409` with the same user-safe message (not `500`).
15. Trigger the same conflict from `checkin/index.ts` EAS path (direct `validateWalletOwnership` caller).
16. Expected: HTTP `409` (not `403`).

### Fail-closed behavior
17. Stop the local Supabase instance (`supabase stop`) or make `wallet_link_map` temporarily inaccessible.
18. Call an endpoint that triggers `validateWalletOwnership` (e.g., a flow using `X-Active-Wallet`).
19. Expected: request is denied (fail closed) and does not grant access.

### Backfill verification
20. After applying the migration, run: `SELECT COUNT(*) FROM wallet_link_map;`
21. Expected: count should equal `SELECT COUNT(*) FROM user_profiles WHERE wallet_address IS NOT NULL AND wallet_address ~* '^0x[0-9a-f]{40}$';` — unless there are case-insensitive duplicates in `user_profiles.wallet_address` (e.g., two users with `0xABC` and `0xabc`), in which case the `wallet_link_map` count will be lower because `ON CONFLICT DO NOTHING` skips duplicates after `LOWER()`. If the counts differ, investigate which rows were skipped.
22. Check for any `privy_user_id` collisions in the backfill: `SELECT wallet_address, privy_user_id FROM wallet_link_map WHERE privy_user_id IN (SELECT privy_user_id FROM user_profiles WHERE wallet_address IS NOT NULL GROUP BY privy_user_id HAVING COUNT(*) > 1);`
