"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Address } from "viem";
import { createBrowserLockManager } from "@/lib/blockchain/providers/lock-manager";
import type {
  LockManagerService,
  KeyInfo,
} from "@/lib/blockchain/services/lock-manager";

interface CheckOptions {
  forceRefresh?: boolean;
}

type PendingMap = Map<string, Promise<KeyInfo | null>>;

const makeCacheKey = (userAddress: Address, lockAddress: Address) =>
  `${userAddress.toLowerCase()}:${lockAddress.toLowerCase()}`;

/**
 * Provides a browser-scoped lock manager service with request coalescing
 * and deterministic disposal semantics.
 */
export const useLockManagerClient = () => {
  const managerRef = useRef<LockManagerService | null>(null);
  const pendingChecksRef = useRef<PendingMap>(new Map());

  const manager = useMemo(() => {
    if (!managerRef.current) {
      managerRef.current = createBrowserLockManager();
    }
    return managerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
      pendingChecksRef.current.clear();
    };
  }, [manager]);

  const checkUserHasValidKey = useCallback(
    async (
      userAddress: Address,
      lockAddress: Address,
      { forceRefresh = false }: CheckOptions = {},
    ) => {
      if (forceRefresh) {
        return manager.checkUserHasValidKey(userAddress, lockAddress, true);
      }

      const cacheKey = makeCacheKey(userAddress, lockAddress);

      if (pendingChecksRef.current.has(cacheKey)) {
        return pendingChecksRef.current.get(cacheKey)!;
      }

      const promise = manager.checkUserHasValidKey(
        userAddress,
        lockAddress,
        false,
      );
      pendingChecksRef.current.set(cacheKey, promise);

      try {
        return await promise;
      } finally {
        pendingChecksRef.current.delete(cacheKey);
      }
    },
    [manager],
  );

  return {
    checkUserHasValidKey,
  };
};
