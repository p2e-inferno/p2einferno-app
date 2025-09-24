import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from "react";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { useAdminSession } from "@/hooks/useAdminSession";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";
import { getLogger } from "@/lib/utils/logger";
import { listenForAdminWalletChanges } from "@/lib/utils";
// Error utilities available for future use
// import { 
//   normalizeAdminApiError, 
//   logAdminApiError, 
//   type AdminApiErrorContext 
// } from '@/lib/utils/error-utils';

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

  /**
   * Whether there's a network error
   */
  networkError: boolean;

  /**
   * Number of consecutive errors
   */
  errorCount: number;

  /**
   * Timestamp of last error
   */
  lastErrorTime: number;

  // ============ RECOVERY METHODS ============

  /**
   * Retry authentication check
   */
  retryAuth: () => Promise<void>;

  /**
   * Retry session creation
   */
  retrySession: () => Promise<boolean>;

  /**
   * Clear all error states
   */
  clearErrors: () => void;

  // ============ DEBUGGING & HEALTH ============

  /**
   * Get health status for debugging
   */
  getHealthStatus: () => {
    isHealthy: boolean;
    lastError: string | null;
    errorCount: number;
    cacheStatus: 'valid' | 'invalid';
    sessionStatus: 'valid' | 'invalid';
    authStatus: AdminAuthStatus;
  };
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
  const selectedWallet = useSmartWalletSelection();
  const walletAddress = selectedWallet?.address || null;

  // Use existing session hook instead of reimplementing
  const sessionAuth = useAdminSession();
  const {
    hasValidSession,
    isCheckingSession: sessionLoading,
    sessionExpiry,
    createAdminSession,
    refreshSession,
    clearSession
  } = sessionAuth;

  // ============ INTERNAL STATE ============
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastAuthCheck, setLastAuthCheck] = useState(0);
  const [cacheValidUntil, setCacheValidUntil] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState(0);

  // ============ REFS ============
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // ============ CACHE CONSTANTS ============
  const AUTH_CACHE_DURATION = parseInt(
    process.env.NEXT_PUBLIC_AUTH_CACHE_DURATION || '120000'
  ); // 2 minutes default
  // SESSION_CACHE_DURATION not used in this context (handled by useAdminSession)
  const ERROR_RETRY_DELAY = parseInt(
    process.env.NEXT_PUBLIC_ERROR_RETRY_DELAY || '5000'
  ); // 5 seconds default

  // ============ ERROR HANDLING ============
  const clearErrors = useCallback(() => {
    setAuthError(null);
    setNetworkError(false);
    setErrorCount(0);
    setLastErrorTime(0);
  }, []);

  const recordError = useCallback((error: string, type: 'auth' | 'network') => {
    setAuthError(type === 'auth' ? error : null);
    setNetworkError(type === 'network');
    setLastErrorTime(Date.now());
    setErrorCount(prev => prev + 1);
  }, []);

  // handleAdminApiError - available for future use with API calls
  // const handleAdminApiError = useCallback((error: any, context: AdminApiErrorContext) => {
  //   const status = error.status || 500;
  //   const body = error.body || {};
  //   const normalizedError = normalizeAdminApiError(status, body, context.operation);
  //   logAdminApiError(status, body, context, error);
  //   recordError(normalizedError, context.operation === 'session' ? 'auth' : 'auth');
  // }, [recordError]);

  // ============ CACHE MANAGEMENT ============
  const shouldInvalidateCache = useCallback((
    cacheValidUntil: number,
    errorCount: number,
    lastErrorTime: number
  ): boolean => {
    const now = Date.now();
    
    // Always invalidate if cache expired
    if (now >= cacheValidUntil) return true;
    
    // Invalidate if recent errors (exponential backoff)
    if (errorCount > 0 && lastErrorTime > 0) {
      const timeSinceError = now - lastErrorTime;
      const backoffDelay = Math.min(ERROR_RETRY_DELAY * Math.pow(2, errorCount - 1), 60000);
      return timeSinceError >= backoffDelay;
    }
    
    return false;
  }, [ERROR_RETRY_DELAY]);

  // Cache management methods - available for future use
  // const invalidateCache = useCallback(() => {
  //   setCacheValidUntil(0);
  //   setLastAuthCheck(0);
  //   log.debug("Cache invalidated manually");
  // }, []);

  // const extendCache = useCallback((duration: number) => {
  //   setCacheValidUntil(createCacheExpiry(duration));
  //   log.debug(`Cache extended by ${duration}ms`);
  // }, []);

  // Update cache validity check
  const isCacheValid = useCallback((cacheValidUntil: number): boolean => {
    return !shouldInvalidateCache(cacheValidUntil, errorCount, lastErrorTime);
  }, [shouldInvalidateCache, errorCount, lastErrorTime]);

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
      clearErrors(); // Clear previous errors

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
          const errorMsg = "Admin lock address not configured";
          log.warn(errorMsg);
          recordError(errorMsg, 'auth');
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
          }
          return;
        }

        // Get currently connected wallet
        const currentWalletAddress = walletAddress;
        if (!currentWalletAddress) {
          const errorMsg = "No currently connected wallet found";
          log.warn(errorMsg);
          recordError(errorMsg, 'auth');
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
          const errorMsg = `Connected wallet ${currentWalletAddress} does not belong to current user ${user.id}`;
          log.warn(`🚨 SECURITY: ${errorMsg}. Forcing logout.`);
          recordError("Wallet security validation failed", 'auth');

          try {
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
          } catch (e) {
            recordError("Failed to clear admin session", 'network');
          }

          await logout();

          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
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
          const errorMsg = error instanceof Error ? error.message : 'Unknown admin access error';
          log.error(`Error checking admin access for ${currentWalletAddress}`, { error });
          recordError(errorMsg, 'auth');
        }

        // Update state only if component is still mounted
        if (mountedRef.current) {
          setIsAdmin(hasValidKey);
          setLastAuthCheck(Date.now());
          setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown authentication error';
        log.error("Error in admin access check", { error });
        recordError(errorMsg, 'auth');
        if (mountedRef.current) {
          setIsAdmin(false);
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

  const retryAuth = useCallback(async () => {
    clearErrors();
    await checkAdminAccess(true);
  }, [clearErrors, checkAdminAccess]);

  const retrySession = useCallback(async (): Promise<boolean> => {
    clearErrors();
    return await createAdminSession();
  }, [clearErrors, createAdminSession]);

  // ============ HEALTH CHECK & DEBUGGING ============
  // This will be updated after authStatus is defined

  // Session methods are now provided by useAdminSession hook
  // No need to reimplement them

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
    const cleanup = listenForAdminWalletChanges(async () => {
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
        // Ignore network errors - already handled by utility
      }

      // Re-check will be triggered by walletAddress change in above useEffect
      log.info("Admin status will be re-checked for new wallet");
    });

    return cleanup;
  }, [clearSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Development debugging - moved after authStatus is defined

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

  // Development debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      log.debug('AdminAuthContext state update', {
        authStatus,
        isAdmin,
        hasValidSession,
        authLoading,
        sessionLoading,
        errorCount: errorCount,
        cacheValid: isCacheValid(cacheValidUntil)
      });
    }
  }, [authStatus, isAdmin, hasValidSession, authLoading, sessionLoading, errorCount, cacheValidUntil, isCacheValid]);

  // ============ HEALTH CHECK & DEBUGGING ============
  const getHealthStatus = useCallback(() => {
    return {
      isHealthy: !networkError && errorCount < 5,
      lastError: authError,
      errorCount: errorCount,
      cacheStatus: (isCacheValid(cacheValidUntil) ? 'valid' : 'invalid') as 'valid' | 'invalid',
      sessionStatus: (hasValidSession ? 'valid' : 'invalid') as 'valid' | 'invalid',
      authStatus
    };
  }, [networkError, errorCount, authError, isCacheValid, cacheValidUntil, hasValidSession, authStatus]);

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
    sessionError: null, // useAdminSession doesn't expose sessionError
    networkError,
    errorCount,
    lastErrorTime,

    // Recovery methods
    retryAuth,
    retrySession,
    clearErrors,

    // Debugging & health
    getHealthStatus,
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
    networkError,
    errorCount,
    lastErrorTime,
    retryAuth,
    retrySession,
    clearErrors,
    getHealthStatus,
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