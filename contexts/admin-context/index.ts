/**
 * Admin Authentication Context - Main Exports
 *
 * Public API for the AdminAuthContext system.
 * Provides a single entry point for all AdminAuthContext functionality.
 */

// ================================
// MAIN EXPORTS
// ================================

// Provider and Consumer
export { AdminAuthProvider, useAdminAuthContext } from "./AdminAuthProvider";

// ================================
// TYPE EXPORTS
// ================================

export type {
  AdminAuthStatus,
  AdminAuthContextValue,
  AdminAuthProviderProps,
} from "./types/AdminAuthContextTypes";

// ================================
// UTILITY EXPORTS
// ================================

export {
  isFullyAuthenticated,
  isAuthLoading,
  getAuthStatusMessage,
} from "./utils/adminAuthContextStatusUtils";

// ================================
// CONSTANT EXPORTS
// ================================

export {
  AUTH_CACHE_DURATION,
  ERROR_RETRY_DELAY,
  MAX_ERROR_COUNT,
  MAX_BACKOFF_DELAY,
} from "./constants/AdminAuthContextConstants";
