"use client";

import { useState, useEffect } from "react";
import { useWallets } from "@privy-io/react-auth";
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
 */
export function useIdentitySDK(): any {
  // Get wallets from Privy (same as BlockchainPayment component)
  const { wallets } = useWallets();
  const activeWallet = wallets[0]; // First wallet is the active one

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

  // Void unused state vars
  void error;
  void loading;

  return sdk ?? null;
}
