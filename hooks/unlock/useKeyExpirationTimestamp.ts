"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:key-expiration-timestamp");

interface UseKeyExpirationTimestampOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

export const useKeyExpirationTimestamp = (
  options: UseKeyExpirationTimestampOptions = {},
) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const getKeyExpirationTimestamp = useCallback(
    async (lockAddress: Address, tokenId: bigint): Promise<bigint | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        const expirationTimestamp = (await client.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "keyExpirationTimestampFor",
          args: [tokenId],
        })) as bigint;

        log.debug("Key expiration timestamp retrieved", {
          lockAddress,
          tokenId: tokenId.toString(),
          expirationTimestamp: expirationTimestamp.toString(),
        });

        return expirationTimestamp;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error getting key expiration timestamp:", {
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
    getKeyExpirationTimestamp,
    error,
  };
};
