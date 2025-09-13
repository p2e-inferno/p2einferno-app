import { useCallback, useEffect, useRef } from "react";

interface UseAdminFetchOnceOptions {
  authenticated: boolean;
  isAdmin: boolean;
  // A wallet-derived key; pass the active wallet address or a stable id
  walletKey?: string | null;
  // Additional key parts that should trigger a re-fetch when they change (e.g., record id)
  keys?: Array<string | number | null | undefined>;
  // The function to invoke once per key set
  fetcher: () => Promise<any> | any;
  // Whether the hook is enabled
  enabled?: boolean;
  // Optional throttle window; if set, suppresses re-fetches within this ms window for same key
  throttleMs?: number;
  // Optional TTL window; re-run fetcher when this period has elapsed even if the key hasn't changed
  timeToLive?: number; // milliseconds
}

/**
 * Runs the provided fetcher exactly once per unique key composed from auth state, wallet, and keys.
 * - Auth-aware: waits for authenticated && isAdmin
 * - Wallet-aware: changes in walletKey will reset and re-run
 * - Key-aware: changes in keys array reset and re-run
 * - Optional throttle to avoid rapid re-execution
 */
export function useAdminFetchOnce(options: UseAdminFetchOnceOptions) {
  const {
    authenticated,
    isAdmin,
    walletKey = null,
    keys = [],
    fetcher,
    enabled = true,
    throttleMs,
    timeToLive = 5 * 60 * 1000, // default 5 minutes
  } = options;

  const lastKeyRef = useRef<string | null>(null);
  const lastRunRef = useRef<number>(0);

  // Build a stable composite key from inputs
  const buildKey = useCallback(() => {
    return JSON.stringify([
      Boolean(authenticated),
      Boolean(isAdmin),
      walletKey || "no-wallet",
      ...keys.map((k) => (k == null ? null : String(k))),
    ]);
  }, [authenticated, isAdmin, walletKey, keys]);

  // Soft reset helper in case callers want to force a refresh
  const reset = useCallback(() => {
    lastKeyRef.current = null;
    lastRunRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!authenticated || !isAdmin) return;

    const key = buildKey();
    const now = Date.now();

    // Throttle short bursts
    if (throttleMs && now - lastRunRef.current < throttleMs) return;

    // If key hasn't changed, respect TTL before re-running
    if (lastKeyRef.current === key) {
      if (timeToLive && now - lastRunRef.current < timeToLive) return;
      // TTL expired; continue to run
    } else {
      // New key; update cache key
      lastKeyRef.current = key;
    }

    // Update last run time
    lastRunRef.current = now;

    // Execute fetcher (ignore returned promise)
    Promise.resolve()
      .then(() => fetcher())
      .catch(() => {
        // Swallow here; callers should handle errors within fetcher
      });
  }, [enabled, authenticated, isAdmin, buildKey, throttleMs, fetcher]);

  return {
    reset,
    get lastKey() {
      return lastKeyRef.current;
    },
  };
}
