import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Utility function to listen for wallet account changes
 * @param callback Function to call when wallet accounts change
 * @returns A cleanup function to remove the listener
 */
export function listenForWalletChanges(callback: () => void): () => void {
  // Only run in browser environment
  if (typeof window === "undefined" || !window.ethereum) {
    return () => {}; // Return empty cleanup function if not in browser or no ethereum provider
  }

  const handleAccountsChanged = () => {
    // Call the callback when accounts change
    callback();
  };

  // Add listener
  window.ethereum.on("accountsChanged", handleAccountsChanged);

  // Return cleanup function
  return () => {
    window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  };
}
