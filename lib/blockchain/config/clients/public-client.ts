/**
 * Public client creation utilities
 * Handles read-only blockchain operations
 */

import {
  createPublicClient,
  createTransport,
  http,
  fallback,
  type PublicClient,
  type Chain,
  type Transport,
} from "viem";
import {
  resolveChain,
  resolveRpcUrls,
  getRpcFallbackSettings,
} from "../core/chain-resolution";
import { blockchainLogger } from "../../shared/logging-utils";

// Import transport functions (will be created in transport modules)
// For now, we'll import from the original file to maintain functionality
import { createSequentialHttpTransport } from "../transport/viem-transport";

let cachedServerPublicClient: PublicClient | null = null;
let cachedBrowserPublicClient: PublicClient | null = null;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create browser sequential transport (temporary - will be moved to transport/browser.ts)
 * This is an exact copy from the original unified-config.ts
 */
const createBrowserSequentialTransport = (
  urls: string[],
  {
    timeoutMs,
    retryDelay,
  }: {
    timeoutMs: number;
    retryDelay: number;
  },
): Transport => {
  let lastGoodIndex = 0;
  const total = urls.length;

  return ({ chain, retryCount: retryCount_ = 0, timeout: timeout_ }) => {
    const timeout = timeout_ ?? timeoutMs;

    return createTransport(
      {
        key: "http-sequential",
        name: "HTTP JSON-RPC (sequential)",
        type: "http",
        retryCount: 0,
        retryDelay,
        timeout,
        async request(requestArgs) {
          if (total === 0) {
            throw new Error("No RPC URLs configured");
          }

          let lastError: unknown;
          const startIndex = lastGoodIndex % total;

          for (let attempt = 0; attempt < total; attempt += 1) {
            const index = (startIndex + attempt) % total;
            const url = urls[index];

            const transport = http(url, {
              timeout,
              retryDelay,
              retryCount: retryCount_,
            })({ chain, retryCount: retryCount_, timeout });

            try {
              const result = await transport.request(requestArgs as any);
              lastGoodIndex = index;
              return result as any;
            } catch (error) {
              lastError = error;
              if (attempt < total - 1) {
                const backoff = Math.min(retryDelay * (attempt + 1), 1500);
                await delay(backoff);
              }
            }
          }

          throw lastError ?? new Error("All RPC endpoints failed");
        },
      },
      { url: urls[lastGoodIndex % total] ?? urls[0]! },
    );
  };
};

/**
 * Create public client for read operations
 */
export const createPublicClientUnified = (): PublicClient => {
  const { chain } = resolveChain();
  let { urls, hosts } = resolveRpcUrls(chain.id);
  const isBrowser = typeof window !== "undefined";

  const cachedClient = isBrowser
    ? cachedBrowserPublicClient
    : cachedServerPublicClient;
  if (cachedClient) {
    return cachedClient;
  }

  if (isBrowser) {
    const parseHost = (u: string) => {
      try {
        return new URL(u).host;
      } catch {
        return "[unparseable]";
      }
    };
    const keyedPred = (h: string) =>
      /alchemy\.com$/i.test(h) || /infura\.io$/i.test(h);
    const publicBasePred = (h: string) => /\.base\.org$/i.test(h);
    const hasKeyed = hosts.some(keyedPred);
    if (hasKeyed) {
      const keyed = urls.filter((u) => keyedPred(parseHost(u)));
      const publicBase = urls.filter((u) => publicBasePred(parseHost(u)));
      const others = urls.filter(
        (u) => !keyed.includes(u) && !publicBase.includes(u),
      );
      urls = [...keyed, ...others, ...publicBase];
      hosts = urls.map(parseHost);
    }
  }
  const { timeoutMs, stallMs, retryCount, retryDelay } =
    getRpcFallbackSettings();

  blockchainLogger.info("RPC fallback configured", {
    operation: "config:rpc",
    chainId: chain.id,
    order: hosts,
    timeoutMs,
    stallMs,
    retryCount,
    retryDelay,
  });

  if (isBrowser && urls.length > 0) {
    const sequentialTransport = createBrowserSequentialTransport(urls, {
      timeoutMs,
      retryDelay,
    });

    const client = createPublicClient({
      chain,
      transport: sequentialTransport,
    }) as unknown as PublicClient;
    cachedBrowserPublicClient = client;
    return client;
  }

  const sequentialTransport = createSequentialHttpTransport({
    urls,
    timeoutMs,
    retryDelayMs: retryDelay,
  });

  const client = createPublicClient({
    chain,
    transport: sequentialTransport,
  }) as unknown as PublicClient;
  cachedServerPublicClient = client;
  return client;
};

/**
 * Create a public client for an arbitrary chain.
 * Uses fallback transport for Base/Base Sepolia; defaults for others.
 */
export const createPublicClientForChain = (
  targetChain: Chain,
): PublicClient => {
  const { timeoutMs, stallMs, retryCount, retryDelay } =
    getRpcFallbackSettings();
  // Use prioritized fallback for known chains (Base mainnet/sepolia, Ethereum mainnet)
  if (targetChain?.id) {
    const { urls, hosts } = resolveRpcUrls(targetChain.id);

    blockchainLogger.info("RPC fallback configured (custom chain)", {
      operation: "config:rpc",
      chainId: targetChain.id,
      order: hosts,
      timeoutMs,
      stallMs,
      retryCount,
      retryDelay,
    });

    return createPublicClient({
      chain: targetChain,
      transport: fallback(
        urls.map((u) => http(u, { timeout: timeoutMs })),
        { rank: { timeout: stallMs }, retryCount, retryDelay },
      ),
    }) as unknown as PublicClient;
  }

  // Fallback: default http transport
  return createPublicClient({
    chain: targetChain,
    transport: http(undefined as any, { timeout: timeoutMs }),
  }) as unknown as PublicClient;
};
