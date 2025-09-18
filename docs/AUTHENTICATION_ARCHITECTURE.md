# Authentication Architecture Documentation

## Overview

This document describes the **actual authentication architecture** implemented in the P2E Inferno application. The system provides multi-layered security through Privy wallet authentication, blockchain admin key verification, and an enhanced admin session system.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │     Backend      │    │   Blockchain    │
│   (Browser)     │    │   (Next.js)      │    │   (Base Network)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
│                      │                      │
│ 1. Privy JWT         │ 4. Admin Session    │ 7. Key Verification
│ 2. Wallet Connect    │ 5. Middleware       │ 8. Unlock Protocol
│ 3. Admin UI Gates    │ 6. API Protection   │ 9. Smart Contracts
│                      │                      │
```

## Authentication Layers

### 1. User Authentication Layer
**Purpose**: Wallet-based user authentication via Privy
**Files**:
- Frontend: Privy React hooks (`usePrivy`)
- Backend: `lib/auth/privy.ts`

**Flow**:
1. User connects wallet through Privy
2. Privy generates JWT token
3. Token verified on backend via `getPrivyUserFromNextRequest()`
4. Fallback to local JWT verification if Privy API unavailable

### 2. Admin Authentication Layer
**Purpose**: Blockchain-based admin access verification
**Files**:
- `hooks/useLockManagerAdminAuth.ts` - Frontend admin validation
- `lib/auth/admin-auth.ts` - Backend admin middleware (`withAdminAuth`)
- `lib/auth/admin-key-checker.ts` - Blockchain key verification

**Security Features**:
- Parallel wallet checking for performance
- On-chain admin key verification via Unlock Protocol
- Development fallback with `DEV_ADMIN_ADDRESSES`
- Wallet ownership validation to prevent session hijacking

### 3. Admin Session Layer (Enhanced Security)
**Purpose**: Fresh session requirements for admin operations
**Files**:
- `lib/auth/admin-session.ts` - Session management
- `middleware.ts` - Session cookie validation
- `hooks/useAdminSession.ts` - Frontend session state
- `hooks/useAdminAuthWithSession.ts` - Combined auth + session
- `components/admin/AdminSessionGate.tsx` - UI protection

**Features**:
- Short-lived sessions (configurable TTL, default 3 minutes)
- Automatic session refresh via `useAdminApi`
- HttpOnly cookies for security
- Fresh authentication required per browser session

## Current Implementation

### Frontend Components

#### User Authentication
```typescript
import { usePrivy } from "@privy-io/react-auth";

const { authenticated, user, login, logout } = usePrivy();
```

#### Admin Authentication (Blockchain Only)
```typescript
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
```

#### Enhanced Admin Authentication (Blockchain + Session)
```typescript
import { useAdminAuthWithSession } from "@/hooks/useAdminAuthWithSession";

const {
  isFullyAuthenticated,
  needsSessionAuth,
  createAdminSession
} = useAdminAuthWithSession();
```

#### Admin Page Protection
```typescript
import AdminSessionGate from "@/components/admin/AdminSessionGate";

export default function AdminPage() {
  return (
    <AdminSessionGate>
      <AdminLayout>
        <AdminContent />
      </AdminLayout>
    </AdminSessionGate>
  );
}
```

### Backend API Protection

#### Admin API Endpoints
```typescript
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Protected admin logic
}

export default withAdminAuth(handler);
```

#### Admin API Calls (Frontend)
```typescript
import { useAdminApi } from "@/hooks/useAdminApi";

const { adminFetch } = useAdminApi();

