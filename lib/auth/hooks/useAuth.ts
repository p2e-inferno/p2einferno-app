import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AuthLevel, AdminStrategy } from '../core/AuthTypes';
import { lockManagerService } from "@/lib/blockchain/lock-manager";
import { type Address } from "viem";

interface UseAuthOptions {
  adminStrategy?: AdminStrategy;
}

interface UseAuthReturn {
  // Common auth state
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  user: any;
  
  // Admin-specific state
  adminStrategy?: 'blockchain' | 'database';
  expirationDate?: string;
  walletAddress?: string;
  
  // Actions
  refreshAuth: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Unified authentication hook
 * Replaces useLockManagerAdminAuth and useBackendAdminAuth
 */
export function useAuth(
  authLevel: AuthLevel,
  options: UseAuthOptions = {}
): UseAuthReturn {
  const { user, authenticated, ready, login, logout } = usePrivy();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminStrategy, setAdminStrategy] = useState<'blockchain' | 'database'>();
  const [expirationDate, setExpirationDate] = useState<string>();
  const [walletAddress, setWalletAddress] = useState<string>();

  // Function to check admin access (blockchain on frontend, API for database)
  const checkAdminAccess = useCallback(async () => {
    if (authLevel === 'user') {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    if (!authenticated || !user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const strategy = options.adminStrategy || 'auto';
      
      if (strategy === 'database') {
        // Database strategy: Use API endpoint
        const response = await fetch('/api/admin/check-admin-status', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setIsAdmin(data.hasAccess || false);
          setAdminStrategy('database');
        } else {
          setIsAdmin(false);
          setError("Database admin check failed");
        }
      } else {
        // Blockchain strategy: Direct frontend checking (like original useLockManagerAdminAuth)
        const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
        
        if (!adminLockAddress) {
          console.warn("NEXT_PUBLIC_ADMIN_LOCK_ADDRESS not set, no admin access");
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Get wallet address from provider or Privy user
        let walletAddress: string | undefined;
        
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

        if (!walletAddress && user.wallet?.address) {
          walletAddress = user.wallet.address;
        }

        if (!walletAddress) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Check blockchain admin key
        const keyInfo = await lockManagerService.checkUserHasValidKey(
          walletAddress as Address,
          adminLockAddress as Address,
          false
        );

        const hasValidKey = keyInfo !== null && keyInfo.isValid;
        setIsAdmin(hasValidKey);
        setAdminStrategy('blockchain');
        setWalletAddress(walletAddress);
        
        if (keyInfo?.expirationTimestamp) {
          const expirationDate = keyInfo.expirationTimestamp > BigInt(Number.MAX_SAFE_INTEGER)
            ? "Never (infinite)"
            : new Date(Number(keyInfo.expirationTimestamp) * 1000).toLocaleDateString();
          setExpirationDate(expirationDate);
        }

        console.log(`[USE_AUTH] Blockchain admin access: ${hasValidKey ? 'GRANTED' : 'DENIED'} for ${walletAddress}`);
      }

    } catch (err) {
      console.error('[USE_AUTH] Error checking auth:', err);
      setError(err instanceof Error ? err.message : "Auth check failed");
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [authLevel, user, authenticated, options.adminStrategy]);

  // Manual refresh function
  const refreshAuth = useCallback(async () => {
    await checkAdminAccess();
  }, [checkAdminAccess]);

  // Initial auth check
  useEffect(() => {
    if (!ready) return;
    checkAdminAccess();
  }, [ready, checkAdminAccess]);

  // Listen for wallet account changes (for blockchain auth)
  useEffect(() => {
    if (authLevel === 'admin' && options.adminStrategy !== 'database') {
      if (typeof window !== "undefined" && window.ethereum) {
        const handleAccountsChanged = async () => {
          console.log('[USE_AUTH] Wallet accounts changed, refreshing auth');
          await checkAdminAccess();
        };

        window.ethereum.on("accountsChanged", handleAccountsChanged);
        return () => {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        };
      }
    }
  }, [authLevel, options.adminStrategy, checkAdminAccess]);

  return {
    isAuthenticated: authenticated,
    isAdmin: authLevel === 'admin' ? isAdmin : false,
    loading,
    error,
    user,
    adminStrategy,
    expirationDate,
    walletAddress,
    refreshAuth,
    login: async () => { login(); },
    logout: async () => { logout(); },
  };
}

// Convenience hooks for common patterns
export const useUserAuth = () => useAuth('user');

export const useAdminAuth = (strategy?: AdminStrategy) => 
  useAuth('admin', { adminStrategy: strategy || 'auto' });

export const useBlockchainAdminAuth = () => 
  useAuth('admin', { adminStrategy: 'blockchain' });

export const useBackendAdminAuth = () => 
  useAuth('admin', { adminStrategy: 'database' });