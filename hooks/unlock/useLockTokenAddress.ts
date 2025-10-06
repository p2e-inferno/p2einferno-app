"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:lock-token-address");

interface UseLockTokenAddressOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

export const useLockTokenAddress = (
  options: UseLockTokenAddressOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const getLockTokenAddress = useCallback(
    async (lockAddress: Address): Promise<Address | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const tokenAddress = (await client.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "tokenAddress",
        })) as Address;

        log.debug("Lock token address retrieved", {
          lockAddress,
          tokenAddress,
        });

        return tokenAddress;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error getting lock token address:", {
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
    getLockTokenAddress,
    error,
  };
};
