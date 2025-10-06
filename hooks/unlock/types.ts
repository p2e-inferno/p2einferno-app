import type { Address } from "viem";

export interface UnlockHookOptions {
  enabled?: boolean;
}

export interface KeyInfo {
  tokenId: bigint;
  owner: Address;
  expirationTimestamp: bigint;
  isValid: boolean;
}

export interface LockInfo {
  tokenAddress: Address;
  keyPrice: bigint;
  isValid: boolean;
}

// ============================================================================
// WRITE OPERATION TYPES
// ============================================================================

// Key Purchase Types
export interface KeyPurchaseParams {
  lockAddress: Address;
  recipient?: Address; // defaults to connected wallet
  keyManager?: Address;
  referrer?: Address;
  data?: `0x${string}`;
}

export interface KeyPurchaseResult {
  success: boolean;
  transactionHash?: string;
  tokenIds?: bigint[];
  error?: string;
}

// Lock Deployment Types (User Deployment)
export interface LockDeploymentParams {
  name: string;
  expirationDuration: bigint;
  tokenAddress: Address; // Use Address(0) for ETH
  keyPrice: bigint;
  maxNumberOfKeys: bigint;
  lockVersion?: number; // defaults to latest
}

export interface LockDeploymentResult {
  success: boolean;
  transactionHash?: string;
  lockAddress?: Address;
  error?: string;
}

// Admin Lock Deployment Types (Factory Pattern with Server Manager)
export interface AdminLockDeploymentParams {
  name: string;
  expirationDuration: bigint;
  tokenAddress: Address; // Use Address(0) for ETH
  keyPrice: bigint;
  maxNumberOfKeys: bigint;
  lockVersion?: number; // defaults to latest
  isAdmin: boolean; // Must be true to proceed
}

export interface AdminLockDeploymentResult {
  success: boolean;
  transactionHash?: string;
  grantTransactionHash?: string;
  lockAddress?: Address;
  serverWalletAddress?: string; // Server wallet added as manager
  error?: string;
  grantFailed?: boolean; // True if lock deployed but grant manager failed
  grantError?: string; // Error message from grant manager failure
}

// Key Grant Types
export interface KeyGrantParams {
  lockAddress: Address;
  recipientAddress: Address;
  keyManagers: Address[];
  expirationDuration?: bigint;
}

export interface KeyGrantResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

// Shared Operation State
export interface OperationState {
  isLoading: boolean;
  error: string | null;
  isSuccess: boolean;
}
