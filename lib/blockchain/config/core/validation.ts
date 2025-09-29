/**
 * Environment validation for blockchain configuration
 * Secure validation without exposing sensitive details
 */

import { blockchainLogger } from "../../shared/logging-utils";
import type { EnvironmentValidation } from "./types";

/**
 * Secure environment validation without exposing sensitive details
 * Validates private key format and configuration
 */
export const validateEnvironment = (): EnvironmentValidation => {
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

/**
 * Validate private key format
 * @param key The private key to validate
 * @returns True if valid, false otherwise
 */
export const validatePrivateKey = (key: string): boolean => {
  if (!key) return false;
  return key.startsWith("0x") && key.length === 66;
};

/**
 * Validate RPC URL format
 * @param url The RPC URL to validate
 * @returns True if valid, false otherwise
 */
export const validateRpcUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if USDC token addresses are configured
 * @returns Object with configuration status for each network
 */
export const validateUsdcConfiguration = () => {
  const hasMainnetUsdc = !!process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_MAINNET;
  const hasSepoliaUsdc = !!process.env.NEXT_PUBLIC_USDC_ADDRESS_BASE_SEPOLIA;
  const hasEthereumUsdc = !!process.env.NEXT_PUBLIC_USDC_ADDRESS_ETHEREUM_MAINNET;
  
  if (!hasMainnetUsdc && !hasSepoliaUsdc && !hasEthereumUsdc) {
    blockchainLogger.warn("USDC token addresses not configured - payments may be limited", {
      operation: 'config:usdc'
    });
  }

  return {
    hasMainnetUsdc,
    hasSepoliaUsdc,
    hasEthereumUsdc,
    isConfigured: hasMainnetUsdc || hasSepoliaUsdc || hasEthereumUsdc
  };
};
