# Authentication Developer Guide

## Quick Start

This guide provides practical examples for implementing authentication in the P2E Inferno app. For architectural details, see [AUTHENTICATION_ARCHITECTURE.md](./AUTHENTICATION_ARCHITECTURE.md).

## Table of Contents

1. [Frontend Authentication](#frontend-authentication)
2. [Admin Page Protection](#admin-page-protection)
3. [API Endpoint Protection](#api-endpoint-protection)
4. [Making Admin API Calls](#making-admin-api-calls)
5. [Error Handling](#error-handling)
6. [Testing Authentication](#testing-authentication)
7. [Common Patterns](#common-patterns)
8. [Troubleshooting](#troubleshooting)

## Frontend Authentication

### Basic User Authentication

```typescript
// pages/profile.tsx
import { usePrivy } from "@privy-io/react-auth";

export default function ProfilePage() {
  const { authenticated, user, login, logout } = usePrivy();

  if (!authenticated) {
    return (
      <div>
        <h1>Please Connect Your Wallet</h1>
        <button onClick={login}>Connect Wallet</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user.wallet?.address}</h1>
      <button onClick={logout}>Disconnect</button>
    </div>
  );
}
```

### Admin Authentication (Blockchain Only)

```typescript
// pages/admin/simple-admin.tsx
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";

export default function SimpleAdminPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();

  if (loading) {
    return <div>Checking admin access...</div>;
  }

  if (!authenticated || !isAdmin) {
    return <AdminAccessRequired message="Admin access required" />;
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {/* Admin content */}
    </div>
  );
}
```

### Enhanced Admin Authentication (Session Gate)

```typescript
// pages/admin/secure-admin.tsx
import AdminSessionGate from "@/components/admin/AdminSessionGate";
import AdminLayout from "@/components/layouts/AdminLayout";

export default function SecureAdminPage() {
  return (
    <AdminSessionGate>
      <AdminLayout>
        <div>
          <h1>Secure Admin Dashboard</h1>
          {/* This content requires fresh admin session */}
        </div>
      </AdminLayout>
    </AdminSessionGate>
  );
}
```

## Admin Page Protection

### Option 1: Manual Authentication Check

```typescript
import { useEffect, useState } from "react";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";

export default function ManualAdminPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Show loading during SSR and auth check
  if (loading || !isClient) {
    return <div>Loading...</div>;
  }

  // Show access required if not admin
  if (!authenticated || !isAdmin) {
    return <AdminAccessRequired />;
  }

  return (
    <div>
      {/* Protected admin content */}
    </div>
  );
}
```

### Option 2: Session Gate (Recommended)

```typescript
import AdminSessionGate from "@/components/admin/AdminSessionGate";
import AdminLayout from "@/components/layouts/AdminLayout";

export default function ProtectedAdminPage() {
  return (
    <AdminSessionGate
      // Optional: Custom loading component
      loadingComponent={<CustomLoadingSpinner />}
    >
      <AdminLayout>
        {/* Protected content - automatically handles all auth checks */}
      </AdminLayout>
    </AdminSessionGate>
  );
}
```

### Option 3: Conditional Session Gate

```typescript
import { useState } from "react";
import AdminSessionGate from "@/components/admin/AdminSessionGate";

export default function ConditionalAdminPage() {
  const [requireSession, setRequireSession] = useState(false);

  return (
    <AdminSessionGate requiresSession={requireSession}>
      <div>
        <h1>Admin Page</h1>

        {/* Some content available without session */}
        <div>Basic admin info...</div>

        {/* Button to enable session requirement */}
        <button onClick={() => setRequireSession(true)}>
          Access Secure Features
        </button>

        {requireSession && (
          <div>Secure admin operations...</div>
        )}
      </div>
    </AdminSessionGate>
  );
}
```

## API Endpoint Protection

### Protecting Admin API Endpoints

```typescript
// pages/api/admin/users.ts
import { NextApiRequest, NextApiResponse } from "next";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Get all users
    const users = await getUsersFromDatabase();
    return res.status(200).json({ users });
  }

  if (req.method === "POST") {
    // Create user - requires active wallet for write operations
    const { name, email } = req.body;
    const newUser = await createUser({ name, email });
    return res.status(201).json({ user: newUser });
  }

  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}

// This automatically handles:
// 1. Privy JWT verification
// 2. Blockchain admin key verification
// 3. X-Active-Wallet header validation (for write operations)
// 4. Error handling and logging
export default withAdminAuth(handler);
```

### User API Endpoints (Non-Admin)

```typescript
// pages/api/user/profile.ts
import { NextApiRequest, NextApiResponse } from "next";
import { getPrivyUserFromNextRequest } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify user authentication
    const user = await getPrivyUserFromNextRequest(req, true); // includeWallets = true

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.method === "GET") {
      // Return user profile
      return res.status(200).json({ user });
    }

    if (req.method === "PUT") {
      // Update user profile
      const { name } = req.body;
      const updatedUser = await updateUserProfile(user.id, { name });
      return res.status(200).json({ user: updatedUser });
    }

    res.setHeader("Allow", ["GET", "PUT"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error("User API error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
```

## Making Admin API Calls

### Using useAdminApi Hook

```typescript
// components/admin/UserManagement.tsx
import { useState, useEffect } from "react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { toast } from "react-hot-toast";

interface User {
  id: string;
  name: string;
  email: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Configure admin API with options
  const { adminFetch } = useAdminApi({
    suppressToasts: false, // Show error toasts
    autoSessionRefresh: true, // Auto-refresh on 401
  });

  // Fetch users
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const result = await adminFetch<{ users: User[] }>("/api/admin/users");

      if (result.error) {
        toast.error(result.error);
      } else {
        setUsers(result.data?.users || []);
      }
    } catch (error) {
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  // Create user
  const createUser = async (userData: { name: string; email: string }) => {
    try {
      const result = await adminFetch<{ user: User }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(userData),
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("User created successfully");
        setUsers(prev => [...prev, result.data!.user]);
      }
    } catch (error) {
      toast.error("Failed to create user");
    }
  };

  // Delete user
  const deleteUser = async (userId: string) => {
    try {
      const result = await adminFetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("User deleted successfully");
        setUsers(prev => prev.filter(user => user.id !== userId));
      }
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div>
      <h2>User Management</h2>

      {loading ? (
        <div>Loading users...</div>
      ) : (
        <div>
          {users.map(user => (
            <div key={user.id}>
              <span>{user.name} ({user.email})</span>
              <button onClick={() => deleteUser(user.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <UserCreateForm onSubmit={createUser} />
    </div>
  );
}
```

### Manual API Calls (Not Recommended)

```typescript
// Only use this pattern if useAdminApi doesn't meet your needs
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

export function ManualAdminAPICall() {
  const { getAccessToken } = usePrivy();
  const selectedWallet = useSmartWalletSelection() as any;

  const makeAdminCall = async () => {
    try {
      const accessToken = await getAccessToken();

      // Try primary session endpoint first
      let sessionResponse = await fetch('/api/admin/session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Active-Wallet': selectedWallet?.address || '',
        },
        credentials: 'include',
      });

      // Fallback to session-fallback
      if (!sessionResponse.ok) {
        sessionResponse = await fetch('/api/admin/session-fallback', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Active-Wallet': selectedWallet?.address || '',
          },
          credentials: 'include',
        });
      }

      if (!sessionResponse.ok) {
        throw new Error('Failed to create admin session');
      }

      // Now make the actual API call
      const response = await fetch('/api/admin/users', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Active-Wallet': selectedWallet?.address || '',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('API call failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Manual API call failed:', error);
      throw error;
    }
  };

  return (
    <button onClick={makeAdminCall}>
      Make Manual Admin Call
    </button>
  );
}
```

## Error Handling

### Using Built-in Error Handling

```typescript
import { useAdminApi } from "@/hooks/useAdminApi";

export function ComponentWithErrorHandling() {
  const { adminFetch } = useAdminApi({
    suppressToasts: false, // Show error toasts automatically
  });

  const handleAction = async () => {
    const result = await adminFetch("/api/admin/action");

    // Errors are automatically:
    // 1. Normalized to user-friendly messages
    // 2. Logged with context for debugging
    // 3. Displayed as toast notifications

    if (result.error) {
      // Error already displayed as toast
      // Additional error handling if needed
      console.log("Operation failed:", result.error);
    } else {
      // Success handling
      console.log("Operation succeeded:", result.data);
    }
  };

  return <button onClick={handleAction}>Perform Action</button>;
}
```

### Custom Error Handling

```typescript
import { useAdminApi } from "@/hooks/useAdminApi";
import { normalizeAdminApiError } from "@/lib/utils/error-utils";

export function ComponentWithCustomErrorHandling() {
  const { adminFetch } = useAdminApi({
    suppressToasts: true, // Handle errors manually
  });

  const handleAction = async () => {
    try {
      const result = await adminFetch("/api/admin/action");

      if (result.error) {
        // Custom error handling
        if (result.error.includes("unauthorized")) {
          // Handle auth errors specifically
          window.location.href = "/admin";
        } else {
          // Handle other errors
          alert(`Error: ${result.error}`);
        }
      } else {
        // Success
        console.log("Success:", result.data);
      }
    } catch (error) {
      // Network or unexpected errors
      console.error("Unexpected error:", error);
      alert("An unexpected error occurred");
    }
  };

  return <button onClick={handleAction}>Perform Action</button>;
}
```

## Testing Authentication

### Development Admin Addresses

```bash
# .env.local
DEV_ADMIN_ADDRESSES=0x7a2bf39919bb7e7bf3c0a96f005a0842cfdaa8ac,0xd443188B33a13A24F63AC3A49d54DB97cf64349A
```

### Testing Components

```typescript
// __tests__/auth/AdminComponent.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { usePrivy } from "@privy-io/react-auth";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminComponent from "@/components/admin/AdminComponent";

// Mock authentication hooks
jest.mock("@privy-io/react-auth");
jest.mock("@/hooks/useLockManagerAdminAuth");

const mockUsePrivy = usePrivy as jest.MockedFunction<typeof usePrivy>;
const mockUseLockManagerAdminAuth = useLockManagerAdminAuth as jest.MockedFunction<typeof useLockManagerAdminAuth>;

describe("AdminComponent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows access required when not admin", async () => {
    mockUsePrivy.mockReturnValue({
      authenticated: true,
      user: { wallet: { address: "0x123" } },
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    mockUseLockManagerAdminAuth.mockReturnValue({
      isAdmin: false,
      loading: false,
      authenticated: true,
    } as any);

    render(<AdminComponent />);

    await waitFor(() => {
      expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
    });
  });

  it("shows admin content when authenticated", async () => {
    mockUsePrivy.mockReturnValue({
      authenticated: true,
      user: { wallet: { address: "0x123" } },
      login: jest.fn(),
      logout: jest.fn(),
    } as any);

    mockUseLockManagerAdminAuth.mockReturnValue({
      isAdmin: true,
      loading: false,
      authenticated: true,
    } as any);

    render(<AdminComponent />);

    await waitFor(() => {
      expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
    });
  });
});
```

### Testing API Endpoints

```typescript
// __tests__/api/admin/users.test.ts
import { createMocks } from "node-mocks-http";
import handler from "@/pages/api/admin/users";
import { withAdminAuth } from "@/lib/auth/admin-auth";

// Mock the auth middleware
jest.mock("@/lib/auth/admin-auth", () => ({
  withAdminAuth: jest.fn((handler) => handler),
}));

describe("/api/admin/users", () => {
  it("returns users for GET request", async () => {
    const { req, res } = createMocks({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty("users");
    expect(Array.isArray(data.users)).toBe(true);
  });

  it("creates user for POST request", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        name: "Test User",
        email: "test@example.com",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty("user");
    expect(data.user.name).toBe("Test User");
  });
});
```

## Common Patterns

### Loading States with Authentication

```typescript
export function AdminPageWithLoading() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    // Simulate page data loading
    const timer = setTimeout(() => setPageLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Show loading spinner while auth is checking OR page is loading
  if (loading || pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  if (!authenticated || !isAdmin) {
    return <AdminAccessRequired />;
  }

  return (
    <div>
      {/* Page content */}
    </div>
  );
}
```

### Conditional Admin Features

```typescript
export function ComponentWithAdminFeatures() {
  const { authenticated } = usePrivy();
  const { isAdmin } = useLockManagerAdminAuth();

  return (
    <div>
      {/* Content available to all users */}
      <div>Public content...</div>

      {/* Content only for authenticated users */}
      {authenticated && (
        <div>User-only content...</div>
      )}

      {/* Content only for admin users */}
      {isAdmin && (
        <div>
          <h3>Admin Controls</h3>
          <button>Admin Action</button>
        </div>
      )}
    </div>
  );
}
```

### Session Status Display

```typescript
import { useAdminSession } from "@/hooks/useAdminSession";

export function AdminSessionStatus() {
  const { hasValidSession, sessionExpiry, isCheckingSession } = useAdminSession();

  if (isCheckingSession) {
    return <div>Checking session...</div>;
  }

  return (
    <div className="bg-gray-100 p-4 rounded">
      <h4>Session Status</h4>

      {hasValidSession ? (
        <div className="text-green-600">
          ✅ Active Session
          {sessionExpiry && (
            <div className="text-sm">
              Expires: {new Date(sessionExpiry * 1000).toLocaleString()}
            </div>
          )}
        </div>
      ) : (
        <div className="text-red-600">
          ❌ No Active Session
        </div>
      )}
    </div>
  );
}
```

## Troubleshooting

### Common Issues

#### 1. "Active wallet required" Error
```typescript
// Problem: Missing X-Active-Wallet header for write operations
// Solution: Use useAdminApi which automatically includes this header

// ❌ Wrong
const response = await fetch('/api/admin/users', {
  method: 'POST',
  body: JSON.stringify(data)
});

// ✅ Correct
const { adminFetch } = useAdminApi();
const result = await adminFetch('/api/admin/users', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

#### 2. Infinite Loops in useEffect
```typescript
// ❌ Wrong - unstable dependencies
const { adminFetch } = useAdminApi();
useEffect(() => {
  fetchData();
}, [adminFetch]); // adminFetch changes on every render

// ✅ Correct - stable dependencies
const { adminFetch } = useAdminApi();
const fetchData = useCallback(async () => {
  // fetch logic
}, [adminFetch]);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

#### 3. Session Not Being Created
```typescript
// Check these environment variables:
ADMIN_SESSION_ENABLED=true
ADMIN_SESSION_JWT_SECRET=<your-secret>
NEXT_PUBLIC_ADMIN_LOCK_ADDRESS=<admin-lock-address>

// In development, also check:
DEV_ADMIN_ADDRESSES=<your-wallet-address>
```

#### 4. Admin Access Denied
```typescript
// Verify wallet has admin key:
// 1. Check your wallet address is in DEV_ADMIN_ADDRESSES (development)
// 2. Check your wallet owns a key for the admin lock (production)
// 3. Check the admin lock address is correct in environment variables

import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";

export function AdminDebugInfo() {
  const { isAdmin, loading, user } = useLockManagerAdminAuth();

  return (
    <div>
      <div>Loading: {loading.toString()}</div>
      <div>Is Admin: {isAdmin.toString()}</div>
      <div>Wallet: {user?.wallet?.address}</div>
      <div>Admin Lock: {process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS}</div>
    </div>
  );
}
```

### Debugging Tools

#### 1. Enable Debug Logging
```bash
# .env.local
LOG_LEVEL=debug
NEXT_PUBLIC_LOG_LEVEL=debug
```

#### 2. Check Admin Session
```typescript
// Add this component to debug session issues
import { useAdminSession } from "@/hooks/useAdminSession";

export function SessionDebugger() {
  const session = useAdminSession();

  return (
    <pre>{JSON.stringify(session, null, 2)}</pre>
  );
}
```

#### 3. Network Inspector
- Open browser DevTools → Network tab
- Look for calls to `/api/admin/session` and `/api/admin/session/verify`
- Check response status codes and error messages
- Verify cookies are being set/sent correctly

---

*This guide covers the most common authentication patterns. For architectural details and advanced configuration, see [AUTHENTICATION_ARCHITECTURE.md](./AUTHENTICATION_ARCHITECTURE.md).*