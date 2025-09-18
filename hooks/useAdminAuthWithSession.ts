import { useMemo } from 'react';
import { useLockManagerAdminAuth } from './useLockManagerAdminAuth';
import { useAdminSession } from './useAdminSession';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useAdminAuthWithSession');

/**
 * Enhanced admin authentication that combines blockchain access with session validation
 * Ensures users have BOTH admin keys AND valid admin session
 */
export const useAdminAuthWithSession = () => {
  // Get blockchain-based admin access
  const blockchainAuth = useLockManagerAdminAuth();

  // Get session-based admin access
  const sessionAuth = useAdminSession();

  // Compute combined authentication state
  const authState = useMemo(() => {
    const {
      isAdmin: hasBlockchainAccess,
      loading: blockchainLoading,
      authenticated,
      user,
    } = blockchainAuth;

    const {
      hasValidSession,
      isCheckingSession,
    } = sessionAuth;

    // User must be authenticated with Privy first
    if (!authenticated || !user) {
      return {
        authStep: 'privy_login' as const,
        isFullyAuthenticated: false,
        needsPrivyAuth: true,
        needsBlockchainAuth: false,
        needsSessionAuth: false,
        isLoading: blockchainLoading,
      };
    }

    // User must have blockchain admin access
    if (!hasBlockchainAccess) {
      return {
        authStep: 'blockchain_access' as const,
        isFullyAuthenticated: false,
        needsPrivyAuth: false,
        needsBlockchainAuth: true,
        needsSessionAuth: false,
        isLoading: blockchainLoading,
      };
    }

    // User must have valid admin session
    if (!hasValidSession) {
      return {
        authStep: 'admin_session' as const,
        isFullyAuthenticated: false,
        needsPrivyAuth: false,
        needsBlockchainAuth: false,
        needsSessionAuth: true,
        isLoading: isCheckingSession,
      };
    }

    // All authentication requirements met
    return {
      authStep: 'authenticated' as const,
      isFullyAuthenticated: true,
      needsPrivyAuth: false,
      needsBlockchainAuth: false,
      needsSessionAuth: false,
      isLoading: false,
    };
  }, [
    blockchainAuth.isAdmin,
    blockchainAuth.loading,
    blockchainAuth.authenticated,
    blockchainAuth.user,
    sessionAuth.hasValidSession,
    sessionAuth.isCheckingSession,
  ]);

  // Derived convenience flags
  const isLoading = authState.isLoading || blockchainAuth.loading || sessionAuth.isCheckingSession;
  const needsSessionRefresh = authState.authStep === 'admin_session';

  log.debug('Admin auth state:', {
    authStep: authState.authStep,
    isFullyAuthenticated: authState.isFullyAuthenticated,
    needsSessionRefresh,
    hasBlockchainAccess: blockchainAuth.isAdmin,
    hasValidSession: sessionAuth.hasValidSession,
  });

  return {
    // Combined state
    ...authState,
    isLoading,
    needsSessionRefresh,

    // Original blockchain auth data
    isAdmin: blockchainAuth.isAdmin,
    authenticated: blockchainAuth.authenticated,
    user: blockchainAuth.user,
    refreshAdminStatus: blockchainAuth.refreshAdminStatus,
    lastRefreshTime: blockchainAuth.lastRefreshTime,

    // Session auth data
    hasValidSession: sessionAuth.hasValidSession,
    sessionExpiry: sessionAuth.sessionExpiry,
    createAdminSession: sessionAuth.createAdminSession,
    refreshSession: sessionAuth.refreshSession,
    clearSession: sessionAuth.clearSession,
  };
};