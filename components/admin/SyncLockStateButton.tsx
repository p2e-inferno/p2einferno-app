"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import type { Address } from "viem";
import { toast } from "react-hot-toast";
import {
  useSyncLockSecurityState,
  type LockSecurityEntityType,
} from "@/hooks/unlock/useSyncLockSecurityState";
import {
  useSyncLockTransferabilityState,
  type LockTransferabilityEntityType,
} from "@/hooks/unlock/useSyncLockTransferabilityState";
import {
  useSyncLockManagerState,
  type LockManagerEntityType,
} from "@/hooks/unlock/useSyncLockManagerState";

type SyncLockStateButtonProps =
  | {
      mode?: "maxKeys";
      entityType: LockSecurityEntityType;
      entityId: string;
      lockAddress: string;
      onSuccess?: () => void;
      onError?: (error: string) => void;
      compact?: boolean;
    }
  | {
      mode: "manager";
      entityType: LockManagerEntityType;
      entityId: string;
      lockAddress: string;
      onSuccess?: () => void;
      onError?: (error: string) => void;
      compact?: boolean;
    }
  | {
      mode: "transferability";
      entityType: LockTransferabilityEntityType;
      entityId: string;
      lockAddress: string;
      onSuccess?: () => void;
      onError?: (error: string) => void;
      compact?: boolean;
    };

/**
 * Renders a button that triggers synchronizing a lock's state using either the security-state or manager sync path.
 *
 * The button shows a spinner and disables itself while a sync is in progress, displays success or error toasts,
 * and invokes optional callbacks on completion or failure.
 *
 * @param entityType - The type of entity to synchronize (security or manager entity type).
 * @param entityId - The identifier of the entity to synchronize.
 * @param lockAddress - The lock address used for the synchronization.
 * @param onSuccess - Optional callback invoked after a successful sync.
 * @param onError - Optional callback invoked with an error message when sync fails.
 * @param compact - If true, render a smaller button; defaults to `true`.
 * @param mode - Sync mode to use: `"maxKeys"` for security-state sync or `"manager"` for manager-based sync; defaults to `"maxKeys"`.
 * @returns The sync button element that initiates the synchronization and reflects its progress.
 */
export default function SyncLockStateButton({
  entityType,
  entityId,
  lockAddress,
  onSuccess,
  onError,
  compact = true,
  mode = "maxKeys",
}: SyncLockStateButtonProps) {
  const [isWorking, setIsWorking] = useState(false);
  const { syncState, isSyncing } = useSyncLockSecurityState();
  const {
    syncState: syncTransferability,
    isSyncing: isSyncingTransferability,
  } = useSyncLockTransferabilityState();
  const { syncState: syncManager, isSyncing: isSyncingManager } =
    useSyncLockManagerState();

  const handleSync = async () => {
    setIsWorking(true);
    try {
      toast.loading("Syncing state...", { id: "sync-lock-state" });
      const result =
        mode === "manager"
          ? await syncManager({
              entityType,
              entityId,
              lockAddress: lockAddress as Address,
            })
          : mode === "transferability"
            ? await syncTransferability({
                entityType,
                entityId,
                lockAddress: lockAddress as Address,
              })
            : await syncState({
                entityType,
                entityId,
                lockAddress: lockAddress as Address,
              });

      if (!result.success) {
        throw new Error(result.error || "Failed to sync state");
      }

      toast.success("State synced", { id: "sync-lock-state" });
      onSuccess?.();
    } catch (error: any) {
      const message = error?.message || "Failed to sync state";
      toast.error(message, { id: "sync-lock-state" });
      onError?.(message);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Button
      onClick={handleSync}
      size={compact ? "sm" : "default"}
      variant="outline"
      className="border-amber-700 text-amber-200 hover:bg-amber-900/20"
      disabled={
        isWorking || isSyncing || isSyncingManager || isSyncingTransferability
      }
    >
      {isWorking ||
      isSyncing ||
      isSyncingManager ||
      isSyncingTransferability ? (
        <>
          <div className="w-3 h-3 border border-amber-200/20 border-t-amber-200 rounded-full animate-spin mr-2" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCcw className="w-3 h-3 mr-2" />
          Sync state
        </>
      )}
    </Button>
  );
}
