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
  useSyncLockManagerState,
  type LockManagerEntityType,
} from "@/hooks/unlock/useSyncLockManagerState";

type SyncMode = "maxKeys" | "manager";

type EntityType = LockSecurityEntityType | LockManagerEntityType;

interface SyncLockStateButtonProps {
  entityType: EntityType;
  entityId: string;
  lockAddress: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  compact?: boolean;
  mode?: SyncMode;
}

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
      disabled={isWorking || isSyncing || isSyncingManager}
    >
      {isWorking || isSyncing || isSyncingManager ? (
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
