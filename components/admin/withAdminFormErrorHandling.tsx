import React, { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminApi } from "@/hooks/useAdminApi";
import { AuthError } from "@/components/ui/auth-error";
import { hasValidPrivyToken } from "@/lib/api";

/**
 * Higher-order component that adds authentication error handling to admin forms
 *
 * @param Component The component to wrap
 * @returns A wrapped component with authentication error handling
 */
export function withAdminFormErrorHandling<P extends object>(
  Component: React.ComponentType<P>
) {
  return function WithAdminFormErrorHandling(props: P) {
    const [error, setError] = useState<string | null>(null);
    const { isAdmin, authenticated } = useAdminAuth();
    const adminApi = useAdminApi({
      redirectOnAuthError: false,
      showAuthErrorModal: true,
    });

    // Only check authentication status, not admin status (which is determined server-side)
    useEffect(() => {
      // Only check on client side
      if (typeof window === "undefined") return;

      // If we're not authenticated or don't have a valid token, set an error
      if (!authenticated) {
        setError("Authentication required. Please log in to continue.");
      } else if (!hasValidPrivyToken()) {
        setError("Your session has expired. Please log in again.");
      } else {
        setError(null);
      }
    }, [authenticated]);

    // Also listen for errors from the adminApi hook
    useEffect(() => {
      if (adminApi.error) {
        setError(adminApi.error);
      }
    }, [adminApi.error]);

    return (
      <>
        <AuthError
          error={error}
          onClear={() => setError(null)}
          className="mb-6"
        />
        <Component {...props} />
      </>
    );
  };
}
