/**
 * Admin Authentication Context State Hook
 *
 * Manages all internal state for the AdminAuthContext.
 * Extracted from AdminAuthContext.tsx for better organization and reusability.
 */

import { useState, useRef, useCallback } from "react";
import {
  AUTH_CACHE_DURATION,
  ERROR_RETRY_DELAY,
} from "../constants/AdminAuthContextConstants";

/**
 * Hook for managing AdminAuthContext internal state
 *
 * @returns Object containing all state values and setters
 */
export const useAdminAuthContextState = () => {
  // ============ INTERNAL STATE ============
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [lastAuthCheck, setLastAuthCheck] = useState(0);
  const [cacheValidUntil, setCacheValidUntil] = useState(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [lastErrorTime, setLastErrorTime] = useState(0);

  // ============ REFS ============
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  // ============ ERROR HANDLING ============
  const clearErrors = useCallback(() => {
    setAuthError(null);
    setNetworkError(false);
    setErrorCount(0);
    setLastErrorTime(0);
  }, []);

  const recordError = useCallback((error: string, type: "auth" | "network") => {
    setAuthError(type === "auth" ? error : null);
    setNetworkError(type === "network");
    setLastErrorTime(Date.now());
    setErrorCount((prev) => prev + 1);
  }, []);

  return {
    // State values
    isAdmin,
    authLoading,
    lastAuthCheck,
    cacheValidUntil,
    authError,
    networkError,
    errorCount,
    lastErrorTime,

    // State setters
    setIsAdmin,
    setAuthLoading,
    setLastAuthCheck,
    setCacheValidUntil,
    setAuthError,
    setNetworkError,
    setErrorCount,
    setLastErrorTime,

    // Refs
    inFlightRef,
    mountedRef,

    // Error handling methods
    clearErrors,
    recordError,

    // Constants
    AUTH_CACHE_DURATION,
    ERROR_RETRY_DELAY,
  };
};
