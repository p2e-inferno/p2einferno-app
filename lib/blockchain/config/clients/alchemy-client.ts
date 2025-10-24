/**
 * Alchemy-only public client creation
 * Creates a standard viem public client using only Alchemy RPC endpoints
 */

import { createPublicClient, http, type PublicClient, type Chain } from "viem";
import {
  resolveChain,
  getAlchemyBaseUrl,
  createAlchemyRpcUrl,
} from "../core/chain-resolution";
import { blockchainLogger } from "../../shared/logging-utils";

let cachedAlchemyClient: PublicClient | null = null;

/**
 * Create a standard viem public client using only Alchemy
 * Uses simple HTTP transport without fallbacks or retry logic
 */
export const createAlchemyPublicClient = (): PublicClient => {
  const { chain } = resolveChain();

  // Return cached client if available
  if (cachedAlchemyClient) {
    return cachedAlchemyClient;
  }

  const baseUrl = getAlchemyBaseUrl(chain.id);
  const alchemyUrl = createAlchemyRpcUrl(baseUrl);

  blockchainLogger.info("Creating Alchemy-only public client", {
    operation: "alchemy:client",
    chainId: chain.id,
    networkName: chain.name,
    hasApiKey: !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  });

  const client = createPublicClient({
    chain,
    transport: http(alchemyUrl, {
      timeout: 10000, // 10 second timeout
      retryCount: 0, // No retries - single endpoint
    }),
  }) as unknown as PublicClient;

  cachedAlchemyClient = client;
  return client;
};

/**
 * Create an Alchemy public client for a specific chain
 * @param targetChain The chain to create client for
 * @returns Public client configured for the specified chain
 */
export const createAlchemyPublicClientForChain = (
  targetChain: Chain,
): PublicClient => {
  const baseUrl = getAlchemyBaseUrl(targetChain.id);
  const alchemyUrl = createAlchemyRpcUrl(baseUrl);

  blockchainLogger.info(
    "Creating Alchemy-only public client for custom chain",
    {
      operation: "alchemy:client:custom",
      chainId: targetChain.id,
      networkName: targetChain.name,
      hasApiKey: !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    },
  );

  return createPublicClient({
    chain: targetChain,
    transport: http(alchemyUrl, {
      timeout: 10000,
      retryCount: 0,
    }),
  }) as unknown as PublicClient;
};
