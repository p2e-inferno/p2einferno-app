/**
 * Admin Authentication Context Actions Hook
 * 
 * Manages all action methods for the AdminAuthContext.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import { useCallback } from 'react';
import { usePrivy, useUser } from '@privy-io/react-auth';
import { useSmartWalletSelection } from '@/hooks/useSmartWalletSelection';
import { lockManagerService } from '@/lib/blockchain/lock-manager';
import { type Address } from 'viem';
import { getLogger } from '@/lib/utils/logger';
import { isCacheValid, createCacheExpiry, shouldInvalidateCache } from '../utils/adminAuthContextCacheUtils';
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
  } = state;

  // ============ CORE AUTH CHECK FUNCTION ============
  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      // Prevent duplicate calls
      if (inFlightRef.current) return;

      // Honor cached result (success or failure) unless forcing or cache expired/invalidated
      if (
        !forceRefresh &&
        isCacheValid(cacheValidUntil) &&
        !shouldInvalidateCache(cacheValidUntil, errorCount, lastErrorTime)
      ) {
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
            setCacheValidUntil(0);
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
            setCacheValidUntil(0);
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
            setCacheValidUntil(0);
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
            setCacheValidUntil(0);
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
          setCacheValidUntil(0);
        }
      } finally {
        if (mountedRef.current) {
          setAuthLoading(false);
        }
        inFlightRef.current = false;
      }
    },
    [
      walletAddress,
      logout,
      cacheValidUntil,
      inFlightRef,
      mountedRef,
      setAuthLoading,
      clearErrors,
      setIsAdmin,
      setCacheValidUntil,
      recordError,
      AUTH_CACHE_DURATION,
      authenticated,
      user,
      setLastAuthCheck,
      errorCount,
      lastErrorTime
    ]
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
