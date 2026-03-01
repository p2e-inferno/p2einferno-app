/**
 * Hook: useDGNationKey
 *
 * Checks if the user has a valid DG Nation NFT and when it expires.
 * Reusable across components for access control.
 */

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@privy-io/react-auth";
import { createViemPublicClient } from '@/lib/blockchain/providers/privy-viem';
import { abi as lockAbi } from '@/constants/public_lock_abi';
import { getLogger } from '@/lib/utils/logger';
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { getWalletAddressesFromUser } from "@/lib/utils/wallet-selection";
import { normalizeAddress } from "@/lib/utils/address";

const log = getLogger('hooks:useDGNationKey');

export interface DGNationKeyInfo {
  hasValidKey: boolean;
  tokenId: bigint | null;
  expirationTimestamp: bigint | null;
  expiresAt: Date | null;
  isLoading: boolean;
  error: string | null;
  hasValidKeyAnyLinked: boolean;
  activeWalletAddress: string | null;
  validWalletAddress: string | null;
}

type KeyCheckData = {
  checkedAddresses: Array<`0x${string}`>;
  validAddresses: Array<`0x${string}`>;
  tokenId: bigint | null;
  expirationTimestamp: bigint | null;
  expiresAt: Date | null;
  errors: Array<{ address: `0x${string}`; error: string }>;
  hasKeyByAddress: Record<`0x${string}`, boolean>;
};

const DG_NATION_KEY_CACHE_TTL_MS = 60_000;
const MAX_KEY_CACHE_ENTRIES = 50;
const IN_FLIGHT_CHECK_TTL_MS = 60_000;
const keyCache = new Map<
  string,
  { data: KeyCheckData; fetchedAt: number; error: string | null }
>();
const inFlightChecks = new Map<
  string,
  { promise: Promise<KeyCheckData>; startedAt: number }
>();

function purgeCaches(now = Date.now()) {
  for (const [key, entry] of keyCache) {
    if (now - entry.fetchedAt > DG_NATION_KEY_CACHE_TTL_MS) {
      keyCache.delete(key);
    }
  }

  for (const [key, entry] of inFlightChecks) {
    if (now - entry.startedAt > IN_FLIGHT_CHECK_TTL_MS) {
      inFlightChecks.delete(key);
    }
  }

  while (keyCache.size > MAX_KEY_CACHE_ENTRIES) {
    const oldestKey = keyCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    keyCache.delete(oldestKey);
    inFlightChecks.delete(oldestKey);
  }
}

function normalizeWalletAddress(
  address?: string | null,
): `0x${string}` | null {
  const normalized = normalizeAddress(address);
  return normalized ? (normalized as `0x${string}`) : null;
}

/**
 * Hook to check if user has a valid DG Nation NFT and when it expires
 * Reusable across components for access control
 */
