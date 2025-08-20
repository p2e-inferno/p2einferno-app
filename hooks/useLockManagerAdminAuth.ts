import { useState, useEffect, useCallback } from "react";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";

/**
 * Custom hook for admin authentication using Unlock Protocol
 * @returns Object with isAdmin status, loading state, and user information
 */
export const useLockManagerAdminAuth = () => {
  const { authenticated, ready } = usePrivy();
  const { user } = useUser(); // This hook provides full user data including linkedAccounts
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);

  // Function to check admin access via admin lock
  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);

      if (!authenticated || !user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Get admin lock address from environment variables
      const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;

      // Default to false if no lock address is provided
      if (!adminLockAddress) {
        console.warn(
          "NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, no admin access"
        );
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        // Get ALL wallet addresses from user's linked accounts (like backend does)
        let walletAddresses: string[] = [];

        // Add provider address if available (current selection)
        if (typeof window !== "undefined" && (window as any).ethereum) {
          try {
            const accounts: string[] = await (window as any).ethereum.request({
              method: "eth_accounts",
            });
            if (accounts && accounts.length > 0) {
              walletAddresses.push(accounts[0]);
            }
          } catch (err) {
            console.warn("Unable to read accounts from provider", err);
          }
        }

        // Add wallet from Privy user object
        if (user.wallet?.address) {
          walletAddresses.push(user.wallet.address);
        }

        // Get ALL linked wallet addresses from backend (like backend admin-auth does)
        try {
          const response = await fetch('/api/user/wallet-addresses', {
            method: 'GET',
            credentials: 'include', // Include cookies for authentication
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.walletAddresses) {
              console.log(`[FRONTEND_ADMIN_AUTH] Got ${data.walletAddresses.length} wallet addresses from backend:`, data.walletAddresses);
              walletAddresses = [...walletAddresses, ...data.walletAddresses];
            }
          } else {
            console.warn('[FRONTEND_ADMIN_AUTH] Failed to fetch wallet addresses from backend, falling back to local data');
          }
        } catch (error) {
          console.error('[FRONTEND_ADMIN_AUTH] Error fetching wallet addresses from backend:', error);
        }

        // Fallback: Add linkedAccounts from frontend (may be incomplete)
        if (user.linkedAccounts) {
          console.log(`[FRONTEND_ADMIN_AUTH] Processing ${user.linkedAccounts.length} linked accounts as fallback...`);
          for (const account of user.linkedAccounts) {
            if (account.type === "wallet" && account.address) {
              walletAddresses.push(account.address);
            }
          }
        }

        // Remove duplicates
        const uniqueWalletAddresses = [...new Set(walletAddresses)];

        // If we don't have any wallet addresses, we cannot continue
        if (uniqueWalletAddresses.length === 0) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        console.log(`[FRONTEND_ADMIN_AUTH] User object:`, user);
        console.log(`[FRONTEND_ADMIN_AUTH] User linkedAccounts:`, user?.linkedAccounts);
        console.log(`[FRONTEND_ADMIN_AUTH] Checking ${uniqueWalletAddresses.length} wallet(s) for admin access:`, uniqueWalletAddresses);

        // Check ALL wallets for admin access (like backend does)
        let hasValidKey = false;
        let validWallet: string | undefined;

        for (const walletAddress of uniqueWalletAddresses) {
          try {
            const keyInfo = await lockManagerService.checkUserHasValidKey(
              walletAddress as Address,
              adminLockAddress as Address,
              forceRefresh
            );

            if (keyInfo && keyInfo.isValid) {
              hasValidKey = true;
              validWallet = walletAddress;
              
              console.log(
                `[FRONTEND_ADMIN_AUTH] ✅ Admin access GRANTED for ${walletAddress}, expires: ${
                  keyInfo.expirationTimestamp > BigInt(Number.MAX_SAFE_INTEGER)
                    ? "Never (infinite)"
                    : new Date(
                        Number(keyInfo.expirationTimestamp) * 1000
                      ).toLocaleString()
                }`
              );
              break; // Stop checking once we find a valid key
            } else {
              console.log(`[FRONTEND_ADMIN_AUTH] ❌ Admin access DENIED for ${walletAddress}`);
            }
          } catch (error) {
            console.error(`[FRONTEND_ADMIN_AUTH] Error checking ${walletAddress}:`, error);
          }
        }

        if (!hasValidKey) {
          console.log(`[FRONTEND_ADMIN_AUTH] ❌ No valid admin keys found across ${uniqueWalletAddresses.length} wallet(s)`);
        }

        setIsAdmin(hasValidKey);

        // Update the last refresh time
        if (forceRefresh) {
          setLastRefreshTime(Date.now());
        }
      } catch (error) {
        console.error("Error checking admin access:", error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    },
    [user, authenticated, user?.wallet?.address, user?.linkedAccounts]
  );

  // Function to manually refresh admin status
  const refreshAdminStatus = useCallback(async () => {
    // Force a refresh of the admin status
    await checkAdminAccess(true);
  }, [checkAdminAccess]);

  useEffect(() => {
    // Wait until Privy is ready and user data is loaded
    if (!ready) return;

    checkAdminAccess();
  }, [ready, checkAdminAccess]);

  // Listen for wallet account changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = async () => {
        // When accounts change, just re-check admin access without re-login
        try {
          console.log("Wallet accounts changed, refreshing admin status");
          // Check admin access again with force refresh (no login needed)
          await checkAdminAccess(true);
        } catch (error) {
          console.error("Error handling account change:", error);
        }
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
  }, [checkAdminAccess]);

  return {
    isAdmin,
    loading,
    user,
    authenticated,
    refreshAdminStatus,
    lastRefreshTime,
  };
};
