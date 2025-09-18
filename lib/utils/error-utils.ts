import { getLogger } from './logger';

const log = getLogger('utils:error-utils');

export function toMessage(err: unknown, fallback = "Something went wrong") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || fallback;
  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}

export function isNetworkErrorMessage(message: string) {
  const msg = (message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("connection") ||
    msg.includes("unreachable") ||
    msg.includes("request aborted")
  );
}

export function normalizeHttpError(status: number, body?: any) {
  const details = body?.error || body?.message;
  if (status === 401) return details || "Authentication required";
  if (status === 403) return details || "Access forbidden";
  if (status === 404) return details || "Not found";
  if (status >= 500) return details || "Server error";
  return details || `HTTP ${status}`;
}

/**
 * Normalize admin API errors with context-aware messaging
 * Extends base HTTP error handling with admin-specific error types
 */
export function normalizeAdminApiError(status: number, body?: any, _context?: string) {
  const details = body?.error || body?.message;

  // Admin-specific error codes
  if (status === 428) {
    return details || "Active wallet connection required";
  }

  // Enhanced error messages with context
  if (status === 401) {
    if (details?.includes("session")) {
      return "Admin session expired. Please refresh the page.";
    }
    return details || "Admin authentication required";
  }

  if (status === 403) {
    if (details?.includes("wallet")) {
      return "Connected wallet does not have admin access";
    }
    if (details?.includes("key")) {
      return "Admin access key verification failed";
    }
    return details || "Admin access required";
  }

  // Validation errors (400) - always show the actual API message
  if (status === 400) {
    return details || "Invalid request data";
  }

  // Rate limiting
  if (status === 429) {
    return details || "Too many requests. Please wait and try again.";
  }

  // Fallback to base HTTP error handling
  return normalizeHttpError(status, body);
}

/**
 * Enhanced error context for admin operations
 */
export interface AdminApiErrorContext {
  operation: string;
  url: string;
  method: string;
  attempt: 'original' | 'retry';
  walletAddress?: string;
}

/**
 * Log admin API errors with structured context
 */
export function logAdminApiError(
  status: number,
  body: any,
  context: AdminApiErrorContext,
  originalError?: Error
) {
  const errorDetails = {
    status,
    message: body?.error || body?.message,
    context,
    originalError: originalError?.message,
    timestamp: new Date().toISOString()
  };

  // Use different log levels based on error type
  if (status >= 500) {
    log.error('Server error:', errorDetails);
  } else if (status === 401 || status === 403) {
    log.warn('Auth error:', errorDetails);
  } else if (status === 400) {
    log.info('Validation error:', errorDetails);
  } else {
    log.warn('Client error:', errorDetails);
  }
}

