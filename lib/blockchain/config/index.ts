/**
 * Unified blockchain configuration system - Public API
 * Main entry point for all blockchain configuration functionality
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

// Types and interfaces
export type {
  BlockchainConfig,
  EnvironmentValidation,
  ChainConfig,
  RpcFallbackSettings,
  RpcUrlsResult,
  SequentialTransportConfig,
  BrowserTransportConfig,
  ClientConfig,
} from "./core/types";

// Environment validation
export {
  validatePrivateKey,
  validateRpcUrl,
  validateUsdcConfiguration,
} from "./core/validation";

// Chain resolution
export {
  getAlchemyBaseUrl,
  createAlchemyRpcUrl,
  getRpcFallbackSettings,
  getPreferredProvider,
} from "./core/chain-resolution";

// Settings and constants
export {
  DEFAULT_TIMEOUTS,
  RPC_PROVIDERS,
  SUPPORTED_NETWORKS,
  DEFAULT_NETWORK,
  RPC_URL_TEMPLATES,
  ENV_VARS,
  CHAIN_IDS,
  NETWORK_NAMES,
} from "./core/settings";

// ============================================================================
// CLIENT EXPORTS
// ============================================================================

// Public client creation (createPublicClientUnified is used in main config)
export { createPublicClientForChain } from "./clients/public-client";

// Account creation
export { createAccountUnified } from "./clients/account";

// ============================================================================
// TRANSPORT EXPORTS
// ============================================================================

// Sequential transport (existing)
export { createSequentialHttpTransport } from "./transport/viem-transport";

// ============================================================================
// MAIN CONFIGURATION IMPLEMENTATION
// ============================================================================

import { blockchainLogger } from "../shared/logging-utils";
import type { BlockchainConfig } from "./core/types";
import { resolveChain, resolveRpcUrls } from "./core/chain-resolution";
import { validateEnvironment } from "./core/validation";
import { createPublicClientUnified } from "./clients/public-client";
import { createWalletClientUnified } from "./clients/wallet-client";


// Initialize configuration using our core modules
const { chain, rpcUrl, usdcTokenAddress, networkName } = resolveChain();
const { hosts: rpcHosts } = resolveRpcUrls(chain.id);
const { hasValidKey } = validateEnvironment();

// Log resolved configuration early for debugging slow RPCs
blockchainLogger.info("Blockchain config resolved", {
  operation: "config:init",
  chainId: chain.id,
  networkName,
  rpcHost: (() => {
    try {
      const url = new URL(rpcUrl);
      return url.host;
    } catch {
      return "[unparseable]";
    }
  })(),
  usesAlchemy: rpcUrl.includes("alchemy.com"),
  rpcTimeoutMs: Number(process.env.ADMIN_RPC_TIMEOUT_MS || 10000),
  rpcOrder: rpcHosts,
});

/**
 * Main blockchain configuration object
 * Provides all necessary configuration for blockchain operations
 */
export const UNIFIED_BLOCKCHAIN_CONFIG: BlockchainConfig = {
  chain,
  rpcUrl,
  networkName,
  usdcTokenAddress,
  hasPrivateKey: hasValidKey,
  createPublicClient: createPublicClientUnified,
  createWalletClient: createWalletClientUnified,
};

// Export the client creation functions that are used in the main config
export { createPublicClientUnified } from "./clients/public-client";
export { createWalletClientUnified } from "./clients/wallet-client";
export { createAlchemyPublicClient } from "./clients/alchemy-client";
export { createAlchemyEthersAdapterReadClient, createInfuraEthersAdapterReadClient } from "./clients/ethers-adapter-client";

/**
 * Check if server blockchain operations are properly configured
 */
export const isServerBlockchainConfigured = (): boolean => {
  return UNIFIED_BLOCKCHAIN_CONFIG.hasPrivateKey;
};

/**
 * Get client-safe configuration (without private key info)
 */
export const getClientConfig = () => {
  return {
    chain: UNIFIED_BLOCKCHAIN_CONFIG.chain,
    rpcUrl: UNIFIED_BLOCKCHAIN_CONFIG.rpcUrl,
    networkName: UNIFIED_BLOCKCHAIN_CONFIG.networkName,
    chainId: UNIFIED_BLOCKCHAIN_CONFIG.chain.id,
  };
};

/**
 * Client-safe prioritized RPC URLs (used for ethers FallbackProvider on web)
 */
export const getClientRpcUrls = (targetChainId?: number): string[] => {
  const chainId = targetChainId ?? UNIFIED_BLOCKCHAIN_CONFIG.chain.id;
  return resolveRpcUrls(chainId).urls;
};

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================

// Legacy exports for gradual migration
export const CHAIN_ID = UNIFIED_BLOCKCHAIN_CONFIG.chain.id;
