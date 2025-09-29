import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { usePrivy, useUser, useWallets } from "@privy-io/react-auth";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { useLockManagerClient } from "@/hooks/useLockManagerClient";
import {
  AdminAuthProvider,
  useAdminAuthContext,
  isFullyAuthenticated,
  isAuthLoading,
  getAuthStatusMessage,
} from "@/contexts/admin-context";

// ================================
// ADDITIONAL MOCKS FOR ADMIN AUTH
// ================================

// Mock the admin-specific hooks that aren't in global setup
jest.mock("@/hooks/useDetectConnectedWalletAddress", () => ({
  useDetectConnectedWalletAddress: jest.fn(),
}));

jest.mock("@/hooks/useLockManagerClient", () => ({
  useLockManagerClient: jest.fn(),
}));

// Override the global Privy mock to be more controllable
jest.mock("@privy-io/react-auth", () => ({
  usePrivy: jest.fn(),
  useUser: jest.fn(),
  useWallets: jest.fn(),
}));

// Mock window.ethereum with event handlers (extends global mock)
const mockEthereum = {
  ...((global as any).window?.ethereum || {}),
  on: jest.fn(),
  removeListener: jest.fn(),
};

// Set up window.ethereum
Object.defineProperty(window, "ethereum", {
  value: mockEthereum,
  writable: true,
});

// ================================
// TYPE MOCKS
// ================================

const mockUsePrivy = usePrivy as jest.MockedFunction<typeof usePrivy>;
const mockUseUser = useUser as jest.MockedFunction<typeof useUser>;
const mockUseDetectConnectedWalletAddress =
  useDetectConnectedWalletAddress as jest.MockedFunction<
    typeof useDetectConnectedWalletAddress
  >;
const mockUseLockManagerClient = useLockManagerClient as jest.MockedFunction<
  typeof useLockManagerClient
>;
const mockUseWallets = useWallets as jest.MockedFunction<typeof useWallets>;
const mockLockManager = {
  checkUserHasValidKey: jest.fn(),
};

// ================================
// MOCK FACTORIES
// ================================

const createMockUser = (overrides: any = {}) => ({
  id: "mock-user-id",
  createdAt: new Date(),
  linkedAccounts: [],
  mfaMethods: [],
  hasAcceptedTerms: false,
  isGuest: false,
  ...overrides,
});

const createMockWallet = (overrides: any = {}) => ({
  address: "0xmock-address",
  chainType: "ethereum" as const,
  imported: false,
  delegated: false,
  walletIndex: 0,
  ...overrides,
});

// ================================
// TEST COMPONENTS
// ================================

const TestConsumer: React.FC = () => {
  const {
    authStatus,
    isAdmin,
    authenticated,
    user,
    walletAddress,
    isLoadingAuth,
    hasValidSession,
    refreshAdminStatus,
    createAdminSession,
    authError,
  } = useAdminAuthContext();

  return (
    <div>
      <div data-testid="auth-status">{authStatus}</div>
      <div data-testid="is-admin">{isAdmin.toString()}</div>
      <div data-testid="authenticated">{authenticated.toString()}</div>
      <div data-testid="user-id">{user?.id || "no-user"}</div>
      <div data-testid="wallet-address">{walletAddress || "no-wallet"}</div>
      <div data-testid="loading-auth">{isLoadingAuth.toString()}</div>
      <div data-testid="has-session">{hasValidSession.toString()}</div>
      <div data-testid="auth-error">{authError || "no-error"}</div>
      <button data-testid="refresh-button" onClick={() => refreshAdminStatus()}>
        Refresh
      </button>
      <button
        data-testid="create-session-button"
        onClick={() => createAdminSession()}
      >
        Create Session
      </button>
    </div>
  );
};

const OutsideProviderConsumer: React.FC = () => {
  try {
    useAdminAuthContext();
    return <div>Should not render</div>;
  } catch (error) {
    return <div data-testid="error-message">{(error as Error).message}</div>;
  }
};

// ================================
// HELPER FUNCTIONS
// ================================

