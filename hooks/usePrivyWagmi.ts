/**
 * Privy-Wagmi Sync Hook
 * Ensures Privy wallet state is synchronized with Wagmi hooks
 */

import { useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useConnection } from "wagmi";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:privy-wagmi");

/**
 * Hook to sync Privy wallet state with Wagmi
 *
 * This ensures that:
 * - useConnection() reflects Privy's active wallet address
 * - Wagmi hooks work seamlessly with Privy's embedded wallets
 * - Wallet changes are properly reflected in both systems
 *
 * Usage:
 * Call this hook once in your app (e.g., in a layout component)
 * or in components that need to ensure wallet sync.
 *
 * @returns Sync status and wallet information
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isSynced, activeWallet } = usePrivyWagmi()
 *
 *   // Now you can use wagmi hooks
 *   const { address } = useConnection()
 *   const { data } = useReadContract({...})
 * }
 * ```
 */
export function usePrivyWagmi() {
  const { authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();
  const { address: wagmiAddress, isConnected } = useConnection();

  // Get active wallet via smart selection
  const activeWallet = selectedWallet;
  const privyAddress = activeWallet?.address;

  // Sync status
  const isSynced = privyAddress === wagmiAddress;

  // Log sync issues for debugging
  useEffect(() => {
    if (!ready) return;

    if (authenticated && privyAddress && !isSynced) {
      log.debug("Privy-Wagmi wallet addresses differ", {
        privyAddress,
        wagmiAddress: wagmiAddress || "none",
        walletsCount: wallets.length,
      });

      // Wagmi should automatically detect Privy's EIP-1193 provider
      // If not synced, it may mean the provider hasn't been detected yet
      // or the user needs to connect their wallet via the Privy UI
    }

    // If user logs out of Privy but Wagmi still thinks it's connected
    if (!authenticated && isConnected) {
      log.info("User logged out of Privy, Wagmi should disconnect");
    }
  }, [
    ready,
    authenticated,
    privyAddress,
    wagmiAddress,
    isSynced,
    isConnected,
    wallets.length,
  ]);

  return {
    /**
     * Whether Privy is ready
     */
    isReady: ready,

    /**
     * Whether Privy address matches Wagmi address
     */
    isSynced,

    /**
     * Active wallet from Privy
     */
    activeWallet,

    /**
     * Privy wallet address
     */
    privyAddress,

    /**
     * Wagmi detected address
     */
    wagmiAddress,

    /**
     * Whether user is authenticated via Privy
     */
    authenticated,
  };
}

/**
 * Hook to check if wagmi hooks are ready to use
 *
 * This is a simpler version that just checks if both systems are ready
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isReady = useIsWagmiReady()
 *
 *   if (!isReady) {
 *     return <div>Connecting wallet...</div>
 *   }
 *
 *   // Now safe to use wagmi hooks
 *   const { address } = useConnection()
 * }
 * ```
 */
export function useIsWagmiReady(): boolean {
  const { ready, authenticated } = usePrivy();
  const { address } = useConnection();

  // Ready when Privy is authenticated and wagmi has detected an address
  return ready && authenticated && !!address;
}

