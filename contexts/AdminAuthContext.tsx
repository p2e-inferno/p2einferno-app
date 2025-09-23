import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger('client:admin-auth-context');

// ================================
// TYPE DEFINITIONS
// ================================

/**
 * Unified authentication status for admin access
 */
type AdminAuthStatus =
  | 'loading'           // Initial loading state
  | 'privy_required'    // User needs to connect with Privy
  | 'wallet_required'   // User needs to connect a wallet
  | 'blockchain_denied' // Wallet connected but no admin access on blockchain
  | 'session_required'  // Admin access confirmed but session needed
  | 'authenticated';    // Fully authenticated with admin access

/**
 * Admin Authentication Context Value Interface
 *
 * This interface provides a unified view of admin authentication state,
 * consolidating multiple authentication hooks into a single context.
 */
interface AdminAuthContextValue {
  // ============ UNIFIED STATE ============

  /**
   * Current authentication status - provides granular state information
   */
  authStatus: AdminAuthStatus;

  /**
   * Whether user has admin access (blockchain verification passed)
   */
  isAdmin: boolean;

  /**
   * Whether user is authenticated with Privy
   */
  authenticated: boolean;

  /**
   * Current user object from Privy
   */
  user: any;

  /**
   * Currently connected wallet address
   */
  walletAddress: string | null;

  // ============ PERFORMANCE STATE ============

  /**
   * Timestamp of last authentication check (for caching)
   */
  lastAuthCheck: number;

  /**
   * Timestamp until which current auth result is valid
   */
  cacheValidUntil: number;

  // ============ LOADING STATES ============

  /**
   * Whether authentication is currently being checked
   */
  isLoadingAuth: boolean;

  /**
   * Whether session validation is in progress
   */
  isLoadingSession: boolean;

  // ============ SESSION STATE ============

  /**
   * Whether user has a valid admin session
   */
  hasValidSession: boolean;

  /**
   * When current session expires (timestamp)
   */
  sessionExpiry: number | null;

  // ============ ACTION METHODS ============

  /**
   * Manually refresh admin authentication status
   * Forces a new blockchain check bypassing cache
   */
  refreshAdminStatus: () => Promise<void>;

  /**
   * Create a new admin session
   * @returns Promise resolving to success status
   */
  createAdminSession: () => Promise<boolean>;

  /**
   * Refresh current admin session
   * @returns Promise resolving to success status
   */
  refreshSession: () => Promise<boolean>;

  /**
   * Clear current admin session
   */
  clearSession: () => void;

  // ============ ERROR STATE ============

  /**
   * Current authentication error, if any
   */
  authError: string | null;

  /**
   * Current session error, if any
   */
  sessionError: string | null;
}

// ================================
// CONTEXT CREATION
// ================================

/**
 * Admin Authentication Context
 *
 * Provides centralized admin authentication state management to eliminate
 * duplicate RPC calls and provide consistent auth state across components.
 */
const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Derive unified auth status from multiple auth states
 */
const deriveAuthStatus = (
  privyAuthenticated: boolean,
  privyReady: boolean,
  walletAddress: string | null,
  isAdmin: boolean,
  authLoading: boolean,
  hasValidSession: boolean,
  sessionLoading: boolean
): AdminAuthStatus => {
  // Loading states take priority
  if (!privyReady || authLoading) {
    return 'loading';
  }

  // Check Privy authentication
  if (!privyAuthenticated) {
    return 'privy_required';
  }

  // Check wallet connection
  if (!walletAddress) {
    return 'wallet_required';
  }

  // Check blockchain admin access
  if (!isAdmin) {
    return 'blockchain_denied';
  }

  // Check session (if session loading, consider it required)
  if (sessionLoading) {
    return 'loading';
  }

  if (!hasValidSession) {
    return 'session_required';
  }

  // Fully authenticated
  return 'authenticated';
};

/**
 * Check if auth cache is still valid
 */
const isCacheValid = (cacheValidUntil: number): boolean => {
  return Date.now() < cacheValidUntil;
};

/**
 * Create cache expiry timestamp
 */
const createCacheExpiry = (durationMs: number): number => {
  return Date.now() + durationMs;
};

// ================================
// PROVIDER COMPONENT
// ================================

interface AdminAuthProviderProps {
  children: ReactNode;
}

/**
 * AdminAuthProvider - Centralized admin authentication state management
 *
 * This context provider eliminates duplicate RPC calls by providing a single
 * source of truth for admin authentication state across all admin components.
 *
 * Benefits:
 * - Single RPC call per auth check (instead of one per component)
 * - Shared state across all admin components
 * - Automatic cleanup and throttling
 * - Consistent behavior across the app
 * - Performance optimization with smart caching
 */
