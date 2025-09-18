import React from "react";
import { useAdminAuthWithSession } from "@/hooks/useAdminAuthWithSession";
import AdminAccessRequired from "./AdminAccessRequired";
import AdminSessionRequired from "./AdminSessionRequired";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:AdminSessionGate");

interface AdminSessionGateProps {
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  requiresSession?: boolean; // Allow disabling session requirement for testing
}

/**
 * AdminSessionGate enforces both blockchain admin access AND valid admin session
 * This provides enhanced security by requiring fresh authentication for admin operations
 */
export default function AdminSessionGate({
  children,
  loadingComponent,
  requiresSession = true,
}: AdminSessionGateProps) {
  const {
    authStep,
    isFullyAuthenticated,
    isLoading,
    needsPrivyAuth,
    needsBlockchainAuth,
    needsSessionAuth,
    createAdminSession,
    sessionExpiry,
    user,
    authenticated,
  } = useAdminAuthWithSession();

  log.debug("AdminSessionGate render", {
    authStep,
    isFullyAuthenticated,
    isLoading,
    requiresSession,
  });

  // Show loading spinner while checking authentication
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }

    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-gray-400">Checking admin access...</p>
      </div>
    );
  }

  // Step 1: Require Privy authentication
  if (needsPrivyAuth || !authenticated || !user) {
    log.debug("Showing AdminAccessRequired - no Privy auth");
    return (
      <AdminAccessRequired message="Please connect your wallet to access admin features" />
    );
  }

  // Step 2: Require blockchain admin access (admin key ownership)
  if (needsBlockchainAuth) {
    log.debug("Showing AdminAccessRequired - no blockchain access");
    return (
      <AdminAccessRequired message="You need admin access to view this page" />
    );
  }

  // Step 3: Require valid admin session (if enabled)
  if (requiresSession && needsSessionAuth) {
    log.debug("Showing AdminSessionRequired - no valid session");
    return (
      <AdminSessionRequired
        onCreateSession={createAdminSession}
        sessionExpiry={sessionExpiry}
        message="A fresh admin session is required for enhanced security"
      />
    );
  }

  // All requirements met - render protected content
  if (requiresSession && !isFullyAuthenticated) {
    log.warn("Unexpected state: session required but not fully authenticated", {
      authStep,
      isFullyAuthenticated,
    });

    return (
      <AdminSessionRequired
        onCreateSession={createAdminSession}
        sessionExpiry={sessionExpiry}
        message="Authentication verification required"
      />
    );
  }

  // If session not required, just check blockchain access
  if (!requiresSession && needsBlockchainAuth) {
    return (
      <AdminAccessRequired message="You need admin access to view this page" />
    );
  }

  log.debug("Rendering protected admin content");
  return <>{children}</>;
}
