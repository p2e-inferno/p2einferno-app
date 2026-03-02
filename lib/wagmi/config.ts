/**
 * Wagmi Configuration
 * Integrates Wagmi v3 with existing blockchain infrastructure
 */

import { createConfig, http, fallback, createStorage, cookieStorage } from "wagmi";
import { base, baseSepolia, mainnet, celo } from "wagmi/chains";
import { resolveRpcUrls } from "@/lib/blockchain/config/core/chain-resolution";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("wagmi:config");

/**
 * Supported chains for the application
 */
export const chains = [base, baseSepolia, mainnet, celo] as const;

/**
 * Build a fallback transport from all resolved RPC URLs for a chain.
 * Mirrors the approach used by createPublicClientForChain.
 */
function buildFallbackTransport(rpc: ReturnType<typeof resolveRpcUrls>) {
  return fallback(
    rpc.urls.map((url) =>
      http(url, { timeout: 10_000, retryCount: 2, retryDelay: 150 }),
    ),
  );
}

/**
 * Get RPC transports for each chain
 * Uses existing RPC fallback infrastructure (Alchemy → Infura → Public)
 */
function getTransports() {
  const baseRpc = resolveRpcUrls(base.id);
  const baseSepoliaRpc = resolveRpcUrls(baseSepolia.id);
  const mainnetRpc = resolveRpcUrls(mainnet.id);
  const celoRpc = resolveRpcUrls(celo.id);

  log.info("Wagmi RPC transports configured", {
    base: baseRpc.hosts,
    baseSepolia: baseSepoliaRpc.hosts,
    mainnet: mainnetRpc.hosts,
    celo: celoRpc.hosts,
  });

  return {
    [base.id]: buildFallbackTransport(baseRpc),
    [baseSepolia.id]: buildFallbackTransport(baseSepoliaRpc),
    [mainnet.id]: buildFallbackTransport(mainnetRpc),
    [celo.id]: buildFallbackTransport(celoRpc),
  };
}

export const wagmiConfig = createConfig({
  chains,
  transports: getTransports(),

  // SSR support for Next.js
  ssr: true,

  // Use cookie storage for SSR compatibility (instead of localStorage)
  storage: createStorage({
    storage: cookieStorage,
  }),

  // No wagmi connectors needed - Privy handles wallet connections
  // Wagmi will read from the active EIP-1193 provider (Privy's wallet)
  connectors: [],

  // Batch multiple calls into single request when possible
  batch: {
    multicall: {
      wait: 16, // Wait 16ms before batching
    },
  },

  // Polling interval for watching network changes (in ms)
  pollingInterval: 4_000, // 4 seconds
});

/**
 * Type helper for wagmi config
 * Enables proper TypeScript inference throughout the app
 */
export type WagmiConfigType = typeof wagmiConfig;

/**
 * Augment wagmi module for better TypeScript support
 */
declare module "wagmi" {
  interface Register {
    config: WagmiConfigType;
  }
}
