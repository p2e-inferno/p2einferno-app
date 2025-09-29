/**
 * Admin Authentication Context Actions Hook
 * 
 * Manages all action methods for the AdminAuthContext.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import { useCallback, useRef } from 'react';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { useSmartWalletSelection } from '@/hooks/useSmartWalletSelection';
import { useLockManagerClient } from '@/hooks/useLockManagerClient';
import { type Address } from 'viem';
import { getLogger } from '@/lib/utils/logger';
import { isCacheValid, createCacheExpiry, shouldInvalidateCache } from '../utils/adminAuthContextCacheUtils';
import { MAX_BACKOFF_DELAY, MAX_ERROR_COUNT } from '../constants/AdminAuthContextConstants';
// Type for the state object returned by useAdminAuthContextState
type AdminAuthContextState = ReturnType<typeof import('./useAdminAuthContextState').useAdminAuthContextState>;

const log = getLogger('client:admin-auth-context');

interface AdminSessionHandlers {
  createAdminSession: () => Promise<boolean>;
}

/**
 * Hook for managing AdminAuthContext action methods
 * 
 * @param state - State object from useAdminAuthContextState
 * @returns Object containing all action methods
 */
export const useAdminAuthContextActions = (
  state: AdminAuthContextState,
  sessionHandlers: AdminSessionHandlers
) => {
  const { authenticated, logout } = usePrivy();
  const { user } = useUser();
  const selectedWallet = useSmartWalletSelection();
  const walletAddress = selectedWallet?.address || null;
  const { checkUserHasValidKey } = useLockManagerClient();
  const { createAdminSession } = sessionHandlers;

  const {
    cacheValidUntil,
    errorCount,
    lastErrorTime,
    // State setters
    setIsAdmin,
    setAuthLoading,
    setLastAuthCheck,
    setCacheValidUntil,
    // Refs
    inFlightRef,
    mountedRef,
    
    // Error handling methods
    clearErrors,
    recordError,

    // Constants
    AUTH_CACHE_DURATION,
    ERROR_RETRY_DELAY,
  } = state;

  const retryStateRef = useRef({ attempts: 0, nextRetryAt: 0 });
  const circuitBreakerRef = useRef<number | null>(null);

  // ============ CORE AUTH CHECK FUNCTION ============
  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      if (inFlightRef.current) return;

      const now = Date.now();

      if (!forceRefresh) {
        const circuitUntil = circuitBreakerRef.current;
        if (circuitUntil && now < circuitUntil) {
          log.warn('Admin auth circuit breaker active, skipping check', {
            circuitUntil,
          });
          return;
        }

        const nextRetryAt = retryStateRef.current.nextRetryAt;
        if (nextRetryAt && now < nextRetryAt) {
          log.debug('Admin auth check throttled by backoff window', {
            nextRetryAt,
          });
          return;
        }

        if (
          isCacheValid(cacheValidUntil) &&
          !shouldInvalidateCache(cacheValidUntil, errorCount, lastErrorTime)
        ) {
          return;
        }
      }

      const resetRetryState = () => {
        retryStateRef.current.attempts = 0;
        retryStateRef.current.nextRetryAt = 0;
        circuitBreakerRef.current = null;
        clearErrors();
      };

      const scheduleRetry = (reason: string) => {
        const attempts = retryStateRef.current.attempts + 1;
        retryStateRef.current.attempts = attempts;
        const delay = Math.min(
          ERROR_RETRY_DELAY * Math.pow(2, attempts - 1),
          MAX_BACKOFF_DELAY,
        );
        const nextRetryAt = Date.now() + delay;
        retryStateRef.current.nextRetryAt = nextRetryAt;
        if (attempts >= MAX_ERROR_COUNT) {
          circuitBreakerRef.current = Date.now() + MAX_BACKOFF_DELAY;
        }
        if (mountedRef.current) {
          setCacheValidUntil(nextRetryAt);
        }
        log.warn('Scheduled admin auth retry', {
          reason,
          attempts,
          delay,
          nextRetryAt,
        });
      };

      inFlightRef.current = true;
      setAuthLoading(true);

      try {
        if (!authenticated || !user) {
          resetRetryState();
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
            setCacheValidUntil(0);
          }
          return;
        }

        const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
        if (!adminLockAddress) {
          const errorMsg = 'Admin lock address not configured';
          log.warn(errorMsg);
          recordError(errorMsg, 'auth');
          scheduleRetry(errorMsg);
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
          }
          return;
        }

        const currentWalletAddress = walletAddress;
        if (!currentWalletAddress) {
          const errorMsg = 'No currently connected wallet found';
          log.warn(errorMsg);
          recordError(errorMsg, 'auth');
          scheduleRetry(errorMsg);
          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
          }
          return;
        }

        log.info(`Checking admin access for wallet: ${currentWalletAddress}`);

        let walletBelongsToUser = false;
        if (user.wallet?.address?.toLowerCase() === currentWalletAddress.toLowerCase()) {
          walletBelongsToUser = true;
          log.debug('Connected wallet matches primary Privy wallet');
        }

        if (!walletBelongsToUser && user.linkedAccounts) {
          for (const account of user.linkedAccounts) {
            if (
              account.type === 'wallet' &&
              account.address?.toLowerCase() === currentWalletAddress.toLowerCase()
            ) {
              walletBelongsToUser = true;
              log.debug('Connected wallet found in linked accounts');
              break;
            }
          }
        }

        if (!walletBelongsToUser) {
          const errorMsg = `Connected wallet ${currentWalletAddress} does not belong to current user ${user.id}`;
          log.warn(`🚨 SECURITY: ${errorMsg}. Forcing logout.`);
          recordError('Wallet security validation failed', 'auth');

          try {
            await fetch('/api/admin/logout', {
              method: 'POST',
              credentials: 'include',
            });
          } catch (e) {
            recordError('Failed to clear admin session', 'network');
          }

          await logout();
          scheduleRetry('Wallet mismatch');

          if (mountedRef.current) {
            setIsAdmin(false);
            setAuthLoading(false);
          }
          return;
        }

        log.info(`✅ Wallet validation passed: ${currentWalletAddress}`);

        let hasValidKey = false;
        try {
          const keyInfo = await checkUserHasValidKey(
            currentWalletAddress as Address,
            adminLockAddress as Address,
            { forceRefresh },
          );

          if (keyInfo && keyInfo.isValid) {
            hasValidKey = true;
            log.info(
              `✅ Admin access GRANTED for ${currentWalletAddress}, expires: ${
                keyInfo.expirationTimestamp > BigInt(Number.MAX_SAFE_INTEGER)
                  ? 'Never (infinite)'
                  : new Date(Number(keyInfo.expirationTimestamp) * 1000).toLocaleString()
              }`,
            );
          } else {
            log.info(`❌ Admin access DENIED for ${currentWalletAddress}`);
          }

          if (mountedRef.current) {
            const timestamp = Date.now();
            setIsAdmin(hasValidKey);
            setLastAuthCheck(timestamp);
            setCacheValidUntil(createCacheExpiry(AUTH_CACHE_DURATION));
          }

          resetRetryState();
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : 'Unknown admin access error';
          log.error(`Error checking admin access for ${currentWalletAddress}`, { error });
          recordError(errorMsg, 'auth');
          scheduleRetry(errorMsg);

          if (mountedRef.current) {
            setIsAdmin(false);
          }
          return;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown authentication error';
        log.error('Error in admin access check', { error });
        recordError(errorMsg, 'auth');
        scheduleRetry(errorMsg);
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
    [
      AUTH_CACHE_DURATION,
      ERROR_RETRY_DELAY,
      authenticated,
      cacheValidUntil,
      checkUserHasValidKey,
      clearErrors,
      errorCount,
      lastErrorTime,
      logout,
      mountedRef,
      recordError,
      setAuthLoading,
      setCacheValidUntil,
      setIsAdmin,
      setLastAuthCheck,
      walletAddress,
      user,
    ],
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

  return {
    checkAdminAccess,
    refreshAdminStatus,
    retryAuth,
    retrySession,
  };
};
