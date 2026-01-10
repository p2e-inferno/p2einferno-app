"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, zeroAddress, type Address } from "viem";

const log = getLogger("hooks:unlock:is-renewable");

interface UseIsRenewableOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

/**
 * Hook to check if a key can be renewed
 * Read-only operation that returns boolean result
 */
export const useIsRenewable = (options: UseIsRenewableOptions = {}) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkIsRenewable = useCallback(
    async (
      lockAddress: Address,
      tokenId: bigint,
      referrer?: Address,
    ): Promise<boolean | null> => {
      if (!enabled) {
        return null;
      }

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const validatedLockAddress = getAddress(lockAddress);
        const validatedReferrer = referrer ? getAddress(referrer) : zeroAddress;

        const isRenewable = (await client.readContract({
          address: validatedLockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isRenewable",
          args: [tokenId, validatedReferrer],
        })) as unknown as boolean;

        log.debug("Key renewability checked", {
          lockAddress: validatedLockAddress,
          tokenId: tokenId.toString(),
          referrer: validatedReferrer,
          isRenewable,
        });

        return isRenewable;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error checking isRenewable:", {
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
    checkIsRenewable,
    error,
  };
};
