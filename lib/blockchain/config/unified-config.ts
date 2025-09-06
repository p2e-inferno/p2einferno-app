/**
 * Unified blockchain configuration system
 * Replaces multiple config files with environment-aware configuration
 */

import { base, baseSepolia, mainnet } from "viem/chains";
import { privateKeyToAccount, type Account } from "viem/accounts";
import {
  createWalletClient,
  createPublicClient,
  http,
  fallback,
  type WalletClient,
  type PublicClient,
} from "viem";
import { blockchainLogger } from "../shared/logging-utils";

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
    blockchainLogger.warn("Blockchain write operations disabled - missing configuration", { operation: 'env:privateKey' });
    return { privateKey: null, hasValidKey: false };
  }

  // Validate format without logging the actual key
  if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
    blockchainLogger.error("Invalid private key format - write operations disabled", { operation: 'env:privateKey' });
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
  const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  if (!apiKey) {
    const fallback = baseUrl.includes('mainnet') ? "https://mainnet.base.org" : "https://sepolia.base.org";
    const msg = "NEXT_PUBLIC_ALCHEMY_API_KEY not configured";
    // Log with blockchain logger for visibility
    blockchainLogger.warn(msg, { operation: 'config:init', fallbackRpc: fallback });
    return fallback;
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
        rpcUrl: createAlchemyRpcUrl(process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/"),
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET,
        networkName: "Base Mainnet",
      } as const;
    case "base-sepolia":
    default:
      return {
        chain: baseSepolia,
        rpcUrl: createAlchemyRpcUrl(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/"),
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA,
        networkName: "Base Sepolia",
      } as const;
  }
};

// ============================================================================
// RPC URL RESOLUTION (PRIORITIZED ORDER)
// ============================================================================

const getRpcFallbackSettings = () => {
  return {
    timeoutMs: Number(process.env.ADMIN_RPC_TIMEOUT_MS || 10000),
    stallMs: Number(process.env.ADMIN_RPC_FALLBACK_STALL_MS || 1500),
    retryCount: Number(process.env.ADMIN_RPC_FALLBACK_RETRY_COUNT || 1),
    retryDelay: Number(process.env.ADMIN_RPC_FALLBACK_RETRY_DELAY_MS || 250),
  } as const;
};

const getPreferredProvider = () => {
  const pref = (process.env.ADMIN_RPC_PRIMARY || 'alchemy').toLowerCase();
  return pref === 'infura' ? 'infura' : 'alchemy';
};

