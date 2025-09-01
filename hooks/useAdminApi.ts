import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { useVerifyToken } from "./useVerifyToken";

interface UseAdminApiOptions {
  redirectOnAuthError?: boolean;
  redirectPath?: string;
  showAuthErrorModal?: boolean;
  verifyTokenBeforeRequest?: boolean;
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

export function useAdminApi<T = any>(options: UseAdminApiOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { getAccessToken, authenticated } = usePrivy();
  
  // Use the existing useVerifyToken hook
  const { verifyToken, loading: tokenVerifying } = useVerifyToken();

  const adminFetch = useCallback(
    async <U = T>(
      url: string,
      requestOptions: RequestInit = {}
    ): Promise<ApiResponse<U>> => {
      setLoading(true);
      setError(null);

      try {
        // Use the existing verifyToken function if option is enabled
        if (options.verifyTokenBeforeRequest) {
          await verifyToken();
          // Note: useVerifyToken handles its own error state
          // We can check if verification was successful by checking the result
          // For now, we'll assume it worked if no exception was thrown
        }

        // Get fresh access token from Privy
        const accessToken = await getAccessToken();

        if (!accessToken) {
          throw new Error("No access token available");
        }

        const response = await fetch(url, {
          ...requestOptions,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            ...requestOptions.headers,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            const errorMessage = "Authentication required";
            setError(errorMessage);

            if (options.redirectOnAuthError) {
              router.push(options.redirectPath || "/admin/login");
            } else {
              toast.error(errorMessage);
            }

            return { error: errorMessage };
          }

          if (response.status === 403) {
            const errorMessage = "Admin access required";
            setError(errorMessage);
            toast.error(errorMessage);
            return { error: errorMessage };
          }

          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `HTTP ${response.status}`;
          setError(errorMessage);
          toast.error(errorMessage);
          return { error: errorMessage };
        }

        const data = await response.json();
        return { data };
      } catch (err: any) {
        const errorMessage = err.message || "Network error";
        setError(errorMessage);
        toast.error(errorMessage);
        return { error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, router, options, verifyToken]
  );

  return {
    adminFetch,
    loading: loading || tokenVerifying,
    error,
    authenticated,
    verifyToken, // Expose the verifyToken function from useVerifyToken
  };
}
