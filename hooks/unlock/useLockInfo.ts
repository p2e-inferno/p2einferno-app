"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClientUnified } from "@/lib/blockchain/config";
import { COMPLETE_LOCK_ABI, ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { formatUnits, zeroAddress, type Address } from "viem";

const log = getLogger("hooks:unlock:lock-info");

interface LockInfo {
  keyPrice: string;
  keyPriceRaw: bigint;
  tokenSymbol: string;
  tokenAddress: string;
  expirationDuration: bigint;
  durationFormatted: string;
  isLoading: boolean;
  error: string | null;
}

/**
 * Helper function to format duration from seconds to human-readable string
 */
const formatDuration = (seconds: bigint): string => {
  const secondsNum = Number(seconds);

  if (secondsNum === 0) {
    return "Unlimited";
  }

  const days = Math.floor(secondsNum / 86400);
  const hours = Math.floor((secondsNum % 86400) / 3600);
  const minutes = Math.floor((secondsNum % 3600) / 60);

  // Format based on duration
  if (days >= 30) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    if (remainingDays === 0) {
      return `${months} Month${months > 1 ? "s" : ""}`;
    }
    return `${months} Month${months > 1 ? "s" : ""} (${days} days)`;
  } else if (days > 0) {
    return `${days} Day${days > 1 ? "s" : ""}`;
  } else if (hours > 0) {
    return `${hours} Hour${hours > 1 ? "s" : ""}`;
  } else if (minutes > 0) {
    return `${minutes} Minute${minutes > 1 ? "s" : ""}`;
  }

  return `${secondsNum} Second${secondsNum > 1 ? "s" : ""}`;
};

/**
 * Fetch lock information from the blockchain
 */
const fetchLockInfo = async (lockAddress: string): Promise<Omit<LockInfo, "isLoading" | "error">> => {
  const publicClient = createPublicClientUnified();

  // Fetch price, token address, and expiration duration in parallel
  const [keyPriceRaw, tokenAddress, expirationDuration] = await Promise.all([
    publicClient.readContract({
      address: lockAddress as Address,
      abi: COMPLETE_LOCK_ABI,
      functionName: "keyPrice",
    }) as Promise<bigint>,
    publicClient.readContract({
      address: lockAddress as Address,
      abi: COMPLETE_LOCK_ABI,
      functionName: "tokenAddress",
    }) as Promise<Address>,
    publicClient.readContract({
      address: lockAddress as Address,
      abi: COMPLETE_LOCK_ABI,
      functionName: "expirationDuration",
    }) as Promise<bigint>,
  ]);

  // Fetch token symbol and decimals
  let tokenSymbol = "ETH";
  let decimals = 18;

  if (tokenAddress !== zeroAddress) {
    try {
      [tokenSymbol, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "symbol",
        }) as Promise<string>,
        publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "decimals",
        }) as Promise<number>,
      ]);
    } catch (err) {
      // Fallback to safe defaults when token details cannot be fetched
      tokenSymbol = tokenAddress.slice(0, 8) + "...";
      decimals = 18; // Safe default for most tokens
      log.warn("Failed to fetch token details, using fallback defaults", {
        tokenAddress,
        fallbackSymbol: tokenSymbol,
        fallbackDecimals: decimals,
        error: err,
      });
    }
  }

  // Format price with correct decimals
  const keyPrice = formatUnits(keyPriceRaw, decimals);

  // Format duration
  const durationFormatted = formatDuration(expirationDuration);

  return {
    keyPrice,
    keyPriceRaw,
    tokenSymbol,
    tokenAddress,
    expirationDuration,
    durationFormatted,
  };
};

/**
 * Hook to fetch lock information with React Query for caching and deduplication
 */
export const useLockInfo = (lockAddress: string | undefined) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["lockInfo", lockAddress],
    queryFn: () => {
      // `enabled` guard ensures lockAddress is defined
      return fetchLockInfo(lockAddress!);
    },
    enabled: !!lockAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 2,
  });

  // Return with loading/error states
  return {
    keyPrice: data?.keyPrice ?? "...",
    keyPriceRaw: data?.keyPriceRaw ?? 0n,
    tokenSymbol: data?.tokenSymbol ?? "...",
    tokenAddress: data?.tokenAddress ?? "",
    expirationDuration: data?.expirationDuration ?? 0n,
    durationFormatted: data?.durationFormatted ?? "...",
    isLoading,
    error: error ? (error as Error).message : null,
  } as LockInfo;
};
