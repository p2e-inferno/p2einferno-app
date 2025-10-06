# RPC Hammering Issue - Root Cause Analysis & Solution

## Issue Summary

When visiting `/test/admin-auth-debug`, excessive RPC calls are made to all configured blockchain providers (Alchemy, Infura, public Base RPCs) simultaneously. **Critical**: These calls continue even after closing the page/tab and persist until the development server is shut down.

## Root Cause Analysis

### 1. Page Architecture Difference

**Normal Pages (`/`, `/lobby`)**:
- Use `MainLayout` component (Navbar + Footer only)
- No blockchain operations mounted by default
- RPC calls only triggered by user actions (e.g., opening wallet dropdown)

**Debug Page (`/test/admin-auth-debug`)**:
- Mounts `AdminAuthDebugProvider` → `AdminAuthProvider`
- Immediately triggers blockchain authentication checks
- Uses server-side blockchain infrastructure in browser context

### 2. Server Client in Browser Context (Root Issue)

The `AdminAuthProvider` uses `LockManagerService` which creates a **server-optimized client**:

```typescript
// lib/blockchain/services/lock-manager.ts:41
this.publicClient = createServerPublicClient();
```

**Problem**: `createServerPublicClient()` is designed for persistent Node.js server processes, not browser environments.

### 3. Client Architecture Comparison

| Component | Client Used | Cleanup | Behavior |
|-----------|-------------|---------|----------|
| `useWalletBalances` | `createPublicClientUnified()` | ✅ Proper browser lifecycle | Normal |
| `LockManagerService` | `createServerPublicClient()` | ❌ No browser cleanup | **Persists after page close** |

### 4. Singleton Persistence Issue

```typescript
// lib/blockchain/services/lock-manager.ts:349-350
export const lockManagerService = new LockManagerService();
```

- `LockManagerService` is a **singleton** that persists in browser memory
- Server client created once, never cleaned up
- Continues background operations indefinitely

### 5. Multiple RPC Calls Per Auth Check

Each authentication check in `lockManagerService.checkUserHasValidKey()` makes **3 sequential RPC calls**:

1. `getHasValidKey` (lines 173-179)
2. `tokenOfOwnerByIndex` (lines 192-198)
3. `keyExpirationTimestampFor` (lines 204-210)

### 4. Admin API Surface Audit (Step 1 follow-up)

The debugging page relies on both App Route and legacy Pages API stacks, so we catalogued every admin handler to confirm where the lock manager service could be imported. The audit ensures browser code never pulls in server-only modules through shared utilities.

| Location | Path prefix | Notes |
| --- | --- | --- |
| App Routes | `app/api/admin/*` | Route handlers already import `ensureAdminOrRespond`; continue using `createServerLockManager()` when blockchain reads are required server-side. |
| Pages API | `pages/api/admin/*` | Legacy endpoints still instantiate `lockManagerService`; vetted that each runs exclusively on the server (Next.js API route) and therefore safe to keep the singleton. |
| Supporting services | `lib/services/user-key-service.ts`, `lib/auth/admin-key-checker.ts`, `lib/blockchain/services/grant-key-service.ts` | Used by API routes only; no direct client imports. |

This cross-check confirmed that only `/test/admin-auth-debug` (and the admin React context family) pulled the singleton into the browser. Those consumers now use the browser factory + hook.

### 6. Hitting All RPCs Simultaneously

The server client configuration bypasses browser-specific RPC prioritization logic:

```typescript
// lib/blockchain/config/clients/public-client.ts:98-112
if (isBrowser) {
  // Browser prioritization: keyed RPCs first, public Base last
  if (hasKeyed) {
    const keyed = urls.filter((u) => keyedPred(parseHost(u)));
    const publicBase = urls.filter((u) => publicBasePred(parseHost(u)));
    const others = urls.filter(...);
    urls = [...keyed, ...others, ...publicBase];
  }
}
```

**Server clients skip this browser optimization**, hitting all providers simultaneously.

## Technical Investigation Details

### useEffect Cleanup Analysis

**Proper Cleanup Example** (useWalletBalances.ts:175-176):
```typescript
const interval = setInterval(fetchBalances, pollIntervalMs);
return () => clearInterval(interval);
```

**Missing Cleanup** (AdminAuth context):
- No cleanup mechanism for `LockManagerService` singleton
- Server client persists beyond React component lifecycle

### Browser vs Server Client Creation

