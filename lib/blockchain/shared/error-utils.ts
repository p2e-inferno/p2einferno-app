import { getLogger } from '@/lib/utils/logger';

const log = getLogger('blockchain:shared:error-utils');

/**
 * Unified error handling system for blockchain operations
 * Provides consistent error classification and user-friendly messages
 */

// ============================================================================
// TYPES
// ============================================================================

export interface BlockchainError {
  type: BlockchainErrorType;
  message: string;
  originalError?: Error;
  userMessage: string;
}

export enum BlockchainErrorType {
  USER_REJECTED = 'USER_REJECTED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  WALLET_ERROR = 'WALLET_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN = 'UNKNOWN'
}

// ============================================================================
// ERROR CLASSIFICATION
// ============================================================================

/**
 * Classify blockchain errors based on error message patterns
 */
export const classifyBlockchainError = (error: any): BlockchainError => {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  const lowerMessage = errorMessage.toLowerCase();

  // User rejection patterns
  if (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('transaction was cancelled')
  ) {
    return {
      type: BlockchainErrorType.USER_REJECTED,
      message: errorMessage,
      originalError: error,
      userMessage: 'Transaction was cancelled. Please try again when ready.'
    };
  }

  // Insufficient funds patterns
  if (
    lowerMessage.includes('insufficient funds') ||
    lowerMessage.includes('insufficient balance') ||
    lowerMessage.includes('not enough') ||
    lowerMessage.includes('insufficient allowance')
  ) {
    const isERC20Issue = lowerMessage.includes('allowance');
    return {
      type: BlockchainErrorType.INSUFFICIENT_FUNDS,
      message: errorMessage,
      originalError: error,
      userMessage: isERC20Issue 
        ? 'Please approve the token spending first. The approval transaction will be requested before payment.'
        : 'Insufficient funds to complete the transaction. Please add more crypto to your wallet.'
    };
  }

  // Network/RPC errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('rpc') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('timeout')
  ) {
    return {
      type: BlockchainErrorType.NETWORK_ERROR,
      message: errorMessage,
      originalError: error,
      userMessage: 'Network connection issue. Please check your internet connection and try again.'
    };
  }

  // Contract-specific errors
  if (
    lowerMessage.includes('revert') ||
    lowerMessage.includes('execution reverted') ||
    lowerMessage.includes('lock manager') ||
    lowerMessage.includes('not authorized')
  ) {
    return {
      type: BlockchainErrorType.CONTRACT_ERROR,
      message: errorMessage,
      originalError: error,
      userMessage: errorMessage // Use original message for contract errors as they're usually informative
    };
  }

  // Wallet connection errors
  if (
    lowerMessage.includes('wallet') ||
    lowerMessage.includes('not connected') ||
    lowerMessage.includes('provider')
  ) {
    return {
      type: BlockchainErrorType.WALLET_ERROR,
      message: errorMessage,
      originalError: error,
      userMessage: 'Wallet connection issue. Please ensure your wallet is properly connected.'
    };
  }

  // Configuration errors
  if (
    lowerMessage.includes('private key') ||
    lowerMessage.includes('not configured') ||
    lowerMessage.includes('write operations disabled')
  ) {
    return {
      type: BlockchainErrorType.CONFIGURATION_ERROR,
      message: errorMessage,
      originalError: error,
      userMessage: 'Service configuration issue. Please contact support if this persists.'
    };
  }

  // Default case
  return {
    type: BlockchainErrorType.UNKNOWN,
    message: errorMessage,
    originalError: error,
    userMessage: errorMessage || 'An unexpected error occurred. Please try again.'
  };
};

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface BlockchainOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: BlockchainError;
  transactionHash?: string;
}

/**
 * Create a successful blockchain operation result
 */
export const createSuccessResult = <T>(
  data?: T, 
  transactionHash?: string
): BlockchainOperationResult<T> => ({
  success: true,
  data,
  transactionHash
});

/**
 * Create a failed blockchain operation result from an error
 */
export const createErrorResult = (error: any): BlockchainOperationResult => ({
  success: false,
  error: classifyBlockchainError(error)
});

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Safe error handler for blockchain operations
 * Provides consistent error logging and classification
 */
export const handleBlockchainError = (
  operation: string,
  error: any,
  context?: Record<string, any>
): BlockchainError => {
  const classifiedError = classifyBlockchainError(error);
  
  // Log error with context for debugging
  log.error(`Blockchain operation failed: ${operation}`, {
    errorType: classifiedError.type,
    errorMessage: classifiedError.message,
    context,
    originalError: classifiedError.originalError
  });

  return classifiedError;
};

/**
 * Wrapper for blockchain operations with consistent error handling
 */
export const wrapBlockchainOperation = async <T>(
  operation: string,
  fn: () => Promise<T>,
  context?: Record<string, any>
): Promise<BlockchainOperationResult<T>> => {
  try {
    const result = await fn();
    return createSuccessResult(result);
  } catch (error) {
    const blockchainError = handleBlockchainError(operation, error, context);
    return createErrorResult(blockchainError);
  }
};