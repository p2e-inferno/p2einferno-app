/**
 * Client-side blockchain configuration
 * Uses unified configuration system
 */

import { type PublicClient } from "viem";
import { 
  getClientConfig,
  createPublicClientUnified
} from "../config";
import {
  getBlockExplorerUrl as getBlockExplorerUrlShared,
  type NetworkConfig
} from "../shared/network-utils";

// ============================================================================
// CLIENT-SIDE BLOCKCHAIN CLIENTS
// ============================================================================

/**
 * Create public client for reading from blockchain (client-side)
 */
export const createClientPublicClient = (): PublicClient => {
  return createPublicClientUnified();
};

// ============================================================================
// CLIENT-SIDE UTILITIES
// ============================================================================

/**
 * Get block explorer URL for transaction (client-side safe)
 */
export const getClientBlockExplorerUrl = (txHash: string): string => {
  const clientConfig = getClientConfig();
  const networkConfig: NetworkConfig = {
    chain: clientConfig.chain,
    rpcUrl: clientConfig.rpcUrl,
    networkName: clientConfig.networkName,
  };
  
  return getBlockExplorerUrlShared(txHash, networkConfig);
};

/**
 * Get current network information for display
 */
export const getCurrentNetworkInfo = () => {
  const clientConfig = getClientConfig();
  return {
    chainId: clientConfig.chain.id,
    chainName: clientConfig.chain.name,
    networkName: clientConfig.networkName,
    nativeCurrency: clientConfig.chain.nativeCurrency,
    blockExplorer: clientConfig.chain.blockExplorers?.default?.url,
  };
};

// ============================================================================
// BACKWARDS COMPATIBILITY
// ============================================================================

// Legacy exports for gradual migration
export const CLIENT_CHAIN_CONFIG = getClientConfig();
export const CLIENT_CHAIN_ID = CLIENT_CHAIN_CONFIG.chain.id;