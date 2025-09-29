/**
 * Configuration settings and constants
 * Centralized configuration values and defaults
 */

/**
 * Default timeout settings for RPC operations
 */
export const DEFAULT_TIMEOUTS = {
  RPC_TIMEOUT_MS: 10000,
  RPC_FALLBACK_STALL_MS: 1500,
  RPC_FALLBACK_RETRY_COUNT: 1,
  RPC_FALLBACK_RETRY_DELAY_MS: 250,
} as const;

/**
 * Supported RPC providers
 */
export const RPC_PROVIDERS = {
  ALCHEMY: 'alchemy',
  INFURA: 'infura',
  PUBLIC: 'public',
} as const;

/**
 * Supported blockchain networks
 */
export const SUPPORTED_NETWORKS = {
  BASE_MAINNET: 'base',
  BASE_SEPOLIA: 'base-sepolia',
  ETHEREUM_MAINNET: 'mainnet',
} as const;

/**
 * Default network (Base Sepolia for safety)
 */
export const DEFAULT_NETWORK = SUPPORTED_NETWORKS.BASE_SEPOLIA;

/**
 * RPC URL templates for different providers
 */
export const RPC_URL_TEMPLATES = {
  ALCHEMY: {
    BASE_MAINNET: 'https://base-mainnet.g.alchemy.com/v2/',
    BASE_SEPOLIA: 'https://base-sepolia.g.alchemy.com/v2/',
    ETHEREUM_MAINNET: 'https://eth-mainnet.g.alchemy.com/v2/',
  },
  INFURA: {
    BASE_MAINNET: 'https://base-mainnet.infura.io/v3/',
    BASE_SEPOLIA: 'https://base-sepolia.infura.io/v3/',
    ETHEREUM_MAINNET: 'https://mainnet.infura.io/v3/',
  },
  PUBLIC: {
    BASE_MAINNET: 'https://mainnet.base.org',
    BASE_SEPOLIA: 'https://sepolia.base.org',
    ETHEREUM_MAINNET: 'https://cloudflare-eth.com',
  },
} as const;

/**
 * Environment variable names
 */
export const ENV_VARS = {
  LOCK_MANAGER_PRIVATE_KEY: 'LOCK_MANAGER_PRIVATE_KEY',
  BLOCKCHAIN_NETWORK: 'NEXT_PUBLIC_BLOCKCHAIN_NETWORK',
  PRIMARY_RPC: 'NEXT_PUBLIC_PRIMARY_RPC',
  ALCHEMY_API_KEY: 'NEXT_PUBLIC_ALCHEMY_API_KEY',
  INFURA_API_KEY: 'NEXT_PUBLIC_INFURA_API_KEY',
  BASE_MAINNET_RPC_URL: 'NEXT_PUBLIC_BASE_MAINNET_RPC_URL',
  BASE_SEPOLIA_RPC_URL: 'NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL',
  INFURA_BASE_MAINNET_RPC_URL: 'NEXT_PUBLIC_INFURA_BASE_MAINNET_RPC_URL',
  INFURA_BASE_SEPOLIA_RPC_URL: 'NEXT_PUBLIC_INFURA_BASE_SEPOLIA_RPC_URL',
  USDC_ADDRESS_BASE_MAINNET: 'NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET',
  USDC_ADDRESS_BASE_SEPOLIA: 'NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA',
  USDC_ADDRESS_ETHEREUM_MAINNET: 'NEXT_PUBLIC_USDC_ADDRESS_ETHEREUM_MAINNET',
  RPC_TIMEOUT_MS: 'ADMIN_RPC_TIMEOUT_MS',
  RPC_FALLBACK_STALL_MS: 'ADMIN_RPC_FALLBACK_STALL_MS',
  RPC_FALLBACK_RETRY_COUNT: 'ADMIN_RPC_FALLBACK_RETRY_COUNT',
  RPC_FALLBACK_RETRY_DELAY_MS: 'ADMIN_RPC_FALLBACK_RETRY_DELAY_MS',
} as const;

/**
 * Chain IDs for supported networks
 */
export const CHAIN_IDS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
  ETHEREUM_MAINNET: 1,
} as const;

/**
 * Network names for display
 */
export const NETWORK_NAMES = {
  BASE_MAINNET: 'Base Mainnet',
  BASE_SEPOLIA: 'Base Sepolia',
  ETHEREUM_MAINNET: 'Ethereum Mainnet',
} as const;
