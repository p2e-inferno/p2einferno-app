"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { LOCK_CONFIG_VIEW_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:max-keys-per-address");

interface UseMaxKeysPerAddressOptions {
  enabled?: boolean; // Gate RPC usage
}

/**
 * Hook to read maxKeysPerAddress value from a lock contract
 * Used to verify if grant-based locks are secured (should be 0)
 *
 * @param options - Configuration options
 * @returns Function to check maxKeysPerAddress and error state
 */
export const useMaxKeysPerAddress = (
  options: UseMaxKeysPerAddressOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkMaxKeysPerAddress = useCallback(
    async (lockAddress: Address): Promise<bigint | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const maxKeysPerAddress = (await client.readContract({
          address: lockAddress,
          abi: LOCK_CONFIG_VIEW_ABI,
          functionName: "maxKeysPerAddress",
        })) as bigint;

        log.debug("maxKeysPerAddress check result", {
          lockAddress,
          maxKeysPerAddress: maxKeysPerAddress.toString(),
          isSecure: maxKeysPerAddress === 0n,
        });

        return maxKeysPerAddress;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error checking maxKeysPerAddress:", {
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
    checkMaxKeysPerAddress,
    error,
  };
};
