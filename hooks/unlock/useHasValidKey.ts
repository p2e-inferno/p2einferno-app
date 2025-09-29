"use client";

import { useCallback, useState } from "react";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
import type { KeyInfo } from "./types";

const log = getLogger("hooks:unlock:has-valid-key");

interface UseHasValidKeyOptions {
  enabled?: boolean; // Gate RPC usage exactly like useWalletBalances
}

export const useHasValidKey = (options: UseHasValidKeyOptions = {}) => {
  const { enabled = true } = options;
  const [error, setError] = useState<string | null>(null);

  const checkHasValidKey = useCallback(
    async (
      userAddress: Address,
      lockAddress: Address,
    ): Promise<KeyInfo | null> => {
      if (!enabled) return null;

      try {
        setError(null);

        // Fresh client per call - no persistence
        const client = createPublicClientUnified();

        // First check if the user has a valid key
        const hasValidKey = (await client.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "getHasValidKey",
          args: [userAddress],
        })) as boolean;

        if (hasValidKey === false) {
          log.debug("Key check result: no valid key", {
            userAddress,
            lockAddress,
          });
          return null;
        }

        try {
          // Get the token ID for the user
          const tokenId = (await client.readContract({
            address: lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [userAddress, 0n],
          })) as bigint;

          // Get key expiration
          const expirationTimestamp = (await client.readContract({
            address: lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "keyExpirationTimestampFor",
            args: [tokenId],
          })) as bigint;

          log.debug("Key check result: valid key with details", {
            userAddress,
            lockAddress,
            tokenId: tokenId.toString(),
            expirationTimestamp: expirationTimestamp.toString(),
          });

          return {
            tokenId,
            owner: userAddress,
            expirationTimestamp,
            isValid: hasValidKey,
          };
        } catch (tokenError) {
          log.warn("Error getting token details, using fallback", {
            userAddress,
            lockAddress,
            error:
              tokenError instanceof Error
                ? tokenError.message
                : "Unknown error",
          });
          // Even though getHasValidKey returned true, we couldn't get the token details
          // This might happen if the contract doesn't implement ERC721Enumerable
          return {
            tokenId: 0n,
            owner: userAddress,
            expirationTimestamp: 0n,
            isValid: true, // We trust getHasValidKey
          };
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        log.error("Error checking hasValidKey:", {
          error: err,
          userAddress,
          lockAddress,
        });
        setError(errorMsg);
        return null;
      }
    },
    [enabled],
  );

  return {
    checkHasValidKey,
    error,
  };
};
