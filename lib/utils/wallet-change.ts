import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("utils:wallet-listener");

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface WalletChangeOptions {
  handleErrors?: boolean;
  logErrors?: boolean;
  logLevel?: "debug" | "info" | "warn" | "error";
}

/**
 * Enhanced utility function to listen for wallet account changes
 * Supports async callbacks and comprehensive error handling
 * @param callback Function to call when wallet accounts change (can be async)
 * @param options Configuration options for error handling and logging
 * @returns A cleanup function to remove the listener
 */
export function listenForWalletChanges(
  callback: () => void | Promise<void>,
  options: WalletChangeOptions = {},
): () => void {
  const { handleErrors = true, logErrors = true, logLevel = "error" } = options;

  if (typeof window === "undefined" || !window.ethereum) {
    return () => {}; // Return empty cleanup function
  }

  const handleAccountsChanged = async () => {
    try {
      await callback();
    } catch (error) {
      if (handleErrors) {
        if (logErrors) {
          log[logLevel]("Wallet change callback error:", { error });
        }
        // Could emit error event or call error handler here
      }
    }
  };

  window.ethereum.on("accountsChanged", handleAccountsChanged);

  return () => {
    window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
  };
}

/**
 * Specialized utility for admin wallet changes with security focus
 * @param callback Function to call when wallet accounts change (can be async)
 * @returns A cleanup function to remove the listener
 */
export function listenForAdminWalletChanges(
  callback: () => void | Promise<void>,
): () => void {
  return listenForWalletChanges(callback, {
    handleErrors: true,
    logErrors: true,
    logLevel: "warn", // Admin changes are security-sensitive
  });
}

/**
 * Specialized utility for wallet address detection
 * @param callback Function to call with the new wallet address (can be async)
 * @returns A cleanup function to remove the listener
 */
export function listenForWalletAddressChanges(
  callback: (address: string | null) => void | Promise<void>,
): () => void {
  return listenForWalletChanges(
    async () => {
      if (typeof window !== "undefined" && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({
            method: "eth_accounts",
          });
          const address =
            Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
          await callback(address);
        } catch (error) {
          log.warn("Failed to get wallet accounts:", { error });
          await callback(null);
        }
      }
    },
    {
      handleErrors: true,
      logErrors: true,
      logLevel: "warn",
    },
  );
}
