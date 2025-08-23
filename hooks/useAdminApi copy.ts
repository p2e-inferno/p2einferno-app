import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";

interface UseAdminApiOptions {
  redirectOnAuthError?: boolean;
  redirectPath?: string;
  showAuthErrorModal?: boolean;
  verifyTokenBeforeRequest?: boolean; // NEW: Add token verification option
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
}

export function useAdminApi<T = any>(options: UseAdminApiOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenVerified, setTokenVerified] = useState<boolean | null>(null);
  const router = useRouter();
  const { getAccessToken, authenticated } = usePrivy();

  // NEW: Token verification function
  const verifyToken = useCallback(async (): Promise<boolean> => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        return false;
      }

      const response = await fetch("/api/verify", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      setTokenVerified(true);
      return true;
    } catch (error) {
      setTokenVerified(false);
      return false;
    }
  }, [getAccessToken]);

  const adminFetch = useCallback(
    async <U = T>(
      url: string,
      requestOptions: RequestInit = {}
    ): Promise<ApiResponse<U>> => {
      setLoading(true);
      setError(null);

      try {
        // NEW: Verify token before making request if option is enabled
        if (options.verifyTokenBeforeRequest) {
          const isTokenValid = await verifyToken();
          if (!isTokenValid) {
            const errorMessage = "Token verification failed";
            setError(errorMessage);
            
            if (options.redirectOnAuthError) {
              router.push(options.redirectPath || "/admin/login");
            } else {
              toast.error(errorMessage);
            }
            
            return { error: errorMessage };
          }
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
    loading,
    error,
    authenticated,
    tokenVerified, // NEW: Expose token verification status
    verifyToken,   // NEW: Expose manual verification function
  };
}
