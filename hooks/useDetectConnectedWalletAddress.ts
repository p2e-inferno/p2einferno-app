import { useState, useEffect } from "react";
import { type User } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:detect-connected-wallet-address");

/**
 * Hook that provides consistent wallet address detection across all components.
 *
 * Uses the same prioritization logic:
 * 1. Connected provider address (from window.ethereum)
 * 2. Privy user wallet address
 * 3. null if no wallet available
 *
 * This ensures all components (PrivyConnectButton, AdminAccessRequired, useLockManagerAdminAuth)
 * are checking the exact same wallet address and prevents auth inconsistencies.
 */
export function useDetectConnectedWalletAddress(user?: User | null) {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  // Track connected wallet address via window.ethereum
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
        log.debug(`Wallet account changed to: ${addr}`);
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

  // Return the wallet address using consistent prioritization
  const walletAddress = connectedAddress || user?.wallet?.address || null;

  return {
    walletAddress,
    connectedAddress, // For components that need the raw provider address
  };
}
