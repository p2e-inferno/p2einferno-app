import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "./useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useAdminSession");

interface AdminSessionState {
  hasValidSession: boolean;
  isCheckingSession: boolean;
  sessionExpiry: number | null;
  lastChecked: number;
  sessionError: string | null;
}

/**
 * Hook for managing admin session state
 * Checks for valid admin-session cookie and provides session creation
 */
export const useAdminSession = () => {
  const { getAccessToken } = usePrivy();
  const selectedWallet = useSmartWalletSelection() as any;
  const [sessionState, setSessionState] = useState<AdminSessionState>({
    hasValidSession: false,
    isCheckingSession: true,
    sessionExpiry: null,
    lastChecked: 0,
    sessionError: null,
  });

  const checkInProgress = useRef(false);

  /**
   * Check if current admin session is valid
   */
  const checkSession = useCallback(
    async (forceCheck = false): Promise<boolean> => {
      const now = Date.now();

      // Throttle checks to avoid rapid requests (unless forced)
      if (!forceCheck && checkInProgress.current) {
        return sessionState.hasValidSession;
      }

      // Don't check too frequently (unless forced)
      if (!forceCheck && now - sessionState.lastChecked < 30000) {
        // 30 seconds
        return sessionState.hasValidSession;
      }

      checkInProgress.current = true;
      setSessionState((prev) => ({ ...prev, isCheckingSession: true }));

      try {
        log.debug("Checking admin session validity");

        const response = await fetch("/api/admin/session/verify", {
          method: "GET",
          credentials: "include", // Include cookies
        });

        if (response.ok) {
          const data = await response.json();
          const isValid = data.valid === true;

          setSessionState({
            hasValidSession: isValid,
            isCheckingSession: false,
            sessionExpiry: data.expiresAt || null,
            lastChecked: now,
            sessionError: null,
          });

          log.debug("Session check completed", {
            valid: isValid,
            expiry: data.expiresAt,
          });

          return isValid;
        } else {
          // Session invalid or expired
          const errorData = await response.json().catch(() => ({}));
          const errorMessage =
            errorData.error ||
            `Session verification failed with status ${response.status}`;

          setSessionState({
            hasValidSession: false,
            isCheckingSession: false,
            sessionExpiry: null,
            lastChecked: now,
            sessionError: errorMessage,
          });

          log.debug("Session check failed", {
            status: response.status,
            error: errorMessage,
          });
          return false;
        }
      } catch (error: any) {
        log.error("Error checking session:", error);
        setSessionState({
          hasValidSession: false,
          isCheckingSession: false,
          sessionExpiry: null,
          lastChecked: now,
          sessionError: error?.message || "Session verification error",
        });
        return false;
      } finally {
        checkInProgress.current = false;
      }
    },
    [sessionState.hasValidSession, sessionState.lastChecked],
  );

  /**
   * Create a new admin session
   */
  const createAdminSession = useCallback(async (): Promise<boolean> => {
    try {
      log.info("Creating new admin session");
      setSessionState((prev) => ({
        ...prev,
        isCheckingSession: true,
        sessionError: null,
      }));

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("No access token available");
      }

      // Try primary session endpoint first
      let response = await fetch("/api/admin/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Active-Wallet": selectedWallet?.address || "",
        },
        credentials: "include",
      });

      // Fallback to session-fallback if primary fails
      if (!response.ok) {
        log.debug("Primary session endpoint failed, trying fallback");
        response = await fetch("/api/admin/session-fallback", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Active-Wallet": selectedWallet?.address || "",
          },
          credentials: "include",
        });
      }

      if (response.ok) {
        log.info("Admin session created successfully");

        // Immediately verify the new session
        const isValid = await checkSession(true);
        return isValid;
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          `Session creation failed with status ${response.status}`;
        log.error("Failed to create admin session", {
          status: response.status,
          error: errorMessage,
        });

        setSessionState((prev) => ({
          ...prev,
          isCheckingSession: false,
          sessionError: errorMessage,
        }));
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      log.error("Error creating admin session:", error);
      setSessionState((prev) => ({
        ...prev,
        isCheckingSession: false,
        sessionError: error?.message || "Unable to create admin session",
      }));
      throw error;
    }
  }, [getAccessToken, selectedWallet?.address, checkSession]);

  /**
   * Force refresh session status
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    return await checkSession(true);
  }, [checkSession]);

  /**
   * Clear session state (e.g., on logout)
   */
  const clearSession = useCallback(() => {
    log.debug("Clearing admin session state");
    setSessionState({
      hasValidSession: false,
      isCheckingSession: false,
      sessionExpiry: null,
      lastChecked: 0,
      sessionError: null,
    });
  }, []);

  // Initial session check on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return {
    hasValidSession: sessionState.hasValidSession,
    isCheckingSession: sessionState.isCheckingSession,
    sessionExpiry: sessionState.sessionExpiry,
    sessionError: sessionState.sessionError,
    checkSession,
    createAdminSession,
    refreshSession,
    clearSession,
  };
};
