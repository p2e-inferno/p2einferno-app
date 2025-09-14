import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

type AdminAuthContextValue = {
  isAdmin: boolean;
  loading: boolean;
  authenticated: boolean;
  user: any;
  lastRefreshTime: number;
  refreshAdminStatus: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

const log = getLogger("client:AdminAuthProvider");

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const { user } = useUser();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const inFlightRef = useRef(false);
  const lastCheckRef = useRef(0);
  const selectedWallet = useSmartWalletSelection() as any;

  const checkAdminAccess = useCallback(
    async (forceRefresh = false) => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!forceRefresh && now - lastCheckRef.current < 10_000) return;
      inFlightRef.current = true;
      setLoading(true);

      if (!authenticated || !user) {
        setIsAdmin(false);
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
      if (!adminLockAddress) {
        log.warn("NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, no admin access");
        setIsAdmin(false);
        setLoading(false);
        inFlightRef.current = false;
        return;
      }

      try {
        let walletAddresses: string[] = [];

        // Active provider account (if any)
        if (typeof window !== "undefined" && (window as any).ethereum) {
          try {
            const accounts: string[] = await (window as any).ethereum.request({
              method: "eth_accounts",
            });
            if (accounts && accounts.length > 0 && accounts[0])
              walletAddresses.push(accounts[0]);
          } catch (err) {
            log.warn("Unable to read accounts from provider", { err });
          }
        }

        // Primary Privy wallet
        if (user.wallet?.address) walletAddresses.push(user.wallet.address);

        // Backend-sourced linked wallets (authoritative)
        try {
          const response = await fetch("/api/user/wallet-addresses", {
            method: "GET",
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.walletAddresses)
              walletAddresses = [...walletAddresses, ...data.walletAddresses];
          } else {
            log.warn(
              "Failed to fetch wallet addresses from backend, falling back to local data",
            );
          }
        } catch (error) {
          log.error("Error fetching wallet addresses from backend", { error });
        }

        // Frontend linkedAccounts fallback (best-effort)
        if (user.linkedAccounts) {
          for (const account of user.linkedAccounts) {
            if (account.type === "wallet" && account.address)
              walletAddresses.push(account.address);
          }
        }

        const uniqueWalletAddresses = [
          ...new Set(walletAddresses.map((a) => a.toLowerCase())),
        ] as string[];
        if (uniqueWalletAddresses.length === 0) {
          setIsAdmin(false);
          setLoading(false);
          inFlightRef.current = false;
          return;
        }

        // Determine the active wallet preference
        const providerActive =
          typeof window !== "undefined" &&
          (window as any).ethereum?.selectedAddress
            ? ((window as any).ethereum.selectedAddress as string) || ""
            : "";
        const active = (
          selectedWallet?.address ||
          providerActive ||
          ""
        ).toLowerCase();

        // If an active wallet exists, enforce active-wallet policy like the server
        if (active) {
          const isLinked = uniqueWalletAddresses.includes(active);
          if (!isLinked) {
            setIsAdmin(false);
          } else {
            try {
              const keyInfo = await lockManagerService.checkUserHasValidKey(
                active as Address,
                adminLockAddress as Address,
                forceRefresh,
              );
              setIsAdmin(!!keyInfo?.isValid);
            } catch (error) {
              log.error("Error checking active wallet", { error });
              setIsAdmin(false);
            }
          }
        } else {
          // Fallback: any linked wallet with a key grants access
          let hasValidKey = false;
          for (const walletAddress of uniqueWalletAddresses) {
            try {
              const keyInfo = await lockManagerService.checkUserHasValidKey(
                walletAddress as Address,
                adminLockAddress as Address,
                forceRefresh,
              );
              if (keyInfo && keyInfo.isValid) {
                hasValidKey = true;
                break;
              }
            } catch (error) {
              log.error("Error checking", { walletAddress, error });
            }
          }
          setIsAdmin(hasValidKey);
        }
        if (forceRefresh) setLastRefreshTime(Date.now());
        lastCheckRef.current = Date.now();
      } catch (error) {
        log.error("Error checking admin access", { error });
        setIsAdmin(false);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [authenticated, user, selectedWallet?.address],
  );

  const refreshAdminStatus = useCallback(async () => {
    await checkAdminAccess(true);
  }, [checkAdminAccess]);

  // Initial check when Privy ready
  useEffect(() => {
    if (!ready) return;
    checkAdminAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Re-evaluate when selected wallet changes (embedded/provider swap)
  useEffect(() => {
    if (!ready) return;
    checkAdminAccess(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWallet?.address]);

  // Single wallet-change listener + session rotation/revoke
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    let cancelled = false;
    const handleAccountsChanged = async () => {
      try {
        await checkAdminAccess(true);
        // Attempt to rotate session to the active wallet
        try {
          const accessToken = await getAccessToken();
          const active = selectedWallet?.address || "";
          if (!accessToken) throw new Error("No access token");
          const rotate = await fetch("/api/admin/session", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Active-Wallet": active,
            },
            credentials: "include",
          });
          if (!rotate.ok) {
            await fetch("/api/admin/logout", {
              method: "POST",
              credentials: "include",
            });
          }
        } catch (e) {
          // ignore network errors; UI will reflect isAdmin state
        }
      } catch (error) {
        log.error("Error handling account change", { error });
      }
      if (cancelled) return;
      // Simple, deterministic UX: full reload after wallet change
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => {
      cancelled = true;
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkAdminAccess, getAccessToken, selectedWallet?.address]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      isAdmin,
      loading,
      authenticated,
      user,
      lastRefreshTime,
      refreshAdminStatus,
    }),
    [
      isAdmin,
      loading,
      authenticated,
      user,
      lastRefreshTime,
      refreshAdminStatus,
    ],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuthContext() {
  return useContext(AdminAuthContext);
}
