"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";

const log = getLogger("hooks:unlock:free-trial-length");

interface UseFreeTrialLengthOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

/**
 * Hook to get the configured free trial length (refund grace period) for a lock
 * Returns trial length in seconds - grace period for full refunds
 * Note: This is NOT for granting trials, but for refund policy configuration
 */
export const useFreeTrialLength = (options: UseFreeTrialLengthOptions = {}) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const getFreeTrialLength = useCallback(
    async (lockAddress: Address): Promise<bigint | null> => {
      if (!enabled) {
        return null;
      }

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const validatedLockAddress = getAddress(lockAddress);

        const freeTrialLength = (await client.readContract({
          address: validatedLockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "freeTrialLength",
        })) as bigint;

        log.debug("Free trial length retrieved", {
          lockAddress: validatedLockAddress,
          freeTrialLength: freeTrialLength.toString(),
        });

        return freeTrialLength;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error getting free trial length:", {
          error: err,
          lockAddress,
        });
        setError(errorMsg);
        return null;
      }
    },
    [enabled],
  );

  return {
    getFreeTrialLength,
    error,
  };
};
