/**
 * Shared client creation utilities for blockchain operations
 * Consolidates ethers and viem client patterns
 */

import { ethers } from "ethers";
import { type PublicClient, type WalletClient } from "viem";
import { UNIFIED_BLOCKCHAIN_CONFIG, getClientRpcUrls } from "../config/unified-config";
import { blockchainLogger } from "./logging-utils";

// ============================================================================
// TYPES
// ============================================================================

export interface EthersClients {
  provider: ethers.JsonRpcProvider | ethers.BrowserProvider;
  signer?: ethers.Signer;
  rawProvider?: any;
}

export interface PrivyWalletInfo {
  address: string;
  chainId?: string;
  getEthereumProvider?: () => Promise<any>;
  provider?: any;
}

// ============================================================================
// ETHERS CLIENT CREATION
// ============================================================================

/**
 * Create read-only ethers provider for server-side operations
 */
export const createEthersReadOnlyProvider = (): ethers.JsonRpcProvider | ethers.FallbackProvider => {
  const urls = getClientRpcUrls();
  const providers = urls.map((u) => new ethers.JsonRpcProvider(u));
  try {
    const hosts = urls.map((u) => { try { return new URL(u).host; } catch { return '[unparseable]'; } });
    blockchainLogger.debug('Ethers FallbackProvider configured', { operation: 'config:rpc:ethers', order: hosts });
  } catch {}
  if (providers.length === 0) {
    throw new Error('No RPC URLs configured for read-only provider');
  }
  if (providers.length === 1) return providers[0]!;
  return new ethers.FallbackProvider(providers);
};

/**
 * Create ethers provider and signer from Privy wallet
 * Handles both user.wallet and wallets[0] wallet types
 */
export const createEthersFromPrivyWallet = async (
  wallet: PrivyWalletInfo
): Promise<EthersClients> => {
  if (!wallet || !wallet.address) {
    throw new Error("No wallet provided or not connected.");
  }

  // Handle both wallet types:
  // - wallets[0] from useWallets() has getEthereumProvider()
  // - user.wallet from usePrivy() might have a different structure
  let provider;

  if (typeof wallet.getEthereumProvider === "function") {
    // This is from useWallets() - has getEthereumProvider method
    provider = await wallet.getEthereumProvider();
  } else if (wallet.provider) {
    // This might be user.wallet with direct provider access
    provider = wallet.provider;
  } else {
    throw new Error(
      "Unable to access Ethereum provider from wallet. Please ensure wallet is properly connected."
    );
  }

  const ethersProvider = new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  return { 
    provider: ethersProvider, 
    signer, 
    rawProvider: provider 
  };
};

// ============================================================================
// VIEM CLIENT UTILITIES
// ============================================================================

/**
 * Create public client for read operations
 */
export const createPublicClient = (): PublicClient => {
  return UNIFIED_BLOCKCHAIN_CONFIG.createPublicClient();
};

/**
 * Create wallet client for write operations (server-side only)
 * Returns null if private key is not configured
 */
export const createWalletClient = (): WalletClient | null => {
  return UNIFIED_BLOCKCHAIN_CONFIG.createWalletClient();
};

// ============================================================================
// BACKWARDS COMPATIBILITY
// ============================================================================

// Legacy function name for gradual migration
export const getReadOnlyProvider = createEthersReadOnlyProvider;
