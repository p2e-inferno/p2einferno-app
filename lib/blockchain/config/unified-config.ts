/**
 * Unified blockchain configuration system
 * Replaces multiple config files with environment-aware configuration
 */

import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount, type Account } from "viem/accounts";
import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
} from "viem";

// ============================================================================
// TYPES
// ============================================================================

export interface BlockchainConfig {
  chain: typeof base | typeof baseSepolia;
  rpcUrl: string;
  networkName: string;
  usdcTokenAddress?: string;
  hasPrivateKey: boolean;
  createPublicClient: () => PublicClient;
  createWalletClient: () => WalletClient | null;
}

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

/**
 * Secure environment validation without exposing sensitive details
 */
const validateEnvironment = (): {
  privateKey: `0x${string}` | null;
  hasValidKey: boolean;
} => {
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.warn("Blockchain write operations disabled - missing configuration");
    return { privateKey: null, hasValidKey: false };
  }

  // Validate format without logging the actual key
  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    console.error("Invalid private key format - write operations disabled");
    return { privateKey: null, hasValidKey: false };
  }

  return { privateKey: privateKey as `0x${string}`, hasValidKey: true };
};

// ============================================================================
// CHAIN RESOLUTION
// ============================================================================

/**
 * Create properly configured RPC URL with Alchemy API key
 */
const createAlchemyRpcUrl = (baseUrl: string): string => {
  const apiKey = process.env.NEXT_ALCHEMY_API_KEY;
  if (!apiKey) {
    console.warn("NEXT_ALCHEMY_API_KEY not configured, using fallback RPC");
    // Fallback to free RPC endpoints
    return baseUrl.includes('mainnet') ? "https://mainnet.base.org" : "https://sepolia.base.org";
  }
  return `${baseUrl}${apiKey}`;
};

const resolveChain = () => {
  const network = (
    process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia"
  ).toLowerCase();
  
  switch (network) {
    case "base":
    case "mainnet":
      return {
        chain: base,
        rpcUrl: createAlchemyRpcUrl(process.env.BASE_MAINNET_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/"),
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET,
        networkName: "Base Mainnet",
      } as const;
    case "base-sepolia":
    default:
      return {
        chain: baseSepolia,
        rpcUrl: createAlchemyRpcUrl(process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/"),
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA,
        networkName: "Base Sepolia",
      } as const;
  }
};

// ============================================================================
// CLIENT FACTORIES
// ============================================================================

/**
 * Create public client for read operations
 */
export const createPublicClientUnified = (): PublicClient => {
  const { chain, rpcUrl } = resolveChain();
  
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;
};

/**
 * Create wallet client for write operations (server-side only)
 * Returns null if private key is not configured
 */
export const createWalletClientUnified = (): WalletClient | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    console.warn("Cannot create wallet client - private key not configured");
    return null;
  }

  try {
    const { chain, rpcUrl } = resolveChain();
    
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }) as WalletClient;
  } catch (error) {
    console.error("Failed to create wallet client:", error);
    return null;
  }
};

// ============================================================================
// UNIFIED CONFIGURATION
// ============================================================================

const { chain, rpcUrl, usdcTokenAddress, networkName } = resolveChain();
const { hasValidKey } = validateEnvironment();

export const UNIFIED_BLOCKCHAIN_CONFIG: BlockchainConfig = {
  chain,
  rpcUrl,
  networkName,
  usdcTokenAddress,
  hasPrivateKey: hasValidKey,
  createPublicClient: createPublicClientUnified,
  createWalletClient: createWalletClientUnified,
};

/**
 * Create account from private key (server-side only)
 * Returns null if private key is not configured
 */
export const createAccountUnified = (): Account | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    return null;
  }

  try {
    return privateKeyToAccount(privateKey);
  } catch (error) {
    console.error("Failed to create account:", error);
    return null;
  }
};

// ============================================================================
// CONFIGURATION CHECKS
// ============================================================================

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

// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================

// Legacy exports for gradual migration
export const CHAIN_CONFIG = UNIFIED_BLOCKCHAIN_CONFIG;
export const CLIENT_CHAIN_CONFIG = getClientConfig();
export const CHAIN_ID = UNIFIED_BLOCKCHAIN_CONFIG.chain.id;