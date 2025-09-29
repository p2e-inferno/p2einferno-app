/**
 * Core types and interfaces for blockchain configuration
 */

import type { WalletClient, PublicClient } from "viem";
import type { base, baseSepolia, mainnet } from "viem/chains";

/**
 * Main blockchain configuration interface
 * Provides all necessary configuration for blockchain operations
 */
export interface BlockchainConfig {
  chain: typeof base | typeof baseSepolia | typeof mainnet;
  rpcUrl: string;
  networkName: string;
  usdcTokenAddress?: string;
  hasPrivateKey: boolean;
  createPublicClient: () => PublicClient;
  createWalletClient: () => WalletClient | null;
}

/**
 * Environment validation result
 * Contains validation status and private key if valid
 */
export interface EnvironmentValidation {
  privateKey: `0x${string}` | null;
  hasValidKey: boolean;
}

/**
 * Chain-specific configuration
 * Contains chain details and network-specific settings
 */
export interface ChainConfig {
  chain: typeof base | typeof baseSepolia | typeof mainnet;
  rpcUrl: string;
  usdcTokenAddress?: string;
  networkName: string;
}

/**
 * RPC fallback configuration settings
 * Controls timeout and retry behavior for RPC operations
 */
export interface RpcFallbackSettings {
  timeoutMs: number;
  stallMs: number;
  retryCount: number;
  retryDelay: number;
}

/**
 * RPC URLs resolution result
 * Contains resolved URLs and their host information
 */
export interface RpcUrlsResult {
  urls: string[];
  hosts: string[];
}

/**
 * Transport configuration for sequential HTTP transport
 */
export interface SequentialTransportConfig {
  urls: string[];
  timeoutMs: number;
  retryDelayMs: number;
  batch?: boolean | { wait?: number; batchSize?: number };
}

/**
 * Browser transport configuration
 */
export interface BrowserTransportConfig {
  timeoutMs: number;
  retryDelay: number;
}

/**
 * Client configuration (browser-safe)
 * Excludes sensitive information like private keys
 */
export interface ClientConfig {
  chain: typeof base | typeof baseSepolia | typeof mainnet;
  rpcUrl: string;
  networkName: string;
  chainId: number;
}
