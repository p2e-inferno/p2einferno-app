"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:key-price");

interface UseKeyPriceOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

export const useKeyPrice = (options: UseKeyPriceOptions = {}) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const getKeyPrice = useCallback(
    async (lockAddress: Address): Promise<bigint | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const keyPrice = (await client.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "keyPrice",
        })) as bigint;

        log.debug("Key price retrieved", {
          lockAddress,
          keyPrice: keyPrice.toString(),
        });

        return keyPrice;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error getting key price:", { error: err, lockAddress });
        setError(errorMsg);
        return null;
      }
    },
    [enabled],
  );

  return {
    getKeyPrice,
    error,
  };
};
