/**
 * Authentication Error Handler
 * Purpose: Unified error handling for authentication operations
 * Runtime: Server-side only
 */

/**
 * Standardized authentication error codes
 */
export enum AuthErrorCode {
  // Configuration errors
  CONFIG_MISSING = 'AUTH_CONFIG_MISSING',
  CONFIG_INVALID = 'AUTH_CONFIG_INVALID',
  
  // JWT errors
  JWT_VERIFICATION_FAILED = 'AUTH_JWT_VERIFICATION_FAILED',
  JWT_TOKEN_MISSING = 'AUTH_JWT_TOKEN_MISSING',
  JWT_TOKEN_INVALID = 'AUTH_JWT_TOKEN_INVALID',
  
  // Privy API errors
  PRIVY_API_UNAVAILABLE = 'AUTH_PRIVY_API_UNAVAILABLE',
  PRIVY_USER_NOT_FOUND = 'AUTH_PRIVY_USER_NOT_FOUND',
  PRIVY_NETWORK_ERROR = 'AUTH_PRIVY_NETWORK_ERROR',
  
  // Admin authentication errors
  ADMIN_NO_WALLETS = 'AUTH_ADMIN_NO_WALLETS',
  ADMIN_LOCK_NOT_CONFIGURED = 'AUTH_ADMIN_LOCK_NOT_CONFIGURED',
  ADMIN_KEY_CHECK_FAILED = 'AUTH_ADMIN_KEY_CHECK_FAILED',
  ADMIN_ACCESS_DENIED = 'AUTH_ADMIN_ACCESS_DENIED',
  
  // Blockchain errors
  BLOCKCHAIN_RPC_ERROR = 'AUTH_BLOCKCHAIN_RPC_ERROR',
  BLOCKCHAIN_CONTRACT_ERROR = 'AUTH_BLOCKCHAIN_CONTRACT_ERROR',
  BLOCKCHAIN_NETWORK_ERROR = 'AUTH_BLOCKCHAIN_NETWORK_ERROR',
  
  // Generic errors
  UNKNOWN_ERROR = 'AUTH_UNKNOWN_ERROR',
  SYSTEM_ERROR = 'AUTH_SYSTEM_ERROR'
}

/**
 * Authentication error with context and structured logging
 */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly context: Record<string, any>;
  public readonly timestamp: string;
  public readonly operation: string;

  constructor(
    message: string,
    code: AuthErrorCode,
    operation: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.operation = operation;
  }

  /**
   * Get structured error data for logging
   */
  toLogData() {
    return {
      error: {
        name: this.name,
        message: this.message,
        code: this.code,
        operation: this.operation,
        timestamp: this.timestamp,
        context: this.context,
        stack: this.stack
      }
    };
  }

  /**
   * Get client-safe error response (no sensitive data)
   */
  toClientResponse() {
    return {
      error: this.message,
      code: this.code,
      timestamp: this.timestamp
    };
  }
}

/**
 * Detect if an error is network-related
 */
export const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code;
  
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('enotfound') ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ETIMEOUT' ||
    errorCode === 'UND_ERR_CONNECT_TIMEOUT'
  );
};

/**
 * Detect if an error is Privy API related
 */
export const isPrivyApiError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  
  return (
    errorMessage.includes('privy') ||
    errorMessage.includes('method') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    (error.status >= 400 && error.status < 500)
  );
};

/**
 * Handle authentication errors with appropriate logging and classification
 */
export const handleAuthError = (
  error: unknown,
  operation: string,
  context: Record<string, any> = {}
): AuthError => {
  // If already an AuthError, just log and return
  if (error instanceof AuthError) {
    console.error(`[AUTH_ERROR] ${operation}:`, error.toLogData());
    return error;
  }

  const baseError = error instanceof Error ? error : new Error(String(error));
  let authError: AuthError;

  // Classify error and create appropriate AuthError
  if (isNetworkError(baseError)) {
    if (isPrivyApiError(baseError)) {
      authError = new AuthError(
        'Privy API service temporarily unavailable',
        AuthErrorCode.PRIVY_NETWORK_ERROR,
        operation,
        { originalError: baseError.message, ...context }
      );
    } else {
      authError = new AuthError(
        'Network connectivity issue during authentication',
        AuthErrorCode.BLOCKCHAIN_NETWORK_ERROR,
        operation,
        { originalError: baseError.message, ...context }
      );
    }
  } else if (isPrivyApiError(baseError)) {
    authError = new AuthError(
      'Privy API authentication failed',
      AuthErrorCode.PRIVY_API_UNAVAILABLE,
      operation,
      { originalError: baseError.message, ...context }
    );
  } else if (baseError.message?.includes('blockchain') || baseError.message?.includes('contract')) {
    authError = new AuthError(
      'Blockchain authentication operation failed',
      AuthErrorCode.BLOCKCHAIN_CONTRACT_ERROR,
      operation,
      { originalError: baseError.message, ...context }
    );
  } else {
    authError = new AuthError(
      baseError.message || 'Unknown authentication error',
      AuthErrorCode.UNKNOWN_ERROR,
      operation,
      { originalError: baseError.message, ...context }
    );
  }

  // Log the structured error
  console.error(`[AUTH_ERROR] ${operation}:`, authError.toLogData());

  return authError;
};

