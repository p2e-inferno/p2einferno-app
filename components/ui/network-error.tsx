import React from "react";
import { RefreshCw, AlertTriangle, Wifi, WifiOff } from "lucide-react";

interface NetworkErrorProps {
  error: string | null;
  onRetry?: () => void;
  onClear?: () => void;
  className?: string;
  isRetrying?: boolean;
  showIcon?: boolean;
}

/**
 * A reusable component for displaying network/fetch errors
 * with retry functionality and graceful degradation
 */
export function NetworkError({
  error,
  onRetry,
  onClear,
  className = "",
  isRetrying = false,
  showIcon = true,
}: NetworkErrorProps) {
  if (!error) return null;

  const isNetworkError =
    error.toLowerCase().includes("failed to fetch") ||
    error.toLowerCase().includes("network") ||
    error.toLowerCase().includes("timeout") ||
    error.toLowerCase().includes("connection") ||
    error.toLowerCase().includes("unreachable");

  const isTimeoutError =
    error.toLowerCase().includes("timeout") ||
    error.toLowerCase().includes("aborted due to timeout");

  const getErrorIcon = () => {
    if (isNetworkError) {
      return isTimeoutError ? (
        <WifiOff className="w-5 h-5" />
      ) : (
        <Wifi className="w-5 h-5" />
      );
    }
    return <AlertTriangle className="w-5 h-5" />;
  };

  const getErrorTitle = () => {
    if (isNetworkError) {
      return isTimeoutError ? "Connection Timeout" : "Network Connection Issue";
    }
    return "Something went wrong";
  };

  const getErrorMessage = () => {
    if (isNetworkError) {
      if (isTimeoutError) {
        return "The request took too long to complete. This might be due to a slow or intermittent network connection.";
      }
      return "Unable to connect to our servers. Please check your internet connection.";
    }
    return error;
  };

  const handleRetry = () => {
    if (onRetry && !isRetrying) {
      onRetry();
    }
  };

  return (
    <div
      className={`bg-steel-red/10 border border-steel-red/20 rounded-lg p-6 ${className}`}
    >
      <div className="flex items-start space-x-4">
        {showIcon && (
          <div className="flex-shrink-0 text-steel-red mt-1">
            {getErrorIcon()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-steel-red mb-2">
            {getErrorTitle()}
          </h3>

          <p className="text-faded-grey text-sm mb-4">{getErrorMessage()}</p>

          <div className="flex items-center gap-3">
            {onRetry && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-2 bg-flame-yellow hover:bg-flame-yellow/90 disabled:bg-flame-yellow/50 text-black font-medium py-2 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
                />
                {isRetrying ? "Retrying..." : "Try Again"}
              </button>
            )}

            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="text-faded-grey hover:text-white text-sm transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>

        {onClear && (
          <button
            onClick={onClear}
            className="flex-shrink-0 text-faded-grey hover:text-white ml-2"
            aria-label="Dismiss"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
