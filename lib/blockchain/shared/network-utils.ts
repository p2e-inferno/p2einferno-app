import { getLogger } from '@/lib/utils/logger';

const log = getLogger('blockchain:shared:network-utils');

/**
 * Shared network utilities for blockchain operations
 * Consolidates network switching and transaction utilities
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NetworkConfig {
  chain: {
    id: number;
    name: string;
    nativeCurrency: {
      name: string;
      symbol: string;
      decimals: number;
    };
    blockExplorers?: {
      default: {
        url: string;
      };
    };
  };
  rpcUrl: string;
  networkName: string;
}

// ============================================================================
// NETWORK SWITCHING
// ============================================================================

/**
 * Switch to the correct network for blockchain operations
 * Unified implementation to replace duplicated functions
 */
export const ensureCorrectNetwork = async (
  rawProvider: any,
  config: NetworkConfig
): Promise<void> => {
  // Normalize to an EIP-1193 provider with .request to avoid recursion when passed an ethers BrowserProvider
  if (typeof rawProvider?.request !== 'function') {
    const candidate = (rawProvider as any)?.provider ?? (typeof window !== 'undefined' ? (window as any).ethereum : undefined);
    if (candidate && typeof candidate.request === 'function') {
      rawProvider = candidate;
    }
  }
  const targetChainId = config.chain.id;
  const targetChainIdHex = `0x${targetChainId.toString(16)}`;

  log.info(`Ensuring wallet is on chain ${targetChainId} (${config.networkName})`);

  try {
    await rawProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: targetChainIdHex }],
    });
  } catch (switchError: any) {
    // If the chain hasn't been added to wallet, add it
    if (switchError.code === 4902) {
      log.info(`Adding ${config.chain.name} network to wallet`);

      const chainConfig = {
        chainId: targetChainIdHex,
        chainName: config.chain.name,
        nativeCurrency: config.chain.nativeCurrency,
        rpcUrls: [config.rpcUrl],
        blockExplorerUrls: config.chain.blockExplorers?.default
          ? [config.chain.blockExplorers.default.url]
          : undefined,
      };

      await rawProvider.request({
        method: "wallet_addEthereumChain",
        params: [chainConfig],
      });
    } else {
      throw switchError;
    }
  }

  // Wait for network switch to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Verify we're on the correct network
  const currentChainId = await rawProvider.request({ method: "eth_chainId" });
  const currentChainIdDecimal = parseInt(currentChainId, 16);

  if (currentChainIdDecimal !== targetChainId) {
    throw new Error(
      `Failed to switch to ${config.chain.name}. Current network: ${currentChainIdDecimal}, Expected: ${targetChainId}`
    );
  }
};

// ============================================================================
// TRANSACTION UTILITIES
// ============================================================================

/**
 * Get block explorer URL for transaction
 * Unified implementation to replace duplicated functions
 */
export const getBlockExplorerUrl = (txHash: string, config: NetworkConfig): string => {
  const explorer = config.chain.blockExplorers?.default?.url;
  if (!explorer) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  return `${explorer}/tx/${txHash}`;
};

/**
 * Validate if an address is a valid Ethereum address
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Ensure correct network using client-side config
 * Convenience wrapper for client-side operations
 */
export const ensureCorrectNetworkClient = async (rawProvider: any, clientConfig: NetworkConfig) => {
  return ensureCorrectNetwork(rawProvider, clientConfig);
};

/**
 * Get block explorer URL using client-side config
 * Convenience wrapper for client-side operations
 */
export const getBlockExplorerUrlClient = (txHash: string, clientConfig: NetworkConfig): string => {
  return getBlockExplorerUrl(txHash, clientConfig);
};
