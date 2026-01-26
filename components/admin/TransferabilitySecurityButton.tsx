"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Shield } from "lucide-react";
import { useUpdateTransferFee } from "@/hooks/unlock/useUpdateTransferFee";
import { useAdminApi } from "@/hooks/useAdminApi";
import { toast } from "react-hot-toast";
import type { Address } from "viem";
import { getLogger } from "@/lib/utils/logger";
import { NON_TRANSFERABLE_FEE_BPS } from "@/hooks/unlock/useSyncLockTransferabilityState";

const log = getLogger("components:admin:transferability-security-button");

interface TransferabilitySecurityButtonProps {
  entityType: "milestone" | "quest" | "bootcamp" | "cohort";
  entityId: string;
  lockAddress: string;
  transferabilityFailureReason?: string | null;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  compact?: boolean;
}

/**
 * Renders a button/panel that enforces non-transferability by setting transferFeeBasisPoints to 10000,
 * then updates the corresponding backend entity to mark the change.
 */
export default function TransferabilitySecurityButton({
  entityType,
  entityId,
  lockAddress,
  transferabilityFailureReason,
  onSuccess,
  onError,
  compact = false,
}: TransferabilitySecurityButtonProps) {
  const [isSecuring, setIsSecuring] = useState(false);
  const { updateTransferFee, isLoading } = useUpdateTransferFee();
  const { adminFetch } = useAdminApi();

  const handleSecure = async () => {
    setIsSecuring(true);
    try {
      log.info("Starting transferability security update", {
        entityType,
        entityId,
        lockAddress,
      });

      toast.loading("Updating transferability...", {
        id: "secure-transferability",
      });

      const result = await updateTransferFee({
        lockAddress: lockAddress as Address,
        transferFeeBasisPoints: NON_TRANSFERABLE_FEE_BPS,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update transferability");
      }

      toast.success("Lock transfers disabled successfully!", {
        id: "secure-transferability",
      });

      let updateResult: Awaited<ReturnType<typeof adminFetch>> | undefined;
      switch (entityType) {
        case "milestone":
          updateResult = await adminFetch("/api/admin/milestones", {
            method: "PUT",
            body: JSON.stringify({
              id: entityId,
              transferability_secured: true,
              transferability_failure_reason: null,
            }),
          });
          break;
        case "quest":
          updateResult = await adminFetch(`/api/admin/quests/${entityId}`, {
            method: "PATCH",
            body: JSON.stringify({
              transferability_secured: true,
              transferability_failure_reason: null,
            }),
          });
          break;
        case "bootcamp":
          updateResult = await adminFetch(`/api/admin/bootcamps/${entityId}`, {
            method: "PUT",
            body: JSON.stringify({
              transferability_secured: true,
              transferability_failure_reason: null,
            }),
          });
          break;
        case "cohort":
          updateResult = await adminFetch(`/api/admin/cohorts`, {
            method: "PUT",
            body: JSON.stringify({
              id: entityId,
              transferability_secured: true,
              transferability_failure_reason: null,
            }),
          });
          break;
      }

      if (updateResult?.error) {
        throw new Error(
          "Blockchain update succeeded but database update failed",
        );
      }

      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error?.message || "Failed to disable transfers";
      log.error("Transferability security update failed", {
        entityType,
        entityId,
        error: errorMsg,
      });
      toast.error(errorMsg, { id: "secure-transferability" });
      onError?.(errorMsg);
    } finally {
      setIsSecuring(false);
    }
  };

  if (compact) {
    return (
      <Button
        onClick={handleSecure}
        disabled={isSecuring || isLoading}
        size="sm"
        variant="outline"
        className="border-orange-700 hover:bg-orange-900/20 text-orange-300"
      >
        {isSecuring || isLoading ? (
          <>
            <div className="w-3 h-3 border border-orange-300/20 border-t-orange-300 rounded-full animate-spin mr-2" />
            Disabling...
          </>
        ) : (
          <>
            <Shield className="w-3 h-3 mr-2" />
            Disable Transfers
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
            <h4 className="text-red-300 font-semibold">Security Risk</h4>
          </div>
          <p className="text-red-300 text-sm mb-2">
            This lock allows key transfers. Users can move keys between wallets,
            which undermines hasValidKey-based integrity checks.
          </p>
          {transferabilityFailureReason && (
            <div className="bg-red-950/50 border border-red-800 rounded p-2 mb-3">
              <p className="text-red-400 text-xs font-mono">
                {transferabilityFailureReason}
              </p>
            </div>
          )}
          <p className="text-gray-400 text-xs">
            Click the button to set transferFeeBasisPoints to 10000
            (non-transferable).
          </p>
        </div>

        <Button
          onClick={handleSecure}
          disabled={isSecuring || isLoading}
          size="default"
          className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
        >
          {isSecuring || isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
              Disabling...
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 mr-2" />
              Disable Transfers
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
