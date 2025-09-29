/**
 * Shared client creation utilities for blockchain operations
 * Consolidates ethers and viem client patterns
 */

import { ethers } from "ethers";
import { type PublicClient, type WalletClient } from "viem";
import { UNIFIED_BLOCKCHAIN_CONFIG } from "../config";

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
// Removed read-only provider creation; use unified provider module instead

/**
 * Create ethers provider and signer from Privy wallet
 * Handles both user.wallet and wallets[0] wallet types
 */
export const createEthersFromPrivyWallet = async (
  wallet: PrivyWalletInfo,
): Promise<EthersClients> => {
  if (!wallet || !wallet.address) {
    throw new Error("No wallet provided or not connected.");
  }

  // Handle both wallet types:
  // - wallets[0] from useWallets() has getEthereumProvider()
  // - user.wallet from usePrivy() might have a different structure
  let provider: any;

  if (typeof wallet.getEthereumProvider === "function") {
    // This is from useWallets() - has getEthereumProvider method
    provider = await wallet.getEthereumProvider();
  } else if (wallet.provider) {
    // This might be user.wallet with direct provider access
    provider = wallet.provider;
  } else {
    throw new Error(
      "Unable to access Ethereum provider from wallet. Please ensure wallet is properly connected.",
    );
  }

  // If provider is already an ethers BrowserProvider, use it directly to avoid recursive wrapping
  const ethersProvider =
    provider instanceof ethers.BrowserProvider
      ? provider
      : new ethers.BrowserProvider(provider);
  const signer = await ethersProvider.getSigner();

  // Normalize rawProvider to EIP-1193 for network switching
  const rawProviderNormalized = (provider as any)?.request
    ? provider
    : ((provider as any)?.provider ??
      (typeof window !== "undefined" ? (window as any).ethereum : provider));

  return {
    provider: ethersProvider,
    signer,
    rawProvider: rawProviderNormalized,
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

// Note: read-only provider is available via '../provider'
