import { type Address } from "viem";
import { CLIENT_CHAIN_CONFIG } from "./client-config";
import { getAdminLockManagerAddresses } from "./transaction-helpers";
import type { Cohort, BootcampProgram, Quest, CohortMilestone } from "../supabase/types";

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
  UNLIMITED: 0, // 0 means unlimited in Unlock Protocol
  ONE_YEAR: 365 * 24 * 60 * 60, // 365 days in seconds
} as const;

// ============================================================================
// LOCK CONFIGURATION GENERATORS
// ============================================================================

/**
 * Generate lock configuration for cohort access
 * - Unlimited expiration (lifetime membership)
 * - USDC pricing from cohort naira_amount/usdt_amount
 */
export const generateCohortLockConfig = (cohort: Cohort): LockConfig => {
  // Use USDT amount if available, otherwise convert from Naira (rough estimate)
  const priceInUSD = cohort.usdt_amount || (cohort.naira_amount ? cohort.naira_amount / 1600 : 0);
  
  return {
    name: `${cohort.name} Access`,
    symbol: "COHORT",
    keyPrice: priceInUSD.toString(),
    maxNumberOfKeys: cohort.max_participants,
    expirationDuration: EXPIRATION_DURATIONS.UNLIMITED,
    currency: "USDC",
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
 */
export const generateBootcampLockConfig = (bootcamp: BootcampProgram): LockConfig => {
  return {
    name: `${bootcamp.name} Certificate`,
    symbol: "BOOTCAMP",
    keyPrice: "0", // Free certification
    maxNumberOfKeys: 10000, // High limit for certificates
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // One certificate per address
    transferable: true, // Certificates can be transferred
    requiresApproval: false,
  };
};

/**
 * Generate lock configuration for quest completion badge
 * - 1 year expiration
 * - Free completion badge
 */
export const generateQuestLockConfig = (quest: Quest): LockConfig => {
  return {
    name: `${quest.title} Badge`,
    symbol: "QUEST",
    keyPrice: "0", // Free badge
    maxNumberOfKeys: 50000, // High limit for badges
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // One badge per address
    transferable: true, // Badges can be transferred
    requiresApproval: false,
  };
};

/**
 * Generate lock configuration for milestone completion NFT badge
 * - 1 year expiration
 * - Free completion badge based on total reward amount
 */
export const generateMilestoneLockConfig = (milestone: CohortMilestone, totalReward: number = 0): LockConfig => {
  return {
    name: `${milestone.name} NFT Badge`,
    symbol: "MILESTONE",
    keyPrice: "0", // Free badge - rewards distributed manually
    maxNumberOfKeys: 10000, // High limit for milestone badges
    expirationDuration: EXPIRATION_DURATIONS.ONE_YEAR,
    currency: "FREE",
    price: 0,
    maxKeysPerAddress: 1, // One badge per address per milestone
    transferable: true, // Milestone badges can be transferred
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
    
    if (chainId === 8453) { // Base Mainnet
      usdcAddress = process.env.USDC_ADDRESS_BASE_MAINNET;
    } else if (chainId === 84532) { // Base Sepolia
      usdcAddress = process.env.USDC_ADDRESS_BASE_SEPOLIA;
    }
    
    if (!usdcAddress) {
      console.warn("USDC token address not configured for current network, using ETH");
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