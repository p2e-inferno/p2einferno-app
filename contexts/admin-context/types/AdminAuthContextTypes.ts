/**
 * Admin Authentication Context Types
 * 
 * Centralized type definitions for the AdminAuthContext system.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

/**
 * Unified authentication status for admin access
 */
export type AdminAuthStatus =
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
export interface AdminAuthContextValue {
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

/**
 * Props interface for AdminAuthProvider component
 */
export interface AdminAuthProviderProps {
  children: React.ReactNode;
}