const setupMocks = (
  overrides: {
    privy?: Partial<ReturnType<typeof usePrivy>>;
    user?: Partial<ReturnType<typeof useUser>>;
    wallet?: Partial<ReturnType<typeof useDetectConnectedWalletAddress>>;
    wallets?: Partial<ReturnType<typeof useWallets>>;
    lockManager?: Partial<typeof mockLockManager>;
    fetch?: jest.Mock;
  } = {},
) => {
  // Default mock values
  const defaultPrivy = {
    authenticated: false,
    ready: false,
    logout: jest.fn(),
    login: jest.fn(),
    getAccessToken: jest.fn().mockResolvedValue('test-access-token'),
  };

  const defaultUser = {
    user: null,
  };

  const defaultWallet = {
    walletAddress: null,
  };

  // Set up mocks
  mockUsePrivy.mockReturnValue({
    ...defaultPrivy,
    ...overrides.privy,
  } as ReturnType<typeof usePrivy>);

  mockUseUser.mockReturnValue({
    ...defaultUser,
    ...overrides.user,
  } as ReturnType<typeof useUser>);

  mockUseDetectConnectedWalletAddress.mockReturnValue({
    ...defaultWallet,
    ...overrides.wallet,
  } as ReturnType<typeof useDetectConnectedWalletAddress>);

  const defaultWallets = { wallets: [] };
  const derivedWallets = overrides.wallets
    ? { ...defaultWallets, ...overrides.wallets }
    : overrides.wallet?.walletAddress
    ? {
        wallets: [
          {
            walletClientType: 'injected',
            address: overrides.wallet.walletAddress,
          },
        ],
      }
    : defaultWallets;

  mockUseWallets.mockReturnValue(derivedWallets as ReturnType<typeof useWallets>);

  mockLockManager.checkUserHasValidKey = jest.fn();
  mockUseLockManagerClient.mockReturnValue(mockLockManager as any);

  if (overrides.lockManager) {
    Object.assign(mockLockManager, overrides.lockManager);
  }

  const defaultFetch = jest.fn(async (input: RequestInfo) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/api/admin/session/verify')) {
      return {
        ok: true,
        json: async () => ({ valid: true, expiresAt: Math.floor(Date.now() / 1000) + 60 }),
      } as any;
    }
    return {
      ok: true,
      json: async () => ({ success: true }),
    } as any;
  });

  (global.fetch as jest.Mock).mockImplementation(overrides.fetch ?? defaultFetch);
};

const renderWithProvider = (component: React.ReactNode) => {
  return render(<AdminAuthProvider>{component}</AdminAuthProvider>);
};

// ================================
// TESTS
// ================================

