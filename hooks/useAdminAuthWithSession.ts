import { useMemo } from "react";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useAdminAuthWithSession");

/**
 * Enhanced admin authentication that combines blockchain access with session validation
 * Ensures users have BOTH admin keys AND valid admin session
 */
export const useAdminAuthWithSession = () => {
  const {
    authStatus,
    authenticated,
    user,
    isAdmin,
    isLoadingAuth,
    isLoadingSession,
    hasValidSession,
    sessionExpiry,
    createAdminSession,
    refreshSession,
    clearSession,
    refreshAdminStatus,
    lastAuthCheck,
  } = useAdminAuthContext();

  const computed = useMemo(() => {
    const needsPrivyAuth =
      authStatus === "privy_required" ||
      authStatus === "wallet_required" ||
      !authenticated ||
      !user;

    const needsBlockchainAuth = authStatus === "blockchain_denied" && !needsPrivyAuth;
    const needsSessionAuth = authStatus === "session_required" && !needsPrivyAuth;
    const isFullyAuthenticated = authStatus === "authenticated";

    const authStep = needsPrivyAuth
      ? ("privy_login" as const)
      : needsBlockchainAuth
        ? ("blockchain_access" as const)
        : needsSessionAuth
          ? ("admin_session" as const)
          : ("authenticated" as const);

    const isLoading =
      authStatus === "loading" ||
      isLoadingAuth ||
      (needsSessionAuth && isLoadingSession);

    return {
      authStep,
      isFullyAuthenticated,
      needsPrivyAuth,
      needsBlockchainAuth,
      needsSessionAuth,
      isLoading,
      needsSessionRefresh: needsSessionAuth,
    };
  }, [
    authStatus,
    authenticated,
    user,
    isLoadingAuth,
    isLoadingSession,
  ]);

  log.debug("Admin auth state (context)", {
    authStatus,
    authStep: computed.authStep,
    isFullyAuthenticated: computed.isFullyAuthenticated,
    needsSessionRefresh: computed.needsSessionRefresh,
    isAdmin,
    hasValidSession,
  });

  return {
    ...computed,
    isAdmin,
    authenticated,
    user,
    refreshAdminStatus,
    lastRefreshTime: lastAuthCheck,
    hasValidSession,
    sessionExpiry,
    createAdminSession,
    refreshSession,
    clearSession,
  };
};
