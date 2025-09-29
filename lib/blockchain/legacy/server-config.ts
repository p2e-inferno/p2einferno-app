/**
 * Server-side blockchain configuration
 * Uses unified configuration system
 */

import { type WalletClient, type PublicClient } from "viem";
import { 
  UNIFIED_BLOCKCHAIN_CONFIG,
  createPublicClientUnified,
  createWalletClientUnified,
  createAccountUnified,
  isServerBlockchainConfigured as isConfigured
} from "../config";

// ============================================================================
// SERVER-SIDE BLOCKCHAIN CLIENTS
// ============================================================================

/**
 * Create public client for reading from blockchain (server-side)
 */
export const createServerPublicClient = (): PublicClient => {
  return createPublicClientUnified();
};

/**
 * Create wallet client for writing to blockchain (server-side)
 * Returns null if private key is not configured
 */
export const createServerWalletClient = (): WalletClient | null => {
  return createWalletClientUnified();
};

// ============================================================================
// SERVER-SIDE UTILITIES
// ============================================================================

/**
 * Get the lock manager account address (server-side only)
 * Returns null if private key is not configured
 */
export const getLockManagerAddress = (): string | null => {
  const account = createAccountUnified();
  return account?.address || null;
};

/**
 * Check if server-side blockchain operations are properly configured
 */
export const isServerBlockchainConfigured = (): boolean => {
  return isConfigured();
};

// ============================================================================
// BACKWARDS COMPATIBILITY
// ============================================================================

// Legacy exports for gradual migration
export const SERVER_CHAIN_CONFIG = UNIFIED_BLOCKCHAIN_CONFIG;
export const SERVER_CHAIN_ID = UNIFIED_BLOCKCHAIN_CONFIG.chain.id;