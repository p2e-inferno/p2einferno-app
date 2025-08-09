import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";

/**
 * Custom hook for admin authentication using Unlock Protocol
 * @returns Object with isAdmin status, loading state, and user information
 */
export const useAdminAuth = () => {
  const { user, authenticated, ready } = usePrivy();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);

  // Function to check admin access
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

      // Default to development mode if no lock address is provided
      if (!adminLockAddress) {
        console.warn(
          "NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, allowing all authenticated users as admins in development"
        );
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      try {
        // Figure out which wallet address we should check.
        // 1. Prefer the address returned by the Ethereum provider (the address the user just signed in with).
        // 2. Fallback to the primary wallet address on the Privy user object.

        let walletAddress: string | undefined = undefined;

        // Attempt to read the currently selected account from the provider.
        if (typeof window !== "undefined" && (window as any).ethereum) {
          try {
            const accounts: string[] = await (window as any).ethereum.request({
              method: "eth_accounts",
            });
            if (accounts && accounts.length > 0) {
              walletAddress = accounts[0];
            }
          } catch (err) {
            console.warn("Unable to read accounts from provider", err);
          }
        }

        // Fallback to the wallet on the Privy user object if no provider address was found
        if (!walletAddress && user.wallet?.address) {
          walletAddress = user.wallet.address;
        }

        // If we still don't have a wallet address, we cannot continue
        if (!walletAddress) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Check if the user has a valid key for the admin lock
        const keyInfo = await lockManagerService.checkUserHasValidKey(
          walletAddress as Address,
          adminLockAddress as Address,
          forceRefresh
        );

        const hasValidKey = keyInfo !== null && keyInfo.isValid;

        // Log the result for debugging
        console.log(
          `Admin access check for ${walletAddress}: ${
            hasValidKey ? "GRANTED" : "DENIED"
          }${
            keyInfo
              ? `, expires: ${new Date(
                  Number(keyInfo.expirationTimestamp) * 1000
                ).toLocaleString()}`
              : ""
          }`
        );

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
    [user, authenticated, user?.wallet?.address]
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
