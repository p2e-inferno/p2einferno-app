"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { LOCK_CONFIG_VIEW_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:max-number-of-keys");

interface UseMaxNumberOfKeysOptions {
  enabled?: boolean; // Gate RPC usage
}

/**
 * Hook to read maxNumberOfKeys value from a lock contract
 * Used to verify if grant-based locks are secured (should be 0 to disable purchases)
 *
 * @param options - Configuration options
 * @returns Function to check maxNumberOfKeys and error state
 */
export const useMaxNumberOfKeys = (
  options: UseMaxNumberOfKeysOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkMaxNumberOfKeys = useCallback(
    async (lockAddress: Address): Promise<bigint | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const maxNumberOfKeys = (await client.readContract({
          address: lockAddress,
          abi: LOCK_CONFIG_VIEW_ABI,
          functionName: "maxNumberOfKeys",
        })) as bigint;

        log.debug("maxNumberOfKeys check result", {
          lockAddress,
          maxNumberOfKeys: maxNumberOfKeys.toString(),
          isSecure: maxNumberOfKeys === 0n,
        });

        return maxNumberOfKeys;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error checking maxNumberOfKeys:", {
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
    checkMaxNumberOfKeys,
    error,
  };
};
