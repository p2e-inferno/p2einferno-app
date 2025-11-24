/**
 * Wagmi Configuration
 * Integrates Wagmi v3 with existing blockchain infrastructure
 */

import { createConfig, http, createStorage, cookieStorage } from "wagmi";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import { resolveRpcUrls } from "@/lib/blockchain/config/core/chain-resolution";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("wagmi:config");

/**
 * Supported chains for the application
 * Aligned with existing blockchain configuration
 */
export const chains = [base, baseSepolia, mainnet] as const;

/**
 * Get RPC transports for each chain
 * Uses existing RPC fallback infrastructure (Alchemy → Infura → Public)
 */
function getTransports() {
  const baseRpc = resolveRpcUrls(base.id);
  const baseSepoliaRpc = resolveRpcUrls(baseSepolia.id);
  const mainnetRpc = resolveRpcUrls(mainnet.id);

  log.info("Wagmi RPC transports configured", {
    base: baseRpc.hosts[0],
    baseSepolia: baseSepoliaRpc.hosts[0],
    mainnet: mainnetRpc.hosts[0],
  });

  return {
    [base.id]: http(baseRpc.urls[0], {
      timeout: 10000, // 10 second timeout
      retryCount: 3,
      retryDelay: 150,
    }),
    [baseSepolia.id]: http(baseSepoliaRpc.urls[0], {
      timeout: 10000,
      retryCount: 3,
      retryDelay: 150,
    }),
    [mainnet.id]: http(mainnetRpc.urls[0], {
      timeout: 10000,
      retryCount: 3,
      retryDelay: 150,
    }),
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

