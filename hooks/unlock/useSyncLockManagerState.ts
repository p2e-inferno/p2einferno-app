"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:unlock:sync-lock-manager-state");

export type LockManagerEntityType = "milestone" | "quest" | "bootcamp" | "cohort";

interface SyncParams {
  entityType: LockManagerEntityType;
  entityId: string;
  lockAddress: Address;
}

interface SyncResult {
  success: boolean;
  error?: string;
  isManager?: boolean | null;
  serverWalletAddress?: string;
}

/**
 * Syncs lock_manager_granted with the on-chain state for the server wallet.
 * - Fetches server wallet address
 * - Checks isLockManager on-chain
 * - Writes the result to the corresponding admin endpoint
 */
export const useSyncLockManagerState = () => {
  const { adminFetch } = useAdminApi();
  const { checkIsLockManager } = useIsLockManager();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncState = useCallback(
    async (params: SyncParams): Promise<SyncResult> => {
      setIsSyncing(true);
      try {
        // Get server wallet address once (server-side)
        const serverResp = await adminFetch<{ serverWalletAddress: string }>(
          "/api/admin/server-wallet",
        );
        const serverWalletAddress = serverResp.data?.serverWalletAddress;
        if (serverResp.error || !serverWalletAddress) {
          throw new Error(
            serverResp.error || "Failed to fetch server wallet address",
          );
        }

        // Check on-chain manager status (read-only)
        const isManager = await checkIsLockManager(
          serverWalletAddress as Address,
          params.lockAddress,
        );
        if (isManager === null) {
          throw new Error("Failed to verify lock manager status on-chain");
        }

        log.info("Syncing lock_manager_granted from chain to DB", {
          entityType: params.entityType,
          entityId: params.entityId,
          lockAddress: params.lockAddress,
          serverWalletAddress,
          isManager,
        });

        // Update DB to mirror on-chain state
        let result;
        switch (params.entityType) {
          case "milestone":
            result = await adminFetch("/api/admin/milestones", {
              method: "PUT",
              body: JSON.stringify({
                id: params.entityId,
                lock_manager_granted: isManager,
                grant_failure_reason: isManager
                  ? null
                  : "Server wallet is not a lock manager on-chain",
              }),
            });
            break;
          case "quest":
            result = await adminFetch(`/api/admin/quests/${params.entityId}`, {
              method: "PATCH",
              body: JSON.stringify({
                lock_manager_granted: isManager,
                grant_failure_reason: isManager
                  ? null
                  : "Server wallet is not a lock manager on-chain",
              }),
            });
            break;
          case "bootcamp":
            result = await adminFetch(`/api/admin/bootcamps/${params.entityId}`, {
              method: "PUT",
              body: JSON.stringify({
                lock_manager_granted: isManager,
                grant_failure_reason: isManager
                  ? null
                  : "Server wallet is not a lock manager on-chain",
              }),
            });
            break;
          case "cohort":
            result = await adminFetch(`/api/admin/cohorts/${params.entityId}`, {
              method: "PUT",
              body: JSON.stringify({
                lock_manager_granted: isManager,
                grant_failure_reason: isManager
                  ? null
                  : "Server wallet is not a lock manager on-chain",
              }),
            });
            break;
        }

        if (result?.error) {
          throw new Error(result.error);
        }

        return {
          success: true,
          isManager,
          serverWalletAddress,
        };
      } catch (error: any) {
        const message = error?.message || "Failed to sync lock manager state";
        log.error("Sync lock manager state failed", {
          error,
          entityType: params.entityType,
          entityId: params.entityId,
        });
        return { success: false, error: message };
      } finally {
        setIsSyncing(false);
      }
    },
    [adminFetch, checkIsLockManager],
  );

  return {
    syncState,
    isSyncing,
  };
};