// Automatic session refresh on 401 errors
const result = await adminFetch("/api/admin/users", {
  method: "POST",
  body: JSON.stringify(userData)
});
```

### Session Management

#### Session Creation
- **Endpoint**: `POST /api/admin/session`
- **Trigger**: Initial admin access or session expiration
- **Validation**: Blockchain admin key verification required
- **Result**: HttpOnly admin-session cookie

#### Session Verification
- **Endpoint**: `GET /api/admin/session/verify`
- **Purpose**: Check session validity without full authentication
- **Used by**: `useAdminSession` hook for state management

#### Middleware Protection
```typescript
// middleware.ts - Runs on all /api/admin/* requests
export async function middleware(req: NextRequest) {
  if (process.env.ADMIN_SESSION_ENABLED !== 'true') return;

  const cookieToken = req.cookies.get('admin-session')?.value;
  if (!cookieToken) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 401 });
  }

  const claims = await verifyAdminSession(cookieToken);
  // Proceed if valid, reject if expired/invalid
}
```

## Authentication Flows

### Standard User Flow
1. User visits app → Connects wallet via Privy
2. Privy generates JWT → Stored in browser
3. API requests include JWT → Backend verifies via `getPrivyUserFromNextRequest()`
4. User profile retrieved/created in Supabase

### Admin Access Flow (Traditional)
1. Complete user authentication (steps 1-4 above)
2. Frontend checks admin access → `useLockManagerAdminAuth`
3. Blockchain validation → Check admin keys via Unlock Protocol
4. Admin UI access granted if valid keys found

### Enhanced Admin Flow (Session Gate)
1. Complete user authentication + admin validation (steps 1-4 above)
2. Check admin session → `useAdminSession.checkSession()`
3. **If no session**: Show `AdminSessionRequired` → User creates session
4. **If session exists**: Proceed to admin content
5. **During use**: Auto-refresh session every 3 minutes via `useAdminApi`
6. **On expiration**: Force fresh authentication

## Security Features

### Defense in Depth
```typescript
// Layer 1: Middleware (Session Cookie)
middleware.ts → verifyAdminSession(cookieToken)

// Layer 2: API Authentication (Blockchain Verification)
withAdminAuth → checkMultipleWalletsForAdminKey(wallets, adminLock)

// Layer 3: Request Validation (Active Wallet)
X-Active-Wallet header → Verify wallet ownership + admin key
```

### Session Security
- **HttpOnly cookies** - Prevent XSS extraction
- **Short TTL** - 3-minute default (configurable via `ADMIN_SESSION_TTL_SECONDS`)
- **Wallet binding** - Sessions tied to specific wallet addresses
- **Auto-expiration** - Idle sessions automatically expire

### Wallet Validation
```typescript
// Prevents session hijacking
if (connectedWallet !== session.wallet) {
  await logout(); // Force re-authentication
}

// Active wallet verification for write operations
if (method !== 'GET' && !activeWallet) {
  return res.status(428).json({ error: 'Active wallet required' });
}
```

## File Structure

### Authentication Core
```
lib/auth/
├── admin-auth.ts           # withAdminAuth middleware
├── admin-session.ts        # Session creation/verification
├── admin-key-checker.ts    # Blockchain key verification
├── privy.ts               # Server-side Privy utilities
├── error-handler.ts       # Structured error handling
└── config-validation.ts   # Configuration validation
```

### Frontend Hooks
```
hooks/
├── useLockManagerAdminAuth.ts    # Blockchain admin auth
├── useAdminAuthWithSession.ts    # Enhanced admin auth
├── useAdminSession.ts           # Session state management
└── useAdminApi.ts              # Admin API calls + auto-refresh
```

### UI Components
```
components/admin/
├── AdminSessionGate.tsx      # Session gate protection
├── AdminSessionRequired.tsx  # Session creation UI
└── AdminAccessRequired.tsx   # Blockchain access UI
```

### API Endpoints
```
app/api/admin/
├── session/route.ts          # Session creation
├── session/verify/route.ts   # Session verification
└── logout/route.ts          # Session cleanup

