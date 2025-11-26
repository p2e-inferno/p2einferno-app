import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:error-handler');

/**
 * Custom error class for GoodDollar operations
 */
export class GoodDollarError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'GoodDollarError';
  }
}

/**
 * Standard GoodDollar error codes and messages
 */
export const GoodDollarErrors = {
  SDK_NOT_INITIALIZED: {
    code: 'SDK_NOT_INITIALIZED',
    message: 'GoodDollar SDK failed to initialize',
  },
  INVALID_ADDRESS: {
    code: 'INVALID_ADDRESS',
    message: 'Invalid Ethereum address format',
  },
  VERIFICATION_FAILED: {
    code: 'VERIFICATION_FAILED',
    message: 'Face verification failed',
  },
  NOT_WHITELISTED: {
    code: 'NOT_WHITELISTED',
    message: 'Address is not whitelisted on-chain',
  },
  VERIFICATION_EXPIRED: {
    code: 'VERIFICATION_EXPIRED',
    message: 'Verification has expired and needs re-verification',
  },
  ADDRESS_MISMATCH: {
    code: 'ADDRESS_MISMATCH',
    message: 'Callback address does not match connected wallet',
  },
  UNAUTHENTICATED: {
    code: 'UNAUTHENTICATED',
    message: 'User is not authenticated',
  },
  CALLBACK_URL_MISMATCH: {
    code: 'CALLBACK_URL_MISMATCH',
    message: 'Callback URL is not whitelisted in GoodDollar portal',
  },
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    message: 'Network error during verification',
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Failed to update verification status in database',
  },
};

/**
 * Handle GoodDollar errors with consistent logging
 *
 * @param error - The error to handle
 * @returns GoodDollarError instance
 */
export function handleGoodDollarError(error: any): GoodDollarError {
  if (error instanceof GoodDollarError) {
    log.error(`${error.code}: ${error.message}`, { details: error.details });
    return error;
  }

  if (error instanceof Error) {
    log.error(`GoodDollar error: ${error.message}`, {
      stack: error.stack,
    });
  } else {
    log.error('Unknown GoodDollar error', { error });
  }

  return new GoodDollarError(
    'UNKNOWN_ERROR',
    'An unknown error occurred with GoodDollar SDK',
    error,
  );
}

/**
 * Validate Ethereum address format
 *
 * @param address - Address to validate
 * @returns true if valid, false otherwise
 */
export function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate and normalize Ethereum address
 *
 * @param address - Address to normalize
 * @returns Normalized address (lowercase)
 * @throws GoodDollarError if invalid
 */
export function validateAndNormalizeAddress(address: string): `0x${string}` {
  if (!isValidEthereumAddress(address)) {
    throw new GoodDollarError(
      GoodDollarErrors.INVALID_ADDRESS.code,
      GoodDollarErrors.INVALID_ADDRESS.message,
      { providedAddress: address },
    );
  }
  return address.toLowerCase() as `0x${string}`;
}
