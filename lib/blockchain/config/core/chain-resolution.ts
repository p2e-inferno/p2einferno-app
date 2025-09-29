/**
 * Chain resolution and RPC URL configuration
 * Handles network selection and RPC endpoint management
 */

import { base, baseSepolia, mainnet } from "viem/chains";
import { blockchainLogger } from "../../shared/logging-utils";
import type { ChainConfig, RpcUrlsResult, RpcFallbackSettings } from "./types";

/**
 * Create properly configured RPC URL with Alchemy API key
 * @param baseUrl The base Alchemy URL
 * @returns Complete RPC URL with API key or fallback
 */
export const createAlchemyRpcUrl = (baseUrl: string): string => {
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

/**
 * Resolve chain configuration based on environment
 * Defaults to Base Sepolia (testnet) for safety
 */
export const resolveChain = (): ChainConfig => {
  const network = (
    process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia"
  ).toLowerCase();
  
  switch (network) {
    case "base":
      return {
        chain: base,
        rpcUrl: createAlchemyRpcUrl(process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/"),
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET,
        networkName: "Base Mainnet",
      } as const;
      
    case "mainnet":
      return {
        chain: mainnet,
        rpcUrl: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
          ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
          : "https://cloudflare-eth.com",
        usdcTokenAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS_ETHEREUM_MAINNET,
        networkName: "Ethereum Mainnet",
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

/**
 * Get RPC fallback configuration settings
 * Configurable via environment variables
 */
export const getRpcFallbackSettings = (): RpcFallbackSettings => {
  return {
    timeoutMs: Number(process.env.ADMIN_RPC_TIMEOUT_MS || 10000),
    stallMs: Number(process.env.ADMIN_RPC_FALLBACK_STALL_MS || 1500),
    retryCount: Number(process.env.ADMIN_RPC_FALLBACK_RETRY_COUNT || 1),
    retryDelay: Number(process.env.ADMIN_RPC_FALLBACK_RETRY_DELAY_MS || 250),
  } as const;
};

/**
 * Get preferred RPC provider
 * @returns 'alchemy' or 'infura' based on configuration
 */
export const getPreferredProvider = (): 'alchemy' | 'infura' => {
  const pref = (process.env.NEXT_PUBLIC_PRIMARY_RPC || 'alchemy').toLowerCase();
  return pref === 'infura' ? 'infura' : 'alchemy';
};

/**
 * Resolve prioritized RPC URLs for a given chain
 * @param chainId The chain ID to resolve URLs for
 * @returns Object containing URLs and host information
 */
export const resolveRpcUrls = (chainId: number): RpcUrlsResult => {
  const urls: string[] = [];

  // Shared API keys (client-safe)
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const infuraKey = process.env.NEXT_PUBLIC_INFURA_API_KEY;
  const preferred = getPreferredProvider();

  if (chainId === base.id) {
    // Base Mainnet: Alchemy -> Infura -> Base public
    const alchemyUrl = alchemyKey
      ? `${(process.env.NEXT_PUBLIC_BASE_MAINNET_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/")}${alchemyKey}`
      : undefined;
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
    const alchemyUrl = alchemyKey
      ? `${(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/")}${alchemyKey}`
      : undefined;
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

  // De-duplicate while preserving order
  const deduped: string[] = [];
  for (const u of urls) {
    if (u && !deduped.includes(u)) deduped.push(u);
  }
  
  // As a final safety, if no URLs were computed, use the currently resolved rpcUrl
  if (deduped.length === 0) {
    const { rpcUrl } = resolveChain();
    deduped.push(rpcUrl);
  }

  const hosts = deduped.map((u) => {
    try { 
      return new URL(u).host; 
    } catch { 
      return '[unparseable]'; 
    }
  });
  
  return { urls: deduped, hosts };
};
