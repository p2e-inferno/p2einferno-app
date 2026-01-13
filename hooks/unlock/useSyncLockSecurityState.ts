"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";
import { useMaxNumberOfKeys } from "@/hooks/unlock/useMaxNumberOfKeys";
import { useAdminApi } from "@/hooks/useAdminApi";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:unlock:sync-lock-security-state");

export type LockSecurityEntityType = "milestone" | "quest" | "bootcamp" | "cohort";

interface SyncParams {
  entityType: LockSecurityEntityType;
  entityId: string;
  lockAddress: Address;
}

interface SyncResult {
  success: boolean;
  error?: string;
  maxNumberOfKeys?: bigint;
}

export const useSyncLockSecurityState = () => {
  const { checkMaxNumberOfKeys } = useMaxNumberOfKeys();
  const { adminFetch } = useAdminApi();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncState = useCallback(
    async (params: SyncParams): Promise<SyncResult> => {
      setIsSyncing(true);
      try {
        const maxNumberOfKeys = await checkMaxNumberOfKeys(params.lockAddress);
        if (maxNumberOfKeys === null) {
          throw new Error("Failed to read on-chain maxNumberOfKeys");
        }

        const isSecured = maxNumberOfKeys === 0n;
        const reason = isSecured
          ? null
          : `maxNumberOfKeys is ${maxNumberOfKeys.toString()}`;

        log.info("Syncing lock security state", {
          entityType: params.entityType,
          entityId: params.entityId,
          lockAddress: params.lockAddress,
          maxNumberOfKeys: maxNumberOfKeys.toString(),
          maxKeysSecured: isSecured,
        });

        let result;
        switch (params.entityType) {
          case "milestone":
            result = await adminFetch("/api/admin/milestones", {
              method: "PUT",
              body: JSON.stringify({
                id: params.entityId,
                max_keys_secured: isSecured,
                max_keys_failure_reason: reason,
              }),
            });
            break;
          case "quest":
            result = await adminFetch(`/api/admin/quests/${params.entityId}`, {
              method: "PATCH",
              body: JSON.stringify({
                max_keys_secured: isSecured,
                max_keys_failure_reason: reason,
              }),
            });
            break;
          case "bootcamp":
            result = await adminFetch(`/api/admin/bootcamps/${params.entityId}`, {
              method: "PUT",
              body: JSON.stringify({
                max_keys_secured: isSecured,
                max_keys_failure_reason: reason,
              }),
            });
            break;
          case "cohort":
            result = await adminFetch(`/api/admin/cohorts/${params.entityId}`, {
              method: "PUT",
              body: JSON.stringify({
                max_keys_secured: isSecured,
                max_keys_failure_reason: reason,
              }),
            });
            break;
        }

        if (result?.error) {
          throw new Error(result.error);
        }

        return { success: true, maxNumberOfKeys };
      } catch (error: any) {
        const message = error?.message || "Failed to sync state";
        log.error("Sync lock security state failed", {
          error,
          entityType: params.entityType,
          entityId: params.entityId,
        });
        return { success: false, error: message };
      } finally {
        setIsSyncing(false);
      }
    },
    [adminFetch, checkMaxNumberOfKeys],
  );

  return {
    syncState,
    isSyncing,
  };
};
