"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useAddLockManager } from "@/hooks/unlock/useAddLockManager";
import { useAdminApi } from "@/hooks/useAdminApi";
import { toast } from "react-hot-toast";
import type { Address } from "viem";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("components:admin:lock-manager-retry-button");

interface LockManagerRetryButtonProps {
  entityType: "milestone" | "quest" | "cohort" | "bootcamp";
  entityId: string;
  lockAddress: string;
  grantFailureReason?: string | null;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  compact?: boolean; // Optional compact mode for smaller spaces
}

export default function LockManagerRetryButton({
  entityType,
  entityId,
  lockAddress,
  grantFailureReason,
  onSuccess,
  onError,
  compact = false,
}: LockManagerRetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const { addLockManager, isLoading } = useAddLockManager();
  const { adminFetch } = useAdminApi();

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      // Get server wallet address (server-side) via admin API to avoid leaking secrets on the client
      const serverResp = await adminFetch<{ serverWalletAddress: string }>(
        "/api/admin/server-wallet",
      );
      const serverWalletAddress = serverResp.data?.serverWalletAddress;
      if (serverResp.error || !serverWalletAddress) {
        throw new Error(
          serverResp.error || "Failed to fetch server wallet address",
        );
      }

      log.info("Starting lock manager grant retry", {
        entityType,
        entityId,
        lockAddress,
        serverWalletAddress,
      });

      // Execute blockchain transaction to grant lock manager role
      toast.loading("Granting lock manager role...", { id: "grant-manager" });

      const result = await addLockManager({
        lockAddress: lockAddress as Address,
        managerAddress: serverWalletAddress as Address,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to grant lock manager role");
      }

      log.info("Blockchain grant successful", {
        entityType,
        entityId,
        transactionHash: result.transactionHash,
      });

      toast.success("Lock manager role granted successfully!", {
        id: "grant-manager",
      });

      // Update database to mark grant as successful
      let updateResult;

      log.info("Updating database", { entityType, entityId });

      switch (entityType) {
        case "milestone":
          updateResult = await adminFetch("/api/admin/milestones", {
            method: "PUT",
            body: JSON.stringify({
              id: entityId,
              lock_manager_granted: true,
              grant_failure_reason: null,
            }),
          });
          break;

        case "quest":
          updateResult = await adminFetch(`/api/admin/quests/${entityId}`, {
            method: "PATCH",
            body: JSON.stringify({
              lock_manager_granted: true,
              grant_failure_reason: null,
            }),
          });
          break;

        case "cohort":
          updateResult = await adminFetch(`/api/admin/cohorts/${entityId}`, {
            method: "PUT",
            body: JSON.stringify({
              lock_manager_granted: true,
              grant_failure_reason: null,
            }),
          });
          break;

        case "bootcamp":
          updateResult = await adminFetch(`/api/admin/bootcamps/${entityId}`, {
            method: "PUT",
            body: JSON.stringify({
              lock_manager_granted: true,
              grant_failure_reason: null,
            }),
          });
          break;
      }

      if (updateResult?.error) {
        log.error("Database update failed", {
          entityType,
          entityId,
          error: updateResult.error,
        });
        throw new Error(
          "Blockchain grant succeeded but database update failed",
        );
      }

      log.info("Database update successful", { entityType, entityId });

      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.message || "Failed to retry grant";
      log.error("Lock manager retry failed", {
        entityType,
        entityId,
        error: errorMsg,
      });
      toast.error(errorMsg, { id: "grant-manager" });
      onError?.(errorMsg);
    } finally {
      setIsRetrying(false);
    }
  };

  if (compact) {
    return (
      <Button
        onClick={handleRetry}
        disabled={isRetrying || isLoading}
        size="sm"
        variant="outline"
        className="border-yellow-700 hover:bg-yellow-900/20 text-yellow-300"
      >
        {isRetrying || isLoading ? (
          <>
            <div className="w-3 h-3 border border-yellow-300/20 border-t-yellow-300 rounded-full animate-spin mr-2" />
            Retrying...
          </>
        ) : (
          <>
            <RefreshCw className="w-3 h-3 mr-2" />
            Retry Grant
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h4 className="text-red-300 font-semibold">
              Lock Manager Grant Failed
            </h4>
          </div>
          <p className="text-red-300 text-sm mb-2">
            The lock was deployed successfully, but the server wallet could not
            be granted lock manager permissions.
          </p>
          {grantFailureReason && (
            <div className="bg-red-950/50 border border-red-800 rounded p-2 mb-3">
              <p className="text-red-400 text-xs font-mono">
                {grantFailureReason}
              </p>
            </div>
          )}
          <p className="text-gray-400 text-xs">
            Click the button to retry granting the lock manager role to the
            server wallet.
          </p>
        </div>

        <Button
          onClick={handleRetry}
          disabled={isRetrying || isLoading}
          size="default"
          className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
        >
          {isRetrying || isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
              Retrying...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Grant
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
