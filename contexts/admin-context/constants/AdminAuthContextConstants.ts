/**
 * Admin Authentication Context Constants
 * 
 * Centralized configuration constants for the AdminAuthContext system.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

/**
 * Cache duration for authentication checks in milliseconds
 * Default: 2 minutes (120000ms)
 */
export const AUTH_CACHE_DURATION = parseInt(
  process.env.NEXT_PUBLIC_AUTH_CACHE_DURATION || '120000'
); // 2 minutes default

/**
 * Delay between error retry attempts in milliseconds
 * Default: 5 seconds (5000ms)
 */
export const ERROR_RETRY_DELAY = parseInt(
  process.env.NEXT_PUBLIC_ERROR_RETRY_DELAY || '5000'
); // 5 seconds default

/**
 * Maximum number of consecutive errors before considering system unhealthy
 */
export const MAX_ERROR_COUNT = 5;

/**
 * Maximum backoff delay for exponential backoff in milliseconds
 */
export const MAX_BACKOFF_DELAY = 60000; // 1 minute
