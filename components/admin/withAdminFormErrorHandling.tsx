import React, { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { AuthError } from "@/components/ui/auth-error";

/**
 * Higher-order component that adds authentication error handling to admin forms
 *
 * @param Component The component to wrap
 * @returns A wrapped component with authentication error handling
 */
export function withAdminFormErrorHandling<P extends object>(
  Component: React.ComponentType<P>,
) {
  return function WithAdminFormErrorHandling(props: P) {
    const [error, setError] = useState<string | null>(null);
    const { authenticated, getAccessToken } = usePrivy();

    // Check authentication status using unified auth system
    useEffect(() => {
      // Only check on client side
      if (typeof window === "undefined") return;

      const checkAuth = async () => {
        if (!authenticated) {
          setError("Authentication required. Please log in to continue.");
          return;
        }

        try {
          const token = await getAccessToken();
          if (!token) {
            setError("Your session has expired. Please log in again.");
          } else {
            setError(null);
          }
        } catch (err) {
          setError("Authentication error. Please log in again.");
        }
      };

      checkAuth();
    }, [authenticated, getAccessToken]);

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
