import { type Address } from "viem";
import { CLIENT_CHAIN_CONFIG } from "./client-config";
import { getAdminLockManagerAddresses } from "../services/transaction-service";
import type {
  Cohort,
  BootcampProgram,
  Quest,
  CohortMilestone,
} from "../../supabase/types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("blockchain:admin-lock-config");

// ============================================================================
// NAIRA TO USD RATE ESTIMATE CONSTANT
// ============================================================================
export const NAIRA_TO_USD_RATE = 1600;

// ============================================================================
// LOCK CONFIGURATION TYPES
// ============================================================================

export interface LockConfig {
  name: string;
  symbol: string;
  keyPrice: string;
  maxNumberOfKeys: number;
  expirationDuration: number;
  currency: string;
  price: number;
  maxKeysPerAddress?: number;
  transferable?: boolean;
  requiresApproval?: boolean;
}

// ============================================================================
// EXPIRATION DURATION CONSTANTS
// ============================================================================

const EXPIRATION_DURATIONS = {
  UNLIMITED: Number.MAX_SAFE_INTEGER, // Maximum bigint value
  ONE_YEAR: 365 * 24 * 60 * 60, // 365 days in seconds
} as const;

// ============================================================================
// LOCK CONFIGURATION GENERATORS
// ============================================================================

/**
 * Generate lock configuration for cohort access
 * - Unlimited expiration (lifetime membership)
 * - USDC pricing from cohort naira_amount/usdt_amount
 * - Free access if no price is set
 */
export const generateCohortLockConfig = (cohort: Cohort): LockConfig => {
  // Use USDT amount if available, otherwise convert from Naira (rough estimate)
  const priceInUSD =
    cohort.usdt_amount ||
    (cohort.naira_amount ? cohort.naira_amount / NAIRA_TO_USD_RATE : 0);

  // If no price is set, create a free lock
  const isFree = priceInUSD === 0;

  return {
    name: `${cohort.name} Access`,
    symbol: "COHORT",
    keyPrice: priceInUSD.toString(),
    maxNumberOfKeys: cohort.max_participants,
    expirationDuration: EXPIRATION_DURATIONS.UNLIMITED,
    currency: isFree ? "FREE" : "USDC",
    price: priceInUSD,
    maxKeysPerAddress: 1, // One cohort access per address
    transferable: false, // Non-transferable membership
    requiresApproval: false,
  };
};

/**
 * Generate lock configuration for bootcamp program certification
 * - 1 year expiration
 * - Free or paid based on program settings
 * - SECURITY: maxNumberOfKeys set to 0 to disable purchases
 *   Certificates are granted server-side only after bootcamp completion
 */
export const generateBootcampLockConfig = (
  bootcamp: BootcampProgram,
): LockConfig => {
  return {
    name: `${bootcamp.name} Certificate`,
    symbol: "BOOTCAMP",
    keyPrice: "0", // Free certification
    maxNumberOfKeys: 0, // Disable purchases (grant-based only)
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // Non-zero to avoid NULL_VALUE() revert
    transferable: false, // Non-transferable credential
    requiresApproval: false,
  };
};

/**
 * Generate lock configuration for quest completion badge
 * - 1 year expiration
 * - Free completion badge
 * - SECURITY: maxNumberOfKeys set to 0 to disable purchases
 *   Badges are granted server-side only after quest completion
 */
export const generateQuestLockConfig = (quest: Quest): LockConfig => {
  return {
    name: `${quest.title} Badge`,
    symbol: "QUEST",
    keyPrice: "0", // Free badge
    maxNumberOfKeys: 0, // Disable purchases (grant-based only)
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // Non-zero to avoid NULL_VALUE() revert
    transferable: false, // Non-transferable credential
    requiresApproval: false,
  };
};

/**
 * Generate lock configuration for milestone completion NFT badge
 * - 1 year expiration
 * - Free completion badge based on total reward amount
 * - SECURITY: maxNumberOfKeys set to 0 to disable purchases
 *   Badges are granted server-side only after milestone completion
 */
export const generateMilestoneLockConfig = (
  milestone: CohortMilestone,
  _totalReward: number = 0,
): LockConfig => {
  return {
    name: `${milestone.name} NFT Badge`,
    symbol: "MILESTONE",
    keyPrice: "0", // Free badge - rewards distributed manually
    maxNumberOfKeys: 0, // Disable purchases (grant-based only)
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // Non-zero to avoid NULL_VALUE() revert
    transferable: false, // Non-transferable credential
    requiresApproval: false, // Automatic approval for completed milestones
  };
};

// ============================================================================
// ENHANCED LOCK CONFIG WITH MANAGERS
// ============================================================================

/**
 * Create a complete lock config with admin key managers for deployment
 * This adds the key managers from environment variables to the lock config
 */
export const createLockConfigWithManagers = (baseLockConfig: LockConfig) => {
  const keyManagers = getAdminLockManagerAddresses();

  return {
    ...baseLockConfig,
    keyManagers, // Add admin addresses as key managers
  };
};

// ============================================================================
// NETWORK-SPECIFIC CONFIGURATION
// ============================================================================

/**
 * Get the appropriate token address for the current network
 * Returns USDC address for paid locks, zero address for free locks
 * Note: This needs to be called server-side to access USDC addresses
 */
export const getTokenAddressForCurrency = (currency: string): Address => {
  if (currency === "FREE") {
    return "0x0000000000000000000000000000000000000000" as Address;
  }

  if (currency === "USDC") {
    // Determine USDC address based on current network
    const chainId = CLIENT_CHAIN_CONFIG.chain.id;
    let usdcAddress: string | undefined;

    if (chainId === 8453) {
      // Base Mainnet
      usdcAddress =
        process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET ||
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    } else if (chainId === 84532) {
      // Base Sepolia
      usdcAddress =
        process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA ||
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    }

    if (!usdcAddress) {
      log.warn(
        "USDC token address not configured for current network, using ETH",
      );
      return "0x0000000000000000000000000000000000000000" as Address;
    }
    return usdcAddress as Address;
  }

  // Default to ETH for unknown currencies
  return "0x0000000000000000000000000000000000000000" as Address;
};

// ============================================================================
// DEPLOYMENT HELPER
// ============================================================================

/**
 * Prepare lock config for deployment by converting to the format expected by unlockUtils.deployLock
 */
export const prepareLockConfigForDeployment = (lockConfig: LockConfig) => {
  return {
    name: lockConfig.name,
    symbol: lockConfig.symbol,
    keyPrice: lockConfig.keyPrice,
    maxNumberOfKeys: lockConfig.maxNumberOfKeys,
    expirationDuration: lockConfig.expirationDuration,
    currency: lockConfig.currency,
    price: lockConfig.price,
    maxKeysPerAddress: lockConfig.maxKeysPerAddress,
    transferable: lockConfig.transferable,
    requiresApproval: lockConfig.requiresApproval,
  };
};