pages/api/admin/
├── [endpoint].ts            # Protected with withAdminAuth
└── ...                     # All admin endpoints
```

## Configuration

### Environment Variables
```bash
# Session System
ADMIN_SESSION_ENABLED=true              # Enable session middleware
ADMIN_SESSION_TTL_SECONDS=180           # Session lifetime (3 minutes)
ADMIN_SESSION_JWT_SECRET=<secret>       # Session signing key
ADMIN_SESSION_RATE_LIMIT_PER_MINUTE=30  # Rate limiting

# Admin Lock
NEXT_PUBLIC_ADMIN_LOCK_ADDRESS=0x...    # Unlock Protocol admin lock
DEV_ADMIN_ADDRESSES=0x...              # Development admin wallets

# Privy
NEXT_PUBLIC_PRIVY_CLIENT_ID=...        # Frontend Privy client
NEXT_PRIVY_APP_SECRET=...              # Backend Privy secret
PRIVY_VERIFICATION_KEY=...             # JWT verification key
```

### Development vs Production

| Feature | Development | Production |
|---------|------------|------------|
| Admin Access | `DEV_ADMIN_ADDRESSES` fallback | Blockchain verification only |
| Session TTL | Configurable | Configurable (shorter recommended) |
| Error Logging | Full details | Sanitized sensitive data |
| Config Validation | Warnings | Hard errors |

## Error Handling

### Structured Error Types
```typescript
// lib/utils/error-utils.ts
export function normalizeAdminApiError(status: number, body?: any) {
  if (status === 428) return "Active wallet connection required";
  if (status === 401) return "Admin authentication required";
  if (status === 403) return "Admin access required";
  // ... additional error normalization
}
```

### Safe Error Logging
```typescript
// Automatically filters sensitive data
logAdminApiError(status, body, {
  operation: 'POST /api/admin/users',
  walletAddress: activeWallet,
  attempt: 'original'
});
```

## Usage Examples

### Protecting Admin Pages
```typescript
// Old pattern (blockchain only)
const { isAdmin, loading } = useLockManagerAdminAuth();
if (!isAdmin) return <AdminAccessRequired />;

// New pattern (session gate)
return (
  <AdminSessionGate>
    <AdminLayout>
      <AdminContent />
    </AdminLayout>
  </AdminSessionGate>
);
```

### Making Admin API Calls
```typescript
const { adminFetch } = useAdminApi();

// Automatic session refresh and error handling
try {
  const result = await adminFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });

  if (result.error) {
    // Normalized error message
    toast.error(result.error);
  } else {
    // Success
    setUsers(result.data);
  }
} catch (error) {
  // Network or unexpected errors
  console.error('API call failed:', error);
}
```

## Migration Guide

### From Old Admin Auth
```typescript
// Before: Direct authentication checks
const { isAdmin } = useLockManagerAdminAuth();
if (!isAdmin) return <AdminAccessRequired />;

// After: Session gate pattern
return <AdminSessionGate>{content}</AdminSessionGate>;
```

### From Direct Fetch to useAdminApi
```typescript
// Before: Manual authentication
const token = await getAccessToken();
const response = await fetch('/api/admin/endpoint', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// After: Automatic session management
const { adminFetch } = useAdminApi();
const result = await adminFetch('/api/admin/endpoint');
```

## Why This Architecture?

### Security Benefits
- **Fresh admin authentication** required per browser session
- **Defense in depth** with multiple validation layers
- **Short session lifetimes** limit exposure from compromised sessions
- **Blockchain verification** provides cryptographic proof of admin rights

### User Experience Benefits
- **Seamless auto-refresh** during active admin use
- **Clear re-authentication flow** when sessions expire
- **Consistent error handling** across all admin operations
- **Standard web2 admin behavior** familiar to users

### Developer Benefits
- **Simple integration** with `AdminSessionGate` wrapper
- **Automatic error handling** via `useAdminApi`
- **Clear separation** between user and admin authentication
- **Easy testing** with development admin addresses

---

*This architecture provides enterprise-grade security for admin operations while maintaining excellent user experience through automatic session management and clear authentication flows.*