export const AdminAuthProvider: React.FC<AdminAuthProviderProps> = ({ children }) => {
  // ============ EXTERNAL HOOKS ============
  const { authenticated, ready, logout } = usePrivy();
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);

  // ============ INTERNAL STATE ============
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastAuthCheck, setLastAuthCheck] = useState(0);
  const [cacheValidUntil, setCacheValidUntil] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);

  // Session state (simplified for now - will integrate with useAdminSession later)
  const [hasValidSession, setHasValidSession] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // ============ REFS ============
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // ============ CACHE CONSTANTS ============
  const AUTH_CACHE_DURATION = 10 * 1000; // 10 seconds for blockchain auth
  const SESSION_CACHE_DURATION = 2 * 60 * 1000; // 2 minutes for session

  // ============ CORE AUTH CHECK FUNCTION ============
  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      // Prevent duplicate calls
      if (inFlightRef.current) return;

      // Check cache validity
      if (!forceRefresh && isCacheValid(cacheValidUntil)) {
        return;
      }

      inFlightRef.current = true;
      setAuthLoading(true);
      setAuthError(null);

      try {
        // Early return if not authenticated
        if (!authenticated || !user) {
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
          }
          return;
        }

        // Get admin lock address from environment
        const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
        if (!adminLockAddress) {
          log.warn("NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, no admin access");
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setAuthError("Admin lock address not configured");
            setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
          }
          return;
        }

        // Get currently connected wallet
        const currentWalletAddress = walletAddress;
        if (!currentWalletAddress) {
          log.warn("No currently connected wallet found");
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
          }
          return;
        }

        log.info(`Checking admin access for wallet: ${currentWalletAddress}`);

        // Validate wallet belongs to current user
        let walletBelongsToUser = false;

        // Check primary wallet
        if (user.wallet?.address?.toLowerCase() === currentWalletAddress.toLowerCase()) {
          walletBelongsToUser = true;
          log.debug("Connected wallet matches primary Privy wallet");
        }

        // Check linked accounts
        if (!walletBelongsToUser && user.linkedAccounts) {
          for (const account of user.linkedAccounts) {
            if (
              account.type === "wallet" &&
              account.address?.toLowerCase() === currentWalletAddress.toLowerCase()
            ) {
              walletBelongsToUser = true;
              log.debug("Connected wallet found in linked accounts");
              break;
            }
          }
        }

        // Security: Force logout if wallet doesn't belong to user
        if (!walletBelongsToUser) {
          log.warn(
            `🚨 SECURITY: Connected wallet ${currentWalletAddress} does not belong to current user ${user.id}. Forcing logout.`
          );

          try {
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
          } catch (e) {
            // Ignore network errors
          }

          await logout();

          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setAuthError("Wallet security validation failed");
          }
          return;
        }

        log.info(`✅ Wallet validation passed: ${currentWalletAddress}`);

        // Check admin access via blockchain
        let hasValidKey = false;
        try {
          const keyInfo = await lockManagerService.checkUserHasValidKey(
            currentWalletAddress as Address,
            adminLockAddress as Address,
            forceRefresh
          );

          if (keyInfo && keyInfo.isValid) {
            hasValidKey = true;
            log.info(
              `✅ Admin access GRANTED for ${currentWalletAddress}, expires: ${
                keyInfo.expirationTimestamp > BigInt(Number.MAX_SAFE_INTEGER)
                  ? "Never (infinite)"
                  : new Date(Number(keyInfo.expirationTimestamp) * 1000).toLocaleString()
              }`
            );
          } else {
            log.info(`❌ Admin access DENIED for ${currentWalletAddress}`);
          }
        } catch (error) {
          log.error(`Error checking admin access for ${currentWalletAddress}`, { error });
          if (mountedRef.current) {
            setAuthError(error instanceof Error ? error.message : 'Unknown admin access error');
          }
        }

        // Update state only if component is still mounted
        if (mountedRef.current) {
          setIsAdmin(hasValidKey);
          setLastAuthCheck(Date.now());
          setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
        }

      } catch (error) {
        log.error("Error in admin access check", { error });
        if (mountedRef.current) {
          setIsAdmin(false);
          setAuthError(error instanceof Error ? error.message : 'Unknown authentication error');
        }
      } finally {
        if (mountedRef.current) {
          setAuthLoading(false);
        }
        inFlightRef.current = false;
      }
    },
    [authenticated, user?.id, walletAddress, logout, cacheValidUntil]
  );

  // ============ ACTION METHODS ============

  const refreshAdminStatus = useCallback(async () => {
    await checkAdminAccess(true);
  }, [checkAdminAccess]);

  const createAdminSession = useCallback(async (): Promise<boolean> => {
    // TODO: Implement session creation logic
    // This will integrate with useAdminSession hook logic
    setSessionLoading(true);
    try {
      // Placeholder for session creation
      log.info("Creating admin session...");
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setHasValidSession(true);
      setSessionExpiry(Date.now() + 60 * 60 * 1000); // 1 hour from now
      return true;
    } catch (error) {
      log.error("Failed to create admin session", { error });
      setSessionError(error instanceof Error ? error.message : 'Session creation failed');
      return false;
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    // TODO: Implement session refresh logic
    setSessionLoading(true);
    try {
      log.info("Refreshing admin session...");
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API call
      setSessionExpiry(Date.now() + 60 * 60 * 1000); // Extend by 1 hour
      return true;
    } catch (error) {
      log.error("Failed to refresh admin session", { error });
      setSessionError(error instanceof Error ? error.message : 'Session refresh failed');
      return false;
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const clearSession = useCallback(() => {
    setHasValidSession(false);
    setSessionExpiry(null);
    setSessionError(null);
    log.info("Admin session cleared");
  }, []);

  // ============ EFFECTS ============

  // Effect: Check admin access when auth state changes
  useEffect(() => {
    if (!ready) return;

    if (authenticated && user) {
      checkAdminAccess();
    } else {
      // Clear admin state if not authenticated
      setIsAdmin(false);
      setAuthLoading(false);
      clearSession();
    }
  }, [ready, authenticated, user?.id, walletAddress, checkAdminAccess]);

  // Effect: Listen for wallet account changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = async () => {
        log.info("Wallet accounts changed - immediately revoking admin access");

        // Immediate UI protection
        setIsAdmin(false);
        setAuthLoading(true);
        clearSession();

        // Clear in-flight flag to allow re-checking
        inFlightRef.current = false;

        try {
          // Clear admin session
          await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
        } catch (e) {
          // Ignore network errors
        }

        // Re-check will be triggered by walletAddress change in above useEffect
        log.info("Admin status will be re-checked for new wallet");
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      };
    }
  }, [clearSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ============ DERIVED STATE ============

  const authStatus = useMemo(() => {
    return deriveAuthStatus(
      authenticated,
      ready,
      walletAddress,
      isAdmin,
      authLoading,
      hasValidSession,
      sessionLoading
    );
  }, [authenticated, ready, walletAddress, isAdmin, authLoading, hasValidSession, sessionLoading]);

  // ============ CONTEXT VALUE ============

  const contextValue: AdminAuthContextValue = useMemo(() => ({
    // Unified state
    authStatus,
    isAdmin,
    authenticated,
    user,
    walletAddress,

    // Performance state
    lastAuthCheck,
    cacheValidUntil,

    // Loading states
    isLoadingAuth: authLoading,
    isLoadingSession: sessionLoading,

    // Session state
    hasValidSession,
    sessionExpiry,

    // Action methods
    refreshAdminStatus,
    createAdminSession,
    refreshSession,
    clearSession,

    // Error states
    authError,
    sessionError,
  }), [
    authStatus,
    isAdmin,
    authenticated,
    user,
    walletAddress,
    lastAuthCheck,
    cacheValidUntil,
    authLoading,
    sessionLoading,
    hasValidSession,
    sessionExpiry,
    refreshAdminStatus,
    createAdminSession,
    refreshSession,
    clearSession,
    authError,
    sessionError,
  ]);

  return (
    <AdminAuthContext.Provider value={contextValue}>
      {children}
    </AdminAuthContext.Provider>
  );
};

// ================================
// CONSUMER HOOK
// ================================

/**
 * Custom hook to consume admin auth context
 *
 * This replaces the need for individual components to call useLockManagerAdminAuth
 *
 * @throws Error if used outside of AdminAuthProvider
 * @returns AdminAuthContextValue with all auth state and methods
 */
export const useAdminAuthContext = (): AdminAuthContextValue => {
  const context = useContext(AdminAuthContext);

  if (context === undefined) {
    throw new Error(
      'useAdminAuthContext must be used within an AdminAuthProvider. ' +
      'Make sure to wrap your admin components with <AdminAuthProvider>.'
    );
  }

  return context;
};

// ================================
// UTILITY EXPORTS
// ================================

/**
 * Type guard to check if auth status indicates full authentication
 */
export const isFullyAuthenticated = (authStatus: AdminAuthStatus): boolean => {
  return authStatus === 'authenticated';
};

/**
 * Type guard to check if auth status indicates loading state
 */
export const isAuthLoading = (authStatus: AdminAuthStatus): boolean => {
  return authStatus === 'loading';
};

/**
 * Get user-friendly message for auth status
 */
export const getAuthStatusMessage = (authStatus: AdminAuthStatus): string => {
  switch (authStatus) {
    case 'loading':
      return 'Checking authentication...';
    case 'privy_required':
      return 'Please connect your wallet to continue';
    case 'wallet_required':
      return 'Please connect a wallet to access admin features';
    case 'blockchain_denied':
      return 'Your wallet does not have admin access';
    case 'session_required':
      return 'Please create an admin session to continue';
    case 'authenticated':
      return 'Authenticated with admin access';
    default:
      return 'Unknown authentication status';
  }
};