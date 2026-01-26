"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { TRANSFER_FEE_VIEW_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:transfer-fee-bps");

interface UseTransferFeeBasisPointsOptions {
  enabled?: boolean; // Gate RPC usage
}

/**
 * Hook to read transferFeeBasisPoints from a lock contract.
 *
 * Security rule:
 * - 10000 => non-transferable (secure)
 * - anything else => transferable (security risk)
 */
export const useTransferFeeBasisPoints = (
  options: UseTransferFeeBasisPointsOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkTransferFeeBasisPoints = useCallback(
    async (lockAddress: Address): Promise<bigint | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        const client = createPublicClientUnified();
        const feeBps = (await client.readContract({
          address: lockAddress,
          abi: TRANSFER_FEE_VIEW_ABI,
          functionName: "transferFeeBasisPoints",
        })) as bigint;

        log.debug("transferFeeBasisPoints check result", {
          lockAddress,
          feeBps: feeBps.toString(),
          isSecure: feeBps === 10000n,
        });

        return feeBps;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error checking transferFeeBasisPoints", {
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
    checkTransferFeeBasisPoints,
    error,
  };
};

