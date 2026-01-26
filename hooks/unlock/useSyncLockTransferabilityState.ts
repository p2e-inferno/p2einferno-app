"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useTransferFeeBasisPoints } from "@/hooks/unlock/useTransferFeeBasisPoints";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:unlock:sync-lock-transferability-state");

export type LockTransferabilityEntityType =
  | "milestone"
  | "quest"
  | "bootcamp"
  | "cohort";

interface SyncParams {
  entityType: LockTransferabilityEntityType;
  entityId: string;
  lockAddress: Address;
}

interface SyncResult {
  success: boolean;
  error?: string;
  transferFeeBasisPoints?: bigint;
}

export const NON_TRANSFERABLE_FEE_BPS = 10000n;

/**
 * Syncs transferability_secured with the on-chain state for a lock.
 * - Reads transferFeeBasisPoints on-chain
 * - Marks secured when bps == 10000
 * - Writes the result to the corresponding admin endpoint
 */
export const useSyncLockTransferabilityState = () => {
  const { checkTransferFeeBasisPoints } = useTransferFeeBasisPoints();
  const { adminFetch } = useAdminApi({ suppressToasts: true });
  const [isSyncing, setIsSyncing] = useState(false);

  const syncState = useCallback(
    async (params: SyncParams): Promise<SyncResult> => {
      setIsSyncing(true);
      try {
        const feeBps = await checkTransferFeeBasisPoints(params.lockAddress);
        if (feeBps === null) {
          throw new Error("Failed to read on-chain transferFeeBasisPoints");
        }

        const isSecured = feeBps === NON_TRANSFERABLE_FEE_BPS;
        const reason = isSecured ? null : `transferFeeBasisPoints is ${feeBps.toString()}`;

        log.info("Syncing lock transferability state", {
          entityType: params.entityType,
          entityId: params.entityId,
          lockAddress: params.lockAddress,
          transferFeeBasisPoints: feeBps.toString(),
          transferabilitySecured: isSecured,
        });

        let result: Awaited<ReturnType<typeof adminFetch>> | undefined;
        switch (params.entityType) {
          case "milestone":
            result = await adminFetch("/api/admin/milestones", {
              method: "PUT",
              body: JSON.stringify({
                id: params.entityId,
                transferability_secured: isSecured,
                transferability_failure_reason: reason,
              }),
            });
            break;
          case "quest":
            result = await adminFetch(`/api/admin/quests/${params.entityId}`, {
              method: "PATCH",
              body: JSON.stringify({
                transferability_secured: isSecured,
                transferability_failure_reason: reason,
              }),
            });
            break;
          case "bootcamp":
            result = await adminFetch(`/api/admin/bootcamps/${params.entityId}`, {
              method: "PUT",
              body: JSON.stringify({
                transferability_secured: isSecured,
                transferability_failure_reason: reason,
              }),
            });
            break;
          case "cohort":
            result = await adminFetch(`/api/admin/cohorts`, {
              method: "PUT",
              body: JSON.stringify({
                id: params.entityId,
                transferability_secured: isSecured,
                transferability_failure_reason: reason,
              }),
            });
            break;
          default: {
            const _exhaustiveCheck: never = params.entityType;
            throw new Error(`Unsupported entity type: ${_exhaustiveCheck}`);
          }
        }

        if (result?.error) {
          throw new Error(result.error);
        }

        return { success: true, transferFeeBasisPoints: feeBps };
      } catch (error: any) {
        const message = error?.message || "Failed to sync transferability state";
        log.error("Sync lock transferability state failed", {
          error,
          entityType: params.entityType,
          entityId: params.entityId,
        });
        return { success: false, error: message };
      } finally {
        setIsSyncing(false);
      }
    },
    [adminFetch, checkTransferFeeBasisPoints],
  );

  return {
    syncState,
    isSyncing,
  };
};

