/**
 * Deploy Lock Utilities
 *
 * Configuration helpers and constants for multi-network lock deployment verification.
 * Supports Base, Optimism, Arbitrum, Celo, and Base Sepolia.
 */

/**
 * Supported networks for lock deployment quests
 */
export const SUPPORTED_DEPLOY_NETWORKS = {
  BASE_MAINNET: { chainId: 8453, name: "Base Mainnet" },
  BASE_SEPOLIA: { chainId: 84532, name: "Base Sepolia" },
  OPTIMISM: { chainId: 10, name: "Optimism" },
  ARBITRUM: { chainId: 42161, name: "Arbitrum One" },
  CELO: { chainId: 42220, name: "Celo" },
} as const;

/**
 * Official Unlock Protocol factory addresses per network
 * These addresses emit the NewLock event when locks are deployed
 * Using deterministic deployment, same address across all chains
 */
export const UNLOCK_FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  8453: "0x1FF7e338d5E582138C46044dc238543Ce555C963", // Base Mainnet
  84532: "0x1FF7e338d5E582138C46044dc238543Ce555C963", // Base Sepolia
  10: "0x1FF7e338d5E582138C46044dc238543Ce555C963", // Optimism
  42161: "0x1FF7e338d5E582138C46044dc238543Ce555C963", // Arbitrum One
  42220: "0x1FF7e338d5E582138C46044dc238543Ce555C963", // Celo
};

/**
 * Configuration schema for deploy_lock task type
 * Stored in quest_tasks.task_config JSONB column
 */
export interface DeployLockTaskConfig {
  /**
   * Allowed networks with their reward multipliers
   * Admin can select 1-6 networks
   */
  allowed_networks: {
    /** Chain ID (8453, 84532, 10, 42161, 42220) */
    chain_id: number;
    /** Reward multiplier (0.1 - 2.0, typically 0.4 - 1.2) */
    reward_ratio: number;
    /** Whether this network is currently enabled */
    enabled: boolean;
  }[];
  /** Optional: Reject deployments before this Unix timestamp */
  min_timestamp?: number;
  /** Future: Require keyPrice == 0 (free locks) */
  require_free_lock?: boolean;
  /** Future: Require tokenAddress != address(0) (ERC20 locks) */
  require_erc20?: boolean;
}

/**
 * Get human-readable network name from chain ID
 * @param chainId Chain ID (8453, 84532, 10, 42161, 42220)
 * @returns Network display name or "Chain {chainId}" if unknown
 */
export function getNetworkDisplayName(chainId: number): string {
  const network = Object.values(SUPPORTED_DEPLOY_NETWORKS).find(
    (n) => n.chainId === chainId
  );
  return network?.name || `Chain ${chainId}`;
}

/**
 * Check if chain ID is a supported deploy network
 * @param chainId Chain ID to validate
 * @returns True if supported, false otherwise
 */
export function isValidDeployNetwork(chainId: number): boolean {
  return Object.values(SUPPORTED_DEPLOY_NETWORKS).some(
    (n) => n.chainId === chainId
  );
}

/**
 * Calculate final reward amount based on network multiplier
 * @param baseReward Base reward amount from quest_tasks.reward_amount
 * @param chainId Network where lock was deployed
 * @param config Task configuration with reward ratios
 * @returns Final reward amount (floor of base * multiplier)
 *
 * @example
 * // Base reward: 2500 DG, Optimism multiplier: 1.2
 * calculateRewardAmount(2500, 10, config) // => 3000
 */
export function calculateRewardAmount(
  baseReward: number,
  chainId: number,
  config: DeployLockTaskConfig
): number {
  const networkConfig = config.allowed_networks.find(
    (n) => n.chain_id === chainId
  );
  const multiplier = networkConfig?.reward_ratio || 1.0;
  return Math.floor(baseReward * multiplier);
}

/**
 * Validate task configuration structure
 * @param config Task configuration to validate
 * @returns Validation result with success flag and error message
 */
