"use client";

import { useIdentitySDK as useGoodDollarIdentitySDK } from "@goodsdks/react-hooks";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("gooddollar:use-identity-sdk");

const GOODDOLLAR_ENV = (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV ||
  "staging") as "production" | "staging" | "development";

/**
 * Hook to get IdentitySDK instance on client-side.
 *
 * Delegates to @goodsdks/react-hooks and adapts to our existing API:
 * - returns IdentitySDK | null
 * - environment is controlled via GOODDOLLAR_ENV
 * - no dependency on unified viem config or wagmi clients
 *
 * NOTE: We only import from @goodsdks/react-hooks here, not @goodsdks/citizen-sdk.
 * The citizen-sdk has transitive dependencies (lz-string) that cause ESM/CommonJS
 * compatibility issues. Server-side code can import citizen-sdk directly.
 */
export function useIdentitySDK(): any {
  const { sdk, loading, error } = useGoodDollarIdentitySDK(GOODDOLLAR_ENV);

  if (error) {
    // Non-fatal: callers already guard on !sdk
    log.error("GoodDollar React hook failed to initialize IdentitySDK", {
      error,
    });
  } else if (loading && !sdk) {
    log.debug("GoodDollar IdentitySDK is still initializing on client", {
      environment: GOODDOLLAR_ENV,
    });
  }

  return sdk ?? null;
}
