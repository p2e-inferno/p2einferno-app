import React from "react";
import { usePrivy } from "@privy-io/react-auth";

interface AuthErrorProps {
  error: string | null;
  onClear?: () => void;
  className?: string;
}

/**
 * A reusable component for displaying authentication errors
 * with a login button for re-authentication
 */
export function AuthError({ error, onClear, className = "" }: AuthErrorProps) {
  const { login } = usePrivy();

  if (!error) return null;

  const isAuthError =
    error.toLowerCase().includes("authentication") ||
    error.toLowerCase().includes("log in") ||
    error.toLowerCase().includes("session");

  const handleLogin = () => {
    login();
    if (onClear) onClear();
  };

  return (
    <div
      className={`bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded flex flex-col gap-2 ${className}`}
    >
      <div className="flex justify-between items-start">
        <p>{error}</p>
        {onClear && (
          <button
            onClick={onClear}
            className="text-red-400 hover:text-red-300 ml-2"
            aria-label="Dismiss"
          >
            &times;
          </button>
        )}
      </div>

      {isAuthError && (
        <button
          type="button"
          onClick={handleLogin}
          className="text-sm bg-red-900/30 hover:bg-red-900/50 text-red-200 py-1 px-3 rounded self-start transition-colors"
        >
          Log in again
        </button>
      )}
    </div>
  );
}
