"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";

const log = getLogger("hooks:unlock:get-cancel-and-refund-value");

interface UseGetCancelAndRefundValueOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

/**
 * Hook to check the refund amount for a key before allowing cancellation
 * Essential for security to prevent refunding granted keys
 * Returns $0 for granted keys (nothing was paid), actual payment amount for purchased keys
 */
export const useGetCancelAndRefundValue = (
  options: UseGetCancelAndRefundValueOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const getCancelAndRefundValue = useCallback(
    async (
      lockAddress: Address,
      tokenId: bigint,
    ): Promise<bigint | null> => {
      if (!enabled) {
        return null;
      }

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const validatedLockAddress = getAddress(lockAddress);

        const refundAmount = (await client.readContract({
          address: validatedLockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "getCancelAndRefundValue",
          args: [tokenId],
        })) as bigint;

        log.debug("Cancel and refund value retrieved", {
          lockAddress: validatedLockAddress,
          tokenId: tokenId.toString(),
          refundAmount: refundAmount.toString(),
        });

        return refundAmount;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error getting cancel and refund value:", {
          error: err,
          lockAddress,
          tokenId: tokenId.toString(),
        });
        setError(errorMsg);
        return null;
      }
    },
    [enabled],
  );

  return {
    getCancelAndRefundValue,
    error,
  };
};
