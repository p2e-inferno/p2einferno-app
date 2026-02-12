"use client";

import { useState, useEffect } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { celo } from "wagmi/chains";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { IdentitySDK, type contractEnv } from "@goodsdks/citizen-sdk";
import { getLogger } from "@/lib/utils/logger";
import { resolveRpcUrls } from "@/lib/blockchain/config/core/chain-resolution";

const log = getLogger("gooddollar:use-identity-sdk");

const GOODDOLLAR_ENV = (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV ||
  "staging") as contractEnv;

/**
 * Hook to get IdentitySDK instance on client-side.
 *
 * Uses Privy's wallet directly (via useWallets)
 *
 * Creates:
 * - Celo public client for reading GoodDollar contract data
 * - Wallet client from Privy's EIP-1193 provider for signing
 *
 * @returns {Object} Hook state
 * @returns {IdentitySDK | null} sdk - The initialized SDK instance
 * @returns {string | null} error - Error message if initialization failed
 * @returns {boolean} loading - Whether SDK is currently initializing
 */
export function useIdentitySDK() {
  // Get active wallet via smart selection
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();

  // Find the full connected wallet object that matches the selected address
  // This ensures we have access to getEthereumProvider()
  const activeWallet = selectedWallet
    ? wallets.find((w) => w.address === selectedWallet.address)
    : null;

  const [sdk, setSdk] = useState<IdentitySDK | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeWallet) {
      setSdk(null);
      setError("No wallet connected");
      return;
    }

    const initSDK = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get EIP-1193 provider from Privy wallet
        const ethereumProvider = await activeWallet.getEthereumProvider();

        // Create Celo public client for reading contract data
        const celoRpc = resolveRpcUrls(celo.id);
        const celoPublicClient = createPublicClient({
          chain: celo,
          transport: http(celoRpc.urls[0]),
        });

        // Create wallet client from Privy's provider
        const walletClient = createWalletClient({
          account: activeWallet.address as `0x${string}`,
          chain: celo,
          transport: custom(ethereumProvider),
        });

        const instance = await IdentitySDK.init({
          publicClient: celoPublicClient as any,
          walletClient: walletClient as any,
          env: GOODDOLLAR_ENV,
        });

        setSdk(instance);
        log.info("IdentitySDK initialized", {
          environment: GOODDOLLAR_ENV,
          wallet: activeWallet.address,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        setSdk(null);
        log.error("Failed to initialize IdentitySDK", { error: errorMsg });
      } finally {
        setLoading(false);
      }
    };

    initSDK();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallet?.address]);

  return { sdk, error, loading };
}
