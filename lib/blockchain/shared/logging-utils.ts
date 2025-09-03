/**
 * Consistent logging strategy for blockchain operations
 * Provides structured, secure logging with proper context
 */

// ============================================================================
// TYPES
// ============================================================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogContext {
  operation?: string;
  lockAddress?: string;
  userAddress?: string;
  transactionHash?: string;
  chainId?: number;
  [key: string]: any;
}

// ============================================================================
// SECURE LOGGING UTILITIES
// ============================================================================

/**
 * Sanitize addresses for logging (mask middle characters for privacy)
 */
const sanitizeAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Sanitize transaction hash for logging (show full hash as it's public)
 */
const sanitizeTransactionHash = (hash: string): string => {
  return hash; // Transaction hashes are public, no need to sanitize
};

/**
 * Sanitize log context to remove sensitive information
 */
const sanitizeContext = (context: LogContext): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      // Sanitize known address fields
      if (key.toLowerCase().includes('address')) {
        sanitized[key] = sanitizeAddress(value);
      }
      // Keep transaction hashes as-is (public information)
      else if (key.toLowerCase().includes('hash')) {
        sanitized[key] = sanitizeTransactionHash(value);
      }
      // Sanitize any private key references
      else if (key.toLowerCase().includes('private') || key.toLowerCase().includes('key')) {
        sanitized[key] = '[REDACTED]';
      }
      else {
        sanitized[key] = value;
      }
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// ============================================================================
// BLOCKCHAIN LOGGER
// ============================================================================

export class BlockchainLogger {
  private static instance: BlockchainLogger;
  private isDevelopment: boolean;
  private transport?: (level: LogLevel, message: string, context?: LogContext) => void;

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  static getInstance(): BlockchainLogger {
    if (!BlockchainLogger.instance) {
      BlockchainLogger.instance = new BlockchainLogger();
    }
    return BlockchainLogger.instance;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? sanitizeContext(context) : {};
    
    const logEntry = {
      timestamp,
      level,
      message,
      module: 'blockchain',
      ...sanitizedContext
    };

    // If an external transport is configured (bridge), delegate to it
    if (this.transport) {
      try {
        this.transport(level, message, sanitizedContext);
        return;
      } catch (e) {
        // fall through to default behavior
      }
    }

    // In development, use console methods for better formatting
    if (this.isDevelopment) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(`[BLOCKCHAIN] ${message}`, sanitizedContext);
          break;
        case LogLevel.INFO:
          console.info(`[BLOCKCHAIN] ${message}`, sanitizedContext);
          break;
        case LogLevel.WARN:
          console.warn(`[BLOCKCHAIN] ${message}`, sanitizedContext);
          break;
        case LogLevel.ERROR:
          console.error(`[BLOCKCHAIN] ${message}`, sanitizedContext);
          break;
      }
    } else {
      // In production, use structured JSON logging
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  // ============================================================================
  // BLOCKCHAIN-SPECIFIC LOGGING METHODS
  // ============================================================================

  logTransactionStart(operation: string, context: LogContext): void {
    this.info(`Starting ${operation}`, {
      ...context,
      phase: 'start'
    });
  }

  logTransactionSuccess(operation: string, transactionHash: string, context?: LogContext): void {
    this.info(`${operation} completed successfully`, {
      ...context,
      transactionHash,
      phase: 'success'
    });
  }

  logTransactionError(operation: string, error: any, context?: LogContext): void {
    this.error(`${operation} failed`, {
      ...context,
      error: error?.message || 'Unknown error',
      phase: 'error'
    });
  }

  logNetworkSwitch(fromChainId: number, toChainId: number, userAddress?: string): void {
    this.info('Network switch requested', {
      operation: 'networkSwitch',
      fromChainId,
      toChainId,
      userAddress
    });
  }

  logKeyCheck(lockAddress: string, userAddress: string, hasKey: boolean): void {
    this.debug('Key ownership check', {
      operation: 'keyCheck',
      lockAddress,
      userAddress,
      hasKey
    });
  }

  logConfigurationWarning(message: string, context?: LogContext): void {
    this.warn(`Configuration warning: ${message}`, context);
  }

  // Allow setting an external transport (e.g., app-wide logger)
  setTransport(transport: (level: LogLevel, message: string, context?: LogContext) => void) {
    this.transport = transport;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const blockchainLogger = BlockchainLogger.getInstance();

// Helper to set transport from outside without exposing instance directly
export const setBlockchainLoggerTransport = (
  transport: (level: LogLevel, message: string, context?: LogContext) => void
) => {
  BlockchainLogger.getInstance().setTransport(transport);
};
