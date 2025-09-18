import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { useVerifyToken } from "./useVerifyToken";
import { useSmartWalletSelection } from "./useSmartWalletSelection";
import { normalizeAdminApiError, logAdminApiError, type AdminApiErrorContext } from "@/lib/utils/error-utils";

interface UseAdminApiOptions {
  redirectOnAuthError?: boolean;
  redirectPath?: string;
  showAuthErrorModal?: boolean;
  verifyTokenBeforeRequest?: boolean;
  suppressToasts?: boolean;
  autoSessionRefresh?: boolean;
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
  const { verifyToken, loading: tokenVerifying } = useVerifyToken();
  const selectedWallet = useSmartWalletSelection() as any;

  const adminFetch = useCallback(
    async <U = T>(
      url: string,
      requestOptions: RequestInit = {}
    ): Promise<ApiResponse<U>> => {
      setLoading(true);
      setError(null);

      try {
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
            "X-Active-Wallet": selectedWallet?.address || "",
            ...requestOptions.headers,
          },
          credentials: 'include', // Ensure cookies are sent
        });


        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Create error context for logging
          const errorContext: AdminApiErrorContext = {
            operation: `${requestOptions.method || 'GET'} ${url}`,
            url,
            method: requestOptions.method || 'GET',
            attempt: 'original',
            walletAddress: selectedWallet?.address
          };

          // If unauthorized and auto refresh enabled, attempt session issuance then retry once
          if (response.status === 401 && options.autoSessionRefresh !== false) {
            try {
              // Prefer Route Handler; fallback to Pages API session-fallback
              let sessionResp = await fetch('/api/admin/session', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Active-Wallet': selectedWallet?.address || '' },
                credentials: 'include',
              });

              if (!sessionResp.ok) {
                sessionResp = await fetch('/api/admin/session-fallback', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Active-Wallet': selectedWallet?.address || '' },
                  credentials: 'include',
                });
              }

              if (sessionResp.ok) {
                const retry = await fetch(url, {
                  ...requestOptions,
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                    "X-Active-Wallet": selectedWallet?.address || "",
                    ...requestOptions.headers,
                  },
                  credentials: 'include',
                });

                if (retry.ok) {
                  const data = await retry.json();
                  return { data } as any;
                }

                // Handle retry failure with separate error context
                const retryErrorData = await retry.json().catch(() => ({}));
                const retryErrorContext: AdminApiErrorContext = {
                  ...errorContext,
                  attempt: 'retry'
                };

                logAdminApiError(retry.status, retryErrorData, retryErrorContext);
                const retryErrorMessage = normalizeAdminApiError(retry.status, retryErrorData, 'admin_api_retry');
                setError(retryErrorMessage);
                if (!options.suppressToasts) toast.error(retryErrorMessage);
                return { error: retryErrorMessage };
              }
            } catch (retryError: any) {
              // Log retry attempt failure but continue to handle original error
              logAdminApiError(0, { error: retryError.message }, { ...errorContext, attempt: 'retry' }, retryError);
            }
          }

          // Log the original error
          logAdminApiError(response.status, errorData, errorContext);

          // Use centralized error normalization
          const errorMessage = normalizeAdminApiError(response.status, errorData, 'admin_api');
          setError(errorMessage);

          // Handle redirects for authentication errors
          if (response.status === 401 && options.redirectOnAuthError) {
            router.push(options.redirectPath || "/admin/login");
          } else {
            if (!options.suppressToasts) toast.error(errorMessage);
          }

          return { error: errorMessage };
        }

        const data = await response.json();
        return { data };
      } catch (err: any) {
        // Create error context for network errors
        const networkErrorContext: AdminApiErrorContext = {
          operation: `${requestOptions.method || 'GET'} ${url}`,
          url,
          method: requestOptions.method || 'GET',
          attempt: 'original',
          walletAddress: selectedWallet?.address
        };

        // Log network error
        logAdminApiError(0, { error: err.message }, networkErrorContext, err);

        // Use network-aware error message
        const errorMessage = err.message?.includes('fetch') || err.message?.includes('network')
          ? "Network error. Please check your connection and try again."
          : err.message || "Network error";

        setError(errorMessage);
        if (!options.suppressToasts) toast.error(errorMessage);
        return { error: errorMessage };
      } finally {
        setLoading(false);
      }
    },
    [getAccessToken, router, options, verifyToken, selectedWallet?.address]
  );

  return {
    adminFetch,
    loading: loading || tokenVerifying,
    error,
    authenticated,
    verifyToken,
  };
}
