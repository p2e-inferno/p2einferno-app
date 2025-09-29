/**
 * Core blockchain configuration module
 * Exports all core configuration functionality
 */

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
} from './types';

// Environment validation
export {
  validateEnvironment,
  validatePrivateKey,
  validateRpcUrl,
  validateUsdcConfiguration,
} from './validation';

// Chain resolution
export {
  createAlchemyRpcUrl,
  resolveChain,
  getRpcFallbackSettings,
  getPreferredProvider,
  resolveRpcUrls,
} from './chain-resolution';

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
} from './settings';
