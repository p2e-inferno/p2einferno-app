/**
 * Admin Authentication Context Cache Utilities
 *
 * Pure utility functions for cache management and validation.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import { ERROR_RETRY_DELAY } from "../constants/AdminAuthContextConstants";

/**
 * Check if auth cache is still valid
 */
export const isCacheValid = (cacheValidUntil: number): boolean => {
  return Date.now() < cacheValidUntil;
};

/**
 * Create cache expiry timestamp
 */
export const createCacheExpiry = (durationMs: number): number => {
  return Date.now() + durationMs;
};

/**
 * Determine if cache should be invalidated based on error state and timing
 */
export const shouldInvalidateCache = (
  cacheValidUntil: number,
  errorCount: number,
  lastErrorTime: number,
): boolean => {
  const now = Date.now();

  // Always invalidate if cache expired
  if (now >= cacheValidUntil) return true;

  // Invalidate if recent errors (exponential backoff)
  if (errorCount > 0 && lastErrorTime > 0) {
    const timeSinceError = now - lastErrorTime;
    const backoffDelay = Math.min(
      ERROR_RETRY_DELAY * Math.pow(2, errorCount - 1),
      60000,
    );
    return timeSinceError >= backoffDelay;
  }

  return false;
};