const resolveRpcUrls = (chainId: number) => {
  // Helper: derive prioritized URLs per chain
  const urls: string[] = [];

  // Shared API keys (client-safe)
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const infuraKey = process.env.NEXT_PUBLIC_INFURA_API_KEY;
  const preferred = getPreferredProvider();

  if (chainId === base.id) {
    // Base Mainnet: Alchemy -> Infura -> Base public
    const alchemyUrl = createAlchemyRpcUrl(process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/");
    const infuraEnv = process.env.NEXT_PUBLIC_INFURA_BASE_MAINNET_RPC_URL;
    const infuraUrl = infuraEnv || (infuraKey ? `https://base-mainnet.infura.io/v3/${infuraKey}` : undefined);
    // Push in preferred order
    if (preferred === 'infura') {
      if (infuraUrl) urls.push(infuraUrl);
      if (alchemyUrl) urls.push(alchemyUrl);
    } else {
      if (alchemyUrl) urls.push(alchemyUrl);
      if (infuraUrl) urls.push(infuraUrl);
    }
    urls.push("https://mainnet.base.org");
  } else if (chainId === baseSepolia.id) {
    // Base Sepolia: Alchemy -> Infura -> Base public
    const alchemyUrl = createAlchemyRpcUrl(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/");
    const infuraEnv = process.env.NEXT_PUBLIC_INFURA_BASE_SEPOLIA_RPC_URL;
    const infuraUrl = infuraEnv || (infuraKey ? `https://base-sepolia.infura.io/v3/${infuraKey}` : undefined);
    if (preferred === 'infura') {
      if (infuraUrl) urls.push(infuraUrl);
      if (alchemyUrl) urls.push(alchemyUrl);
    } else {
      if (alchemyUrl) urls.push(alchemyUrl);
      if (infuraUrl) urls.push(infuraUrl);
    }
    urls.push("https://sepolia.base.org");
  } else if (chainId === mainnet.id) {
    // Ethereum Mainnet: Alchemy -> Infura -> public
    const alchemyEthBase = "https://eth-mainnet.g.alchemy.com/v2/";
    const alchemyUrl = alchemyKey ? `${alchemyEthBase}${alchemyKey}` : undefined;
    const infuraUrl = infuraKey ? `https://mainnet.infura.io/v3/${infuraKey}` : undefined;
    if (preferred === 'infura') {
      if (infuraUrl) urls.push(infuraUrl);
      if (alchemyUrl) urls.push(alchemyUrl);
    } else {
      if (alchemyUrl) urls.push(alchemyUrl);
      if (infuraUrl) urls.push(infuraUrl);
    }
    // Public fallback (Cloudflare)
    urls.push("https://cloudflare-eth.com");
  }

  // As a final safety, if no URLs were computed, use the currently resolved rpcUrl
  if (urls.length === 0) {
    const { rpcUrl } = resolveChain();
    urls.push(rpcUrl);
  }

  const hosts = urls.map((u) => {
    try { return new URL(u).host; } catch { return '[unparseable]'; }
  });
  return { urls, hosts };
};

// ============================================================================
// CLIENT FACTORIES
// ============================================================================

/**
 * Create public client for read operations
 */
export const createPublicClientUnified = (): PublicClient => {
  const { chain } = resolveChain();
  const { urls, hosts } = resolveRpcUrls(chain.id);
  const { timeoutMs, stallMs, retryCount, retryDelay } = getRpcFallbackSettings();

  blockchainLogger.info('RPC fallback configured', {
    operation: 'config:rpc',
    chainId: chain.id,
    order: hosts,
    timeoutMs,
    stallMs,
    retryCount,
    retryDelay,
  });

  const transports = urls.map((u) => http(u, { timeout: timeoutMs }));

  return createPublicClient({
    chain,
    transport: fallback(transports, { stallTimeout: stallMs, retryCount, retryDelay }),
  }) as PublicClient;
};

/**
 * Create a public client for an arbitrary chain.
 * Uses fallback transport for Base/Base Sepolia; defaults for others.
 */
export const createPublicClientForChain = (targetChain: typeof base | typeof baseSepolia | typeof mainnet | any): PublicClient => {
  const { timeoutMs, stallMs, retryCount, retryDelay } = getRpcFallbackSettings();
  // Use prioritized fallback for known chains (Base mainnet/sepolia, Ethereum mainnet)
  if (targetChain?.id) {
    const { urls, hosts } = resolveRpcUrls(targetChain.id);

    blockchainLogger.info('RPC fallback configured (custom chain)', {
      operation: 'config:rpc',
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
        { stallTimeout: stallMs, retryCount, retryDelay }
      ),
    }) as PublicClient;
  }

  // Fallback: default http transport
  return createPublicClient({ chain: targetChain, transport: http(undefined as any, { timeout: timeoutMs }) }) as PublicClient;
};

/**
 * Create wallet client for write operations (server-side only)
 * Returns null if private key is not configured
 */
export const createWalletClientUnified = (): WalletClient | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    blockchainLogger.warn("Cannot create wallet client - private key not configured", { operation: 'walletClient:create' });
    return null;
  }

  try {
    const { chain } = resolveChain();
    const { urls } = resolveRpcUrls(chain.id);
    const { timeoutMs, stallMs, retryCount, retryDelay } = getRpcFallbackSettings();
    
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({
      account,
      chain,
      transport: fallback(
        urls.map((u) => http(u, { timeout: timeoutMs })),
        { stallTimeout: stallMs, retryCount, retryDelay }
      ),
    }) as WalletClient;
  } catch (error) {
    blockchainLogger.error("Failed to create wallet client", { operation: 'walletClient:create', error: (error as any)?.message || String(error) });
    return null;
  }
};

// ============================================================================
// UNIFIED CONFIGURATION
// ============================================================================

const { chain, rpcUrl, usdcTokenAddress, networkName } = resolveChain();
const { hosts: rpcHosts } = resolveRpcUrls(chain.id);
// Log resolved configuration early for debugging slow RPCs
blockchainLogger.info('Blockchain config resolved', {
  operation: 'config:init',
  chainId: chain.id,
  networkName,
  rpcHost: (() => {
    try {
      const url = new URL(rpcUrl);
      return url.host;
    } catch {
      return '[unparseable]';
    }
  })(),
  usesAlchemy: rpcUrl.includes('alchemy.com'),
  rpcTimeoutMs: Number(process.env.ADMIN_RPC_TIMEOUT_MS || 10000),
  rpcOrder: rpcHosts,
});
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
    blockchainLogger.error("Failed to create account", { operation: 'account:create', error: (error as any)?.message || String(error) });
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
export const CHAIN_CONFIG = UNIFIED_BLOCKCHAIN_CONFIG;
export const CLIENT_CHAIN_CONFIG = getClientConfig();
export const CHAIN_ID = UNIFIED_BLOCKCHAIN_CONFIG.chain.id;
