/**
 * Admin Authentication Context Status Utilities
 * 
 * Pure utility functions for deriving authentication status and managing cache.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import type { AdminAuthStatus } from '../types/AdminAuthContextTypes';

/**
 * Derive unified auth status from multiple auth states
 */
export const deriveAuthStatus = (
  privyAuthenticated: boolean,
  privyReady: boolean,
  walletAddress: string | null,
  isAdmin: boolean,
  authLoading: boolean,
  hasValidSession: boolean,
  sessionLoading: boolean
): AdminAuthStatus => {
  // Loading states take priority
  if (!privyReady || authLoading) {
    return 'loading';
  }

  // Check Privy authentication
  if (!privyAuthenticated) {
    return 'privy_required';
  }

  // Check wallet connection
  if (!walletAddress) {
    return 'wallet_required';
  }

  // Check blockchain admin access
  if (!isAdmin) {
    return 'blockchain_denied';
  }

  // Check session (if session loading, consider it required)
  if (sessionLoading) {
    return 'loading';
  }

  if (!hasValidSession) {
    return 'session_required';
  }

  // Fully authenticated
  return 'authenticated';
};

/**
 * Type guard to check if auth status indicates full authentication
 */
export const isFullyAuthenticated = (authStatus: AdminAuthStatus): boolean => {
  return authStatus === 'authenticated';
};

/**
 * Type guard to check if auth status indicates loading state
 */
export const isAuthLoading = (authStatus: AdminAuthStatus): boolean => {
  return authStatus === 'loading';
};

/**
 * Get user-friendly message for auth status
 */
export const getAuthStatusMessage = (authStatus: AdminAuthStatus): string => {
  switch (authStatus) {
    case 'loading':
      return 'Checking authentication...';
    case 'privy_required':
      return 'Please connect your wallet to continue';
    case 'wallet_required':
      return 'Please connect a wallet to access admin features';
    case 'blockchain_denied':
      return 'Your wallet does not have admin access';
    case 'session_required':
      return 'Please create an admin session to continue';
    case 'authenticated':
      return 'Authenticated with admin access';
    default:
      return 'Unknown authentication status';
  }
};