export function validateDeployLockConfig(
  config: unknown
): { success: boolean; error?: string } {
  if (!config || typeof config !== "object") {
    return { success: false, error: "Task configuration missing" };
  }

  const c = config as Partial<DeployLockTaskConfig>;

  if (!Array.isArray(c.allowed_networks) || c.allowed_networks.length === 0) {
    return { success: false, error: "No networks configured" };
  }

  if (c.allowed_networks.length > 6) {
    return {
      success: false,
      error: "Maximum 6 networks allowed",
    };
  }

  const enabledNetworks = c.allowed_networks.filter((n) => n.enabled);
  if (enabledNetworks.length === 0) {
    return { success: false, error: "No enabled networks" };
  }

  const validChainIds = [8453, 84532, 10, 42161, 42220];
  for (const net of c.allowed_networks) {
    if (
      !net ||
      typeof net !== "object" ||
      typeof net.chain_id !== "number" ||
      typeof net.reward_ratio !== "number" ||
      typeof net.enabled !== "boolean"
    ) {
      return {
        success: false,
        error: "Invalid network configuration structure",
      };
    }

    if (!validChainIds.includes(net.chain_id)) {
      return {
        success: false,
        error: `Invalid chain ID: ${net.chain_id}. Supported: ${validChainIds.join(", ")}`,
      };
    }

    if (net.reward_ratio <= 0 || net.reward_ratio > 2.0) {
      return {
        success: false,
        error: `Invalid reward ratio for chain ${net.chain_id}: ${net.reward_ratio}. Must be > 0 and <= 2.0`,
      };
    }
  }

  // Check for duplicate chain IDs
  const chainIds = c.allowed_networks.map((n) => n.chain_id);
  const uniqueChainIds = new Set(chainIds);
  if (chainIds.length !== uniqueChainIds.size) {
    return {
      success: false,
      error: "Duplicate chain IDs found in configuration",
    };
  }

  // Validate min_timestamp if present
  if (c.min_timestamp !== undefined) {
    if (
      typeof c.min_timestamp !== "number" ||
      c.min_timestamp < 0 ||
      !Number.isFinite(c.min_timestamp)
    ) {
      return {
        success: false,
        error: "Invalid min_timestamp: must be a positive number (Unix timestamp)",
      };
    }
  }

  return { success: true };
}

/**
 * Error code mapping for user-friendly messages
 */
export const ERROR_MESSAGES: Record<string, string> = {
  TX_HASH_REQUIRED: "Please enter a transaction hash",
  INVALID_TX_HASH:
    "Invalid transaction hash format. Must be 0x followed by 64 hex characters.",
  TX_NOT_FOUND: "Transaction not found. Please verify the transaction hash and try again.",
  TX_NOT_FOUND_MULTI_NETWORK:
    "Transaction not found on any allowed network. Did you deploy to the correct network?",
  TX_FAILED:
    "This transaction failed on-chain. Please submit a successful deployment.",
  SENDER_MISMATCH: "This transaction was not sent from your connected wallet.",
  TX_TOO_OLD:
    "This deployment occurred before the quest started. Please deploy a new lock.",
  LOCK_ADDRESS_NOT_FOUND:
    "Could not find lock deployment in this transaction. Is this an Unlock Protocol lock deployment?",
  INVALID_FACTORY:
    "This transaction is not from an official Unlock Protocol factory. Please deploy using the official Unlock dashboard.",
  MULTI_NETWORK_CONFLICT:
    "This transaction exists on multiple networks. Please submit a transaction that exists on only one network.",
  TX_ALREADY_USED: "This transaction has already been used for a quest task.",
  INVALID_CONFIG: "Quest configuration error. Please contact support.",
  VERIFICATION_ERROR: "Verification failed. Please try again or contact support.",
};

/**
 * Get user-friendly error message from error code
 * @param code Error code returned from verification
 * @returns User-friendly error message
 */
export function getErrorMessage(code: string): string {
  return (
    ERROR_MESSAGES[code] ?? ERROR_MESSAGES.VERIFICATION_ERROR ?? "Verification failed"
  );
}