export function useDGNationKey() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const activeWallet = normalizeWalletAddress(walletAddress);
  const lockAddress = process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS as `0x${string}`;

  const linkedWalletAddresses = useMemo(() => {
    const normalized = getWalletAddressesFromUser(user)
      .map(normalizeWalletAddress)
      .filter((address): address is `0x${string}` => !!address);
    const unique = Array.from(new Set(normalized));
    unique.sort();
    return unique;
  }, [user]);

  const [data, setData] = useState<KeyCheckData>({
    checkedAddresses: [],
    validAddresses: [],
    tokenId: null,
    expirationTimestamp: null,
    expiresAt: null,
    errors: [],
    hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!lockAddress) {
        setIsLoading(false);
        setRuntimeError("DG Nation lock not configured");
        setData({
          checkedAddresses: [],
          validAddresses: [],
          tokenId: null,
          expirationTimestamp: null,
          expiresAt: null,
          errors: [],
          hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
        });
        return;
      }

      if (!user?.id) {
        setIsLoading(false);
        setRuntimeError(null);
        setData({
          checkedAddresses: [],
          validAddresses: [],
          tokenId: null,
          expirationTimestamp: null,
          expiresAt: null,
          errors: [],
          hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
        });
        return;
      }

      if (linkedWalletAddresses.length === 0) {
        setIsLoading(false);
        setRuntimeError(activeWallet ? null : "No wallet connected");
        setData({
          checkedAddresses: [],
          validAddresses: [],
          tokenId: null,
          expirationTimestamp: null,
          expiresAt: null,
          errors: [],
          hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
        });
        return;
      }

      const cacheKey = `${user.id}|${lockAddress}|${linkedWalletAddresses.join(",")}`;
      purgeCaches();
      const cached = keyCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < DG_NATION_KEY_CACHE_TTL_MS) {
        // Touch LRU position
        keyCache.delete(cacheKey);
        keyCache.set(cacheKey, cached);
        setData(cached.data);
        setRuntimeError(cached.error);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setRuntimeError(null);

      try {
        const existing = inFlightChecks.get(cacheKey)?.promise;
        const promise =
          existing ??
          (async () => {
            const publicClient = createViemPublicClient();

            const checkResults = await Promise.all(
              linkedWalletAddresses.map(async (address) => {
                try {
                  const hasKey = await publicClient.readContract({
                    address: lockAddress,
                    abi: lockAbi,
                    functionName: "getHasValidKey",
                    args: [address],
                  });
                  return {
                    address,
                    hasKey: Boolean(hasKey),
                    error: null as string | null,
                  };
                } catch (error) {
                  const message =
                    error instanceof Error
                      ? error.message
                      : "Failed to check key";
                  return { address, hasKey: false, error: message };
                }
              }),
            );

            const hasKeyByAddress = checkResults.reduce(
              (acc, r) => {
                acc[r.address] = r.hasKey;
                return acc;
              },
              {} as Record<`0x${string}`, boolean>,
            );

            const validAddresses = checkResults
              .filter((r) => r.hasKey)
              .map((r) => r.address);

            const errors = checkResults
              .filter((r) => r.error)
              .map((r) => ({ address: r.address, error: r.error! }));

            const aggregatedError =
              errors.length === checkResults.length && checkResults.length > 0
                ? `All per-address checks failed: ${errors
                    .map((e) => `${e.address}: ${e.error}`)
                    .join("; ")}`
                : null;

            let tokenId: bigint | null = null;
            let expirationTimestamp: bigint | null = null;
            let expiresAt: Date | null = null;

            if (validAddresses.length > 0) {
              const keyOwner = validAddresses[0]!;
              try {
                const tokenIdRaw = await publicClient.readContract({
                  address: lockAddress,
                  abi: lockAbi,
                  functionName: "tokenOfOwnerByIndex",
                  args: [keyOwner, 0n],
                });
                tokenId = tokenIdRaw as bigint;

                const expirationRaw = (await publicClient.readContract({
                  address: lockAddress,
                  abi: lockAbi,
                  functionName: "keyExpirationTimestampFor",
                  args: [tokenId],
                })) as bigint;

                expirationTimestamp = expirationRaw;
                expiresAt = new Date(Number(expirationRaw) * 1000);
              } catch (error) {
                log.warn("Failed to read key details for owner wallet", {
                  lockAddress,
                  keyOwner,
                  error,
                });
              }
            }

            const result: KeyCheckData = {
              checkedAddresses: linkedWalletAddresses,
              validAddresses,
              tokenId,
              expirationTimestamp,
              expiresAt,
              errors,
              hasKeyByAddress,
            };

            keyCache.set(cacheKey, {
              data: result,
              fetchedAt: Date.now(),
              error: aggregatedError,
            });
            purgeCaches();

            return result;
          })();

        if (!existing) {
          inFlightChecks.set(cacheKey, { promise, startedAt: Date.now() });
          promise.finally(() => inFlightChecks.delete(cacheKey));
        }

        const result = await promise;
        if (cancelled) return;
        setData(result);
        setRuntimeError(keyCache.get(cacheKey)?.error ?? null);
        setIsLoading(false);
      } catch (error) {
        if (cancelled) return;
        log.error("Failed to check DG Nation key status", {
          error,
          wallet: activeWallet,
        });
        const message =
          error instanceof Error ? error.message : "Failed to check DG Nation status";
        setRuntimeError(message);
        setIsLoading(false);
        setData({
          checkedAddresses: linkedWalletAddresses,
          validAddresses: [],
          tokenId: null,
          expirationTimestamp: null,
          expiresAt: null,
          errors: [],
          hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
        });
        keyCache.set(cacheKey, {
          data: {
            checkedAddresses: linkedWalletAddresses,
            validAddresses: [],
            tokenId: null,
            expirationTimestamp: null,
            expiresAt: null,
            errors: [],
            hasKeyByAddress: {} as Record<`0x${string}`, boolean>,
          },
          fetchedAt: Date.now(),
          error: message,
        });
        purgeCaches();
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeWallet, linkedWalletAddresses, lockAddress, user?.id]);

  const hasValidKey = activeWallet ? Boolean(data.hasKeyByAddress[activeWallet]) : false;
  const hasValidKeyAnyLinked = data.validAddresses.length > 0;
  const validWalletAddress = (() => {
    if (!data.validAddresses.length) return null;
    if (!activeWallet) return data.validAddresses[0] ?? null;
    const notActive = data.validAddresses.find((addr) => addr !== activeWallet);
    return (notActive ?? data.validAddresses[0]) || null;
  })();

  const error = runtimeError;

  return {
    hasValidKey,
    tokenId: data.tokenId,
    expirationTimestamp: data.expirationTimestamp,
    expiresAt: data.expiresAt,
    isLoading,
    error,
    hasValidKeyAnyLinked,
    activeWalletAddress: activeWallet,
    validWalletAddress,
  };
}
