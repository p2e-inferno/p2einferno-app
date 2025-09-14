import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger('client:frontend-admin-auth');

/**
 * Custom hook for admin authentication using Unlock Protocol
 * @returns Object with isAdmin status, loading state, and user information
 */
export const useLockManagerAdminAuth = () => {
  const { authenticated, ready, logout } = usePrivy();
  const { user } = useUser(); // This hook provides full user data including linkedAccounts
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastCheckRef = useRef(0);

  // Track connected wallet address like PrivyConnectButton does
  useEffect(() => {
    let isMounted = true;

    const readProviderAddress = async () => {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          const accounts: string[] | undefined = await (
            window as any
          ).ethereum.request({
            method: "eth_accounts",
          });
          if (isMounted) {
            let addr: string | null = null;
            if (Array.isArray(accounts) && accounts.length > 0) {
              addr = accounts[0] as string;
            }
            setConnectedAddress(addr ?? null);
            log.debug(`Connected address updated: ${addr}`);
          }
        } catch (err) {
          log.warn("Unable to fetch accounts from provider", err);
        }
      }
    };

    readProviderAddress();

    // Also update whenever accounts change
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handler = (accounts: string[]) => {
        let addr: string | null = null;
        if (Array.isArray(accounts) && accounts.length > 0) {
          addr = accounts[0] as string;
        }
        setConnectedAddress(addr ?? null);
        log.info(`Wallet account changed to: ${addr}`);
      };
      (window as any).ethereum.on("accountsChanged", handler);
      return () => {
        (window as any).ethereum.removeListener("accountsChanged", handler);
        isMounted = false;
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Function to check admin access via admin lock
  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!forceRefresh && now - lastCheckRef.current < 10000) {
        // Throttle repeated checks within 10s
        return;
      }
      inFlightRef.current = true;
      setLoading(true);

      if (!authenticated || !user) {
        setIsAdmin(false);
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      // Get admin lock address from environment variables
      const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

      // Default to false if no lock address is provided
      if (!adminLockAddress) {
        log.warn(
          "NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, no admin access"
        );
        setIsAdmin(false);
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      try {
        // SECURITY: Get the currently connected wallet (prioritize provider over Privy user wallet)
        const currentWalletAddress = connectedAddress || user?.wallet?.address || null;

        if (!currentWalletAddress) {
          log.warn("No currently connected wallet found");
          setIsAdmin(false);
          setLoading(false);
          inFlightRef.current = false;
          return;
        }

        log.info(`Currently connected wallet: ${currentWalletAddress}`);

        // SECURITY: Validate that the connected wallet belongs to the current Privy user session
        let walletBelongsToUser = false;

        // Check if connected wallet is the primary Privy wallet
        if (user.wallet?.address?.toLowerCase() === currentWalletAddress.toLowerCase()) {
          walletBelongsToUser = true;
          log.debug("Connected wallet matches primary Privy wallet");
        }

        // Check if connected wallet is in user's linked accounts
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

        // SECURITY: If connected wallet doesn't belong to current user, force logout
        if (!walletBelongsToUser) {
          log.warn(
            `🚨 SECURITY: Connected wallet ${currentWalletAddress} does not belong to current user ${user.id}. Forcing logout to prevent session hijacking.`
          );

          try {
            // Force session logout to clear any stale admin sessions
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
          } catch (e) {
            // Ignore network errors, we'll force Privy logout anyway
          }

          // Force Privy logout
          await logout();

          setIsAdmin(false);
          setLoading(false);
          inFlightRef.current = false;
          return;
        }

        log.info(`✅ Wallet validation passed: ${currentWalletAddress} belongs to user ${user.id}`);

        // Now check ONLY the validated connected wallet for admin access
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
              `✅ Admin access GRANTED for validated wallet ${currentWalletAddress}, expires: ${
                keyInfo.expirationTimestamp > BigInt(Number.MAX_SAFE_INTEGER)
                  ? "Never (infinite)"
                  : new Date(
                      Number(keyInfo.expirationTimestamp) * 1000
                    ).toLocaleString()
              }`
            );
          } else {
            log.info(`❌ Admin access DENIED for validated wallet ${currentWalletAddress}`);
          }
        } catch (error) {
          log.error(`Error checking validated wallet ${currentWalletAddress}`, { error });
        }

        setIsAdmin(hasValidKey);

        // Update the last refresh time
        if (forceRefresh) {
          setLastRefreshTime(Date.now());
        }
        lastCheckRef.current = Date.now();
      } catch (error) {
        log.error("Error checking admin access", { error });
        setIsAdmin(false);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [authenticated, user?.id, connectedAddress, logout]
  );

  // Function to manually refresh admin status
  const refreshAdminStatus = useCallback(async () => {
    // Force a refresh of the admin status
    await checkAdminAccess(true);
  }, [checkAdminAccess]);

  useEffect(() => {
    // Run when Privy becomes ready or when connected wallet changes
    if (!ready) return;
    if (authenticated && user && connectedAddress !== null) {
      checkAdminAccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user?.id, connectedAddress]);

  // Listen for wallet account changes - now handled by connectedAddress state and useEffect above
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = async () => {
        // IMMEDIATE UI PROTECTION: Revoke admin status immediately on wallet change
        log.info("Wallet accounts changed - immediately revoking admin access");
        setIsAdmin(false);
        setLoading(true);

        try {
          // Force session logout first to clear any stale admin sessions
          await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
        } catch (e) {
          // ignore network errors
        }

        // The checkAdminAccess will be triggered automatically by the connectedAddress useEffect
        log.info("Admin status will be re-checked automatically for new wallet");
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);

      // Clean up the event listener when the component unmounts
      return () => {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
      };
    }
  }, []);

  return {
    isAdmin,
    loading,
    user,
    authenticated,
    refreshAdminStatus,
    lastRefreshTime,
  };
};
