/**
 * Wagmi Provider Wrapper
 * Integrates Wagmi with React Query for blockchain interactions
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider as WagmiProviderBase } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi/config";
import { useState, type ReactNode } from "react";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("providers:wagmi");

interface WagmiProviderProps {
  children: ReactNode;
}

/**
 * Wagmi provider wrapper with React Query
 *
 * This sits inside PrivyProvider to leverage Privy's wallet management
 * while providing Wagmi hooks for blockchain interactions.
 *
 * Key Features:
 * - Integrates with existing RPC infrastructure
 * - Provides wagmi hooks (useAccount, useReadContract, useWriteContract, etc.)
 * - Automatic request deduplication and caching
 * - Works seamlessly with Privy authentication
 *
 * Usage:
 * Place inside PrivyProvider in ClientSideWrapper
 */
export function WagmiProvider({ children }: WagmiProviderProps) {
  // Create QueryClient with sensible defaults for blockchain operations
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cache for 5 minutes (blockchain data changes slowly)
            staleTime: 1000 * 60 * 5,

            // Keep in memory for 30 minutes
            gcTime: 1000 * 60 * 30, // renamed from cacheTime in React Query v5

            // Retry failed requests (important for RPC reliability)
            retry: 3,

            // Exponential backoff for retries
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 30000),

            // Don't refetch on window focus for blockchain data
            refetchOnWindowFocus: false,

            // Refetch on reconnect (user may have switched networks)
            refetchOnReconnect: true,

            // Refetch interval (disabled by default, can be enabled per-query)
            refetchInterval: false,
          },
          mutations: {
            // Retry mutations once (for transaction submissions)
            retry: 1,
          },
        },
      }),
  );

  log.debug("WagmiProvider initialized");

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProviderBase config={wagmiConfig}>{children}</WagmiProviderBase>
    </QueryClientProvider>
  );
}