/**
 * Handle JWT verification errors specifically
 */
export const handleJwtError = (
  error: unknown,
  context: Record<string, any> = {}
): AuthError => {
  const baseError = error instanceof Error ? error : new Error(String(error));
  
  if (baseError.message?.includes('JWTExpired')) {
    return new AuthError(
      'Authentication token has expired',
      AuthErrorCode.JWT_TOKEN_INVALID,
      'jwt_verification',
      { reason: 'expired', ...context }
    );
  } else if (baseError.message?.includes('JWTInvalid')) {
    return new AuthError(
      'Authentication token is invalid',
      AuthErrorCode.JWT_TOKEN_INVALID,
      'jwt_verification',
      { reason: 'invalid_format', ...context }
    );
  } else {
    return handleAuthError(error, 'jwt_verification', context);
  }
};

/**
 * Handle admin authentication errors specifically
 */
export const handleAdminAuthError = (
  error: unknown,
  operation: 'wallet_check' | 'lock_validation' | 'key_verification',
  context: Record<string, any> = {}
): AuthError => {
  const baseError = error instanceof Error ? error : new Error(String(error));
  
  if (operation === 'wallet_check') {
    return new AuthError(
      'Failed to validate admin wallet permissions',
      AuthErrorCode.ADMIN_KEY_CHECK_FAILED,
      'admin_auth',
      { operation, originalError: baseError.message, ...context }
    );
  } else if (operation === 'lock_validation') {
    return new AuthError(
      'Admin lock contract validation failed',
      AuthErrorCode.ADMIN_LOCK_NOT_CONFIGURED,
      'admin_auth',
      { operation, originalError: baseError.message, ...context }
    );
  } else {
    return handleAuthError(error, `admin_${operation}`, context);
  }
};

/**
 * Safe error logging that doesn't expose sensitive information
 */
export const logSafeError = (error: AuthError, userId?: string): void => {
  const safeContext = { ...error.context };
  
  // Remove potentially sensitive data
  delete safeContext.token;
  delete safeContext.privateKey;
  delete safeContext.secret;
  delete safeContext.password;
  
  console.error(`[AUTH_ERROR_SAFE] ${error.operation}:`, {
    code: error.code,
    message: error.message,
    operation: error.operation,
    timestamp: error.timestamp,
    userId: userId || 'unknown',
    context: safeContext
  });
};

/**
 * Create HTTP error response from AuthError
 */
export const createErrorResponse = (error: AuthError) => {
  // Map error codes to HTTP status codes
  const statusCodeMap: Record<AuthErrorCode, number> = {
    [AuthErrorCode.CONFIG_MISSING]: 500,
    [AuthErrorCode.CONFIG_INVALID]: 500,
    [AuthErrorCode.JWT_VERIFICATION_FAILED]: 401,
    [AuthErrorCode.JWT_TOKEN_MISSING]: 401,
    [AuthErrorCode.JWT_TOKEN_INVALID]: 401,
    [AuthErrorCode.PRIVY_API_UNAVAILABLE]: 503,
    [AuthErrorCode.PRIVY_USER_NOT_FOUND]: 401,
    [AuthErrorCode.PRIVY_NETWORK_ERROR]: 503,
    [AuthErrorCode.ADMIN_NO_WALLETS]: 403,
    [AuthErrorCode.ADMIN_LOCK_NOT_CONFIGURED]: 500,
    [AuthErrorCode.ADMIN_KEY_CHECK_FAILED]: 403,
    [AuthErrorCode.ADMIN_ACCESS_DENIED]: 403,
    [AuthErrorCode.BLOCKCHAIN_RPC_ERROR]: 503,
    [AuthErrorCode.BLOCKCHAIN_CONTRACT_ERROR]: 503,
    [AuthErrorCode.BLOCKCHAIN_NETWORK_ERROR]: 503,
    [AuthErrorCode.UNKNOWN_ERROR]: 500,
    [AuthErrorCode.SYSTEM_ERROR]: 500
  };

  const statusCode = statusCodeMap[error.code] || 500;
  
  return {
    statusCode,
    body: error.toClientResponse()
  };
};