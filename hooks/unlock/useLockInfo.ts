"use client";

import { useEffect, useState } from "react";
import { getKeyPrice } from "@/lib/unlock/lockUtils";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:unlock:lock-info");

interface LockInfo {
  keyPrice: string;
  keyPriceRaw: bigint;
  tokenSymbol: string;
  tokenAddress: string;
  isLoading: boolean;
  error: string | null;
}

export const useLockInfo = (lockAddress: string | undefined) => {
  const [lockInfo, setLockInfo] = useState<LockInfo>({
    keyPrice: "...",
    keyPriceRaw: 0n,
    tokenSymbol: "...",
    tokenAddress: "",
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!lockAddress) {
      setLockInfo({
        keyPrice: "N/A",
        keyPriceRaw: 0n,
        tokenSymbol: "N/A",
        tokenAddress: "",
        isLoading: false,
        error: "Lock address not configured",
      });
      return;
    }

    let mounted = true;

    const fetchLockInfo = async () => {
      try {
        setLockInfo((prev) => ({ ...prev, isLoading: true, error: null }));

        // Fetch key price and token address
        const priceInfo = await getKeyPrice(lockAddress);

        if (!mounted) return;

        // Fetch token symbol
        let tokenSymbol = "ETH";
        if (
          priceInfo.tokenAddress !==
          "0x0000000000000000000000000000000000000000"
        ) {
          try {
            const publicClient = createPublicClientUnified();
            tokenSymbol = (await publicClient.readContract({
              address: priceInfo.tokenAddress as Address,
              abi: ERC20_ABI,
              functionName: "symbol",
            })) as string;
          } catch (err) {
            log.warn("Failed to fetch token symbol, using address", err);
            tokenSymbol = priceInfo.tokenAddress.slice(0, 8) + "...";
          }
        }

        if (!mounted) return;

        setLockInfo({
          keyPrice: priceInfo.priceFormatted,
          keyPriceRaw: priceInfo.price,
          tokenSymbol,
          tokenAddress: priceInfo.tokenAddress,
          isLoading: false,
          error: null,
        });
      } catch (error: any) {
        log.error("Failed to fetch lock info", error);
        if (!mounted) return;

        setLockInfo({
          keyPrice: "Error",
          keyPriceRaw: 0n,
          tokenSymbol: "Error",
          tokenAddress: "",
          isLoading: false,
          error: error.message || "Failed to fetch lock information",
        });
      }
    };

    fetchLockInfo();

    return () => {
      mounted = false;
    };
  }, [lockAddress]);

  return lockInfo;
};
