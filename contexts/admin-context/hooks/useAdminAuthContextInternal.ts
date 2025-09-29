/**
 * Admin Authentication Context Main Hook
 * 
 * Main composition hook that combines all AdminAuthContext functionality.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { useSmartWalletSelection } from '@/hooks/useSmartWalletSelection';
import { useAdminSession } from '@/hooks/useAdminSession';
import { listenForAdminWalletChanges } from '@/lib/utils/wallet-change';
import { getLogger } from '@/lib/utils/logger';
import { deriveAuthStatus } from '../utils/adminAuthContextStatusUtils';
import { isCacheValid } from '../utils/adminAuthContextCacheUtils';
import { useAdminAuthContextState } from './useAdminAuthContextState';
import { useAdminAuthContextActions } from './useAdminAuthContextActions';
import type { AdminAuthContextValue } from '../types/AdminAuthContextTypes';

const log = getLogger('client:admin-auth-context');

/**
 * Main hook for AdminAuthContext functionality
 * 
 * @returns Complete AdminAuthContextValue with all state and methods
 */
export const useAdminAuthContextInternal = (): AdminAuthContextValue => {
  // ============ EXTERNAL HOOKS ============
  const { authenticated, ready } = usePrivy();
  const { user } = useUser();
  const selectedWallet = useSmartWalletSelection();
  const walletAddress = selectedWallet?.address || null;

  // Use existing session hook instead of reimplementing
  const sessionAuth = useAdminSession();
  const {
    hasValidSession,
    isCheckingSession: sessionLoading,
    sessionExpiry,
    sessionError,
    createAdminSession,
    refreshSession,
    clearSession
  } = sessionAuth;

  // ============ INTERNAL STATE & ACTIONS ============
  const state = useAdminAuthContextState();
  const actions = useAdminAuthContextActions(state, {
    createAdminSession,
  });

  const {
    // State values
    isAdmin,
    authLoading,
    lastAuthCheck,
    cacheValidUntil,
    authError,
    networkError,
    errorCount,
    lastErrorTime,

    // State setters
    setIsAdmin,
    setAuthLoading,
    // Refs
    inFlightRef,
    mountedRef,

    // Error handling methods
    clearErrors,
  } = state;

  const {
    checkAdminAccess,
    refreshAdminStatus,
    retryAuth,
    retrySession,
  } = actions;

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
  }, [clearSession, setIsAdmin, setAuthLoading, inFlightRef]);

  // Track mounted state (needed for React Strict Mode double-invocation)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [mountedRef]);

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
  },  [authStatus, isAdmin, hasValidSession, authLoading, sessionLoading, errorCount, cacheValidUntil, isCacheValid]);

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
  }, [networkError, errorCount, authError, cacheValidUntil, hasValidSession, authStatus]);

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
    sessionError,
    networkError,
    errorCount,
    lastErrorTime,
    retryAuth,
    retrySession,
    clearErrors,
    getHealthStatus,
  ]);

  return contextValue;
};