describe("AdminAuthContext", () => {
  beforeEach(() => {
    // Set required environment variable
    process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS =
      "0x1234567890abcdef1234567890abcdef12345678";

    // Clear ethereum event mocks
    mockEthereum.on.mockClear();
    mockEthereum.removeListener.mockClear();
  });

  describe("Provider", () => {
    test("provides initial loading state", () => {
      setupMocks({
        privy: { ready: false },
      });

      renderWithProvider(<TestConsumer />);

      expect(screen.getByTestId("auth-status")).toHaveTextContent("loading");
      expect(screen.getByTestId("is-admin")).toHaveTextContent("false");
      expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
      expect(screen.getByTestId("loading-auth")).toHaveTextContent("true");
    });

    test("shows privy_required when not authenticated", async () => {
      setupMocks({
        privy: { ready: true, authenticated: false },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "privy_required",
        );
        expect(screen.getByTestId("loading-auth")).toHaveTextContent("false");
      });
    });

    test("shows wallet_required when authenticated but no wallet", async () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: { user: createMockUser({ id: "user123" }) },
        wallet: { walletAddress: null },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "wallet_required",
        );
        expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
        expect(screen.getByTestId("user-id")).toHaveTextContent("user123");
      });
    });

    test("shows blockchain_denied when wallet connected but no admin access", async () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xuser123" }),
          }),
        },
        wallet: { walletAddress: "0xuser123" },
        lockManager: {
          checkUserHasValidKey: jest.fn().mockResolvedValue({ isValid: false }),
        },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "blockchain_denied",
        );
        expect(screen.getByTestId("is-admin")).toHaveTextContent("false");
        expect(screen.getByTestId("wallet-address")).toHaveTextContent(
          "0xuser123",
        );
      });
    });

    test("shows session_required when admin access granted but no session", async () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xadmin123" }),
          }),
        },
        wallet: { walletAddress: "0xadmin123" },
        lockManager: {
          checkUserHasValidKey: jest.fn().mockResolvedValue({
            isValid: true,
            expirationTimestamp: BigInt(Number.MAX_SAFE_INTEGER),
          }),
        },
        fetch: jest.fn(async (input: RequestInfo) => {
          const url = typeof input === 'string' ? input : input.url;
          if (url.includes('/api/admin/session/verify')) {
            return {
              ok: true,
              json: async () => ({ valid: false }),
            } as any;
          }
          return {
            ok: true,
            json: async () => ({ success: true }),
          } as any;
        }),
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "session_required",
        );
        expect(screen.getByTestId("is-admin")).toHaveTextContent("true");
        expect(screen.getByTestId("has-session")).toHaveTextContent("false");
      });
    });

    test("handles blockchain check errors gracefully", async () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xuser123" }),
          }),
        },
        wallet: { walletAddress: "0xuser123" },
        lockManager: {
          checkUserHasValidKey: jest
            .fn()
            .mockRejectedValue(new Error("RPC Error")),
        },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "blockchain_denied",
        );
        expect(screen.getByTestId("is-admin")).toHaveTextContent("false");
        expect(screen.getByTestId("auth-error")).toHaveTextContent("RPC Error");
      });
    });

    test("handles missing admin lock address", async () => {
      delete process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xuser123" }),
          }),
        },
        wallet: { walletAddress: "0xuser123" },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-status")).toHaveTextContent(
          "blockchain_denied",
        );
        expect(screen.getByTestId("is-admin")).toHaveTextContent("false");
        expect(screen.getByTestId("auth-error")).toHaveTextContent(
          "Admin lock address not configured",
        );
      });
    });

    test("validates wallet ownership correctly", async () => {
      const mockLogout = jest.fn();

      setupMocks({
        privy: { ready: true, authenticated: true, logout: mockLogout },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xdifferent123" }), // Different from connected wallet
          }),
        },
        wallet: { walletAddress: "0xconnected123" }, // Different wallet connected
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
        expect(screen.getByTestId("auth-error")).toHaveTextContent(
          "Wallet security validation failed",
        );
      });
    });
  });

  describe("useAdminAuthContext hook", () => {
    test("throws error when used outside provider", () => {
      render(<OutsideProviderConsumer />);

      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "useAdminAuthContext must be used within an AdminAuthProvider",
      );
    });

    test("returns context value when used inside provider", () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xadmin123" }),
          }),
        },
        wallet: { walletAddress: "0xadmin123" },
      });

      renderWithProvider(<TestConsumer />);

      expect(screen.getByTestId("user-id")).toHaveTextContent("user123");
      expect(screen.getByTestId("wallet-address")).toHaveTextContent(
        "0xadmin123",
      );
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    });

    test("provides working action methods", async () => {
      const mockCheckUserHasValidKey = jest
        .fn()
        .mockResolvedValue({ isValid: true });

      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xadmin123" }),
          }),
        },
        wallet: { walletAddress: "0xadmin123" },
        lockManager: {
          checkUserHasValidKey: mockCheckUserHasValidKey,
        },
      });

      renderWithProvider(<TestConsumer />);

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("is-admin")).toHaveTextContent("true");
      });

      // Test refresh action
      await act(async () => {
        screen.getByTestId("refresh-button").click();
      });

      await waitFor(() => {
        expect(mockCheckUserHasValidKey).toHaveBeenCalledTimes(2); // Initial + refresh
      });

      // Test session creation (mock implementation)
      await act(async () => {
        screen.getByTestId("create-session-button").click();
      });

      await waitFor(
        () => {
          expect(screen.getByTestId("has-session")).toHaveTextContent("true");
        },
        { timeout: 2000 },
      ); // Increase timeout for async session creation
    });
  });

  describe("Performance and Caching", () => {
    test("caches auth results and avoids duplicate calls", async () => {
      const mockCheckUserHasValidKey = jest
        .fn()
        .mockResolvedValue({ isValid: true });

      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xadmin123" }),
          }),
        },
        wallet: { walletAddress: "0xadmin123" },
        lockManager: {
          checkUserHasValidKey: mockCheckUserHasValidKey,
        },
      });

      const { rerender } = renderWithProvider(<TestConsumer />);

      // Wait for initial call
      await waitFor(() => {
        expect(mockCheckUserHasValidKey).toHaveBeenCalledTimes(1);
      });

      // Re-render should not trigger new call due to caching
      rerender(
        <AdminAuthProvider>
          <TestConsumer />
        </AdminAuthProvider>,
      );

      // Should still be just 1 call due to cache (within 10 second window)
      expect(mockCheckUserHasValidKey).toHaveBeenCalledTimes(1);
    });

    test("forces refresh bypasses cache", async () => {
      const mockCheckUserHasValidKey = jest
        .fn()
        .mockResolvedValue({ isValid: true });

      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xadmin123" }),
          }),
        },
        wallet: { walletAddress: "0xadmin123" },
        lockManager: {
          checkUserHasValidKey: mockCheckUserHasValidKey,
        },
      });

      renderWithProvider(<TestConsumer />);

      // Wait for initial call
      await waitFor(() => {
        expect(mockCheckUserHasValidKey).toHaveBeenCalledTimes(1);
      });

      // Force refresh should trigger new call
      await act(async () => {
        screen.getByTestId("refresh-button").click();
      });

      await waitFor(() => {
        expect(mockCheckUserHasValidKey).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("Utility Functions", () => {
    test("isFullyAuthenticated works correctly", () => {
      expect(isFullyAuthenticated("authenticated")).toBe(true);
      expect(isFullyAuthenticated("loading")).toBe(false);
      expect(isFullyAuthenticated("privy_required")).toBe(false);
      expect(isFullyAuthenticated("wallet_required")).toBe(false);
      expect(isFullyAuthenticated("blockchain_denied")).toBe(false);
      expect(isFullyAuthenticated("session_required")).toBe(false);
    });

    test("isAuthLoading works correctly", () => {
      expect(isAuthLoading("loading")).toBe(true);
      expect(isAuthLoading("authenticated")).toBe(false);
      expect(isAuthLoading("privy_required")).toBe(false);
    });

    test("getAuthStatusMessage provides user-friendly messages", () => {
      expect(getAuthStatusMessage("loading")).toBe(
        "Checking authentication...",
      );
      expect(getAuthStatusMessage("privy_required")).toBe(
        "Please connect your wallet to continue",
      );
      expect(getAuthStatusMessage("wallet_required")).toBe(
        "Please connect a wallet to access admin features",
      );
      expect(getAuthStatusMessage("blockchain_denied")).toBe(
        "Your wallet does not have admin access",
      );
      expect(getAuthStatusMessage("session_required")).toBe(
        "Please create an admin session to continue",
      );
      expect(getAuthStatusMessage("authenticated")).toBe(
        "Authenticated with admin access",
      );
    });
  });

  describe("Error Handling", () => {
    test("handles network errors gracefully", async () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
        user: {
          user: createMockUser({
            id: "user123",
            wallet: createMockWallet({ address: "0xuser123" }),
          }),
        },
        wallet: { walletAddress: "0xuser123" },
        lockManager: {
          checkUserHasValidKey: jest
            .fn()
            .mockRejectedValue(new Error("Network error")),
        },
      });

      renderWithProvider(<TestConsumer />);

      await waitFor(() => {
        expect(screen.getByTestId("auth-error")).toHaveTextContent(
          "Network error",
        );
        expect(screen.getByTestId("is-admin")).toHaveTextContent("false");
      });
    });

    test("handles component unmount without memory leaks", () => {
      setupMocks({
        privy: { ready: true, authenticated: true },
      });

      const { unmount } = renderWithProvider(<TestConsumer />);

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });
});