**Browser Client** (`createPublicClientUnified`):
```typescript
// Returns cached browser client with proper lifecycle
const cachedClient = isBrowser ? cachedBrowserPublicClient : cachedServerPublicClient;
```

**Server Client** (`createServerPublicClient`):
```typescript
// Always creates server-optimized client regardless of environment
return createPublicClientUnified();
```

## Immediate Solution

### 1. Create Browser-Specific Lock Manager Service

Create new file: `lib/blockchain/services/lock-manager-browser.ts`

```typescript
import { createPublicClientUnified } from '../config';
import { COMPLETE_LOCK_ABI } from '../shared/abi-definitions';
import { blockchainLogger } from '../shared/logging-utils';

export class BrowserLockManagerService {
  private getClient() {
    // Use browser-optimized client with proper cleanup
    return createPublicClientUnified();
  }

  async checkUserHasValidKey(
    userAddress: Address,
    lockAddress: Address,
    forceRefresh = false
  ): Promise<KeyInfo | null> {
    const client = this.getClient();
    // ... implementation using browser client
  }
}

// Create disposable instance (not singleton)
export const createBrowserLockManager = () => new BrowserLockManagerService();
```

### 2. Modify AdminAuth Context

Update `contexts/admin-context/hooks/useAdminAuthContextActions.ts`:

```typescript
// Replace
import { lockManagerService } from '@/lib/blockchain/services/lock-manager';

// With
import { createBrowserLockManager } from '@/lib/blockchain/services/lock-manager-browser';

export const useAdminAuthContextActions = (state, sessionHandlers) => {
  const lockManager = useMemo(() => createBrowserLockManager(), []);

  // Use lockManager instead of lockManagerService
  const hasValidKey = await lockManager.checkUserHasValidKey(/*...*/);
}
```

### 3. Add Request Coalescing

Prevent duplicate concurrent auth checks:

```typescript
const checkAdminAccess = useCallback(async (forceRefresh = false) => {
  // Prevent duplicate calls
  if (inFlightRef.current && !forceRefresh) return;

  // Coalesce rapid auth checks
  if (!forceRefresh && Date.now() - lastCheckRef.current < 1000) return;

  inFlightRef.current = true;
  lastCheckRef.current = Date.now();

  try {
    // Auth check logic
  } finally {
    inFlightRef.current = false;
  }
}, []);
```

## Long-term Prevention

### 1. Client Selection Guidelines

**Use `createPublicClientUnified()` for**:
- Browser-based operations
- React components/hooks
- User-triggered actions

**Use `createServerPublicClient()` for**:
- API routes (`pages/api/*`)
- Server-side operations only
- Persistent server processes

### 2. Service Architecture Rules

**Browser Services**:
- Non-singleton patterns
- Created per-component instance
- Proper cleanup in useEffect returns

**Server Services**:
- Singleton acceptable
- Persistent connections expected
- No browser lifecycle concerns

### 3. Testing Checklist

Before deploying blockchain service changes:

- [ ] Test RPC call count on page load (should be ≤1 per user action)
- [ ] Verify calls stop when page/component unmounts
- [ ] Check Network tab: no background requests after navigation
- [ ] Confirm proper RPC prioritization (keyed → others → public)
- [ ] Test error scenarios don't cause retry storms

## Implementation Priority

1. **CRITICAL**: Create browser lock manager service (prevents persistent RPC calls)
2. **HIGH**: Update AdminAuth context to use browser service
3. **MEDIUM**: Add request coalescing and debouncing
4. **LOW**: Optimize auth check frequency

## Success Criteria

- ✅ RPC calls stop immediately when closing admin-auth-debug page
- ✅ Only active/primary RPC endpoint used (not all simultaneously)
- ✅ Maximum 1 auth check per 30 seconds (cached results)
- ✅ No background network requests after page navigation
- ✅ >90% reduction in RPC call volume on admin pages

## Related Files

**Core Issue**:
- `lib/blockchain/services/lock-manager.ts` (singleton with server client)
- `contexts/admin-context/hooks/useAdminAuthContextInternal.ts` (uses lock manager)

**Working Examples**:
- `hooks/useWalletBalances.ts` (proper browser client usage)
- `components/PrivyConnectButton.tsx` (triggered RPC calls only)

**Configuration**:
- `lib/blockchain/config/clients/public-client.ts` (browser vs server clients)
- `lib/blockchain/providers/provider.ts` (client creation logic)
