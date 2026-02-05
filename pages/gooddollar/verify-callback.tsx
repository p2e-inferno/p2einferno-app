import { useEffect, useCallback } from "react";
import { useRouter } from "next/router";

// Constants
const RETURN_URL_KEY = "gooddollar:returnUrl";
const DEFAULT_RETURN_URL = "/lobby";
const LOADING_MESSAGE = "Processing verification...";
const DEFAULT_SUCCESS_MESSAGE = "Gooddollar verification completed";
const DEFAULT_ERROR_MESSAGE =
  "Gooddollar verification failed. Please try again.";

// Extract pure functions for better testability
const getStorageValue = (key: string, fallback: string): string => {
  try {
    return window.sessionStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const clearStorageKey = (key: string): void => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Silent fail
  }
};

/**
 * Client-facing handler for GoodDollar verification callbacks.
 * - Reads query params from the provider
 * - Posts them to the API callback for validation/DB update
 * - Redirects the user back to the previous page (or lobby) with a status message
 */
export default function GoodDollarVerifyCallbackPage() {
  const router = useRouter();

  const redirectWithStatus = useCallback(
    (status: "success" | "error", message: string) => {
      const returnUrl = getStorageValue(RETURN_URL_KEY, DEFAULT_RETURN_URL);
      const target = new URL(returnUrl, window.location.origin);
      target.searchParams.set("verification", status);
      target.searchParams.set("message", message);
      clearStorageKey(RETURN_URL_KEY);
      router.replace(target.pathname + target.search);
    },
    [router],
  );

  useEffect(() => {
    if (!router.isReady) return;

    const processCallback = async () => {
      try {
        const params = Object.fromEntries(
          new URLSearchParams(window.location.search),
        );

        const response = await fetch("/api/gooddollar/verify-callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        const data = await response.json();
        redirectWithStatus(
          data.success ? "success" : "error",
          data.message ||
            (data.success ? DEFAULT_SUCCESS_MESSAGE : DEFAULT_ERROR_MESSAGE),
        );
      } catch {
        redirectWithStatus("error", DEFAULT_ERROR_MESSAGE);
      }
    };

    processCallback();
  }, [router, redirectWithStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">{LOADING_MESSAGE}</p>
        <p className="text-sm text-faded-grey">
          Hang tight while we confirm your verification status.
        </p>
      </div>
    </div>
  );
}
