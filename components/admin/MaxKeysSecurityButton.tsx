"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle } from "lucide-react";
import { useUpdateMaxKeysPerAddress } from "@/hooks/unlock/useUpdateMaxKeysPerAddress";
import { useAdminApi } from "@/hooks/useAdminApi";
import { toast } from "react-hot-toast";
import type { Address } from "viem";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("components:admin:max-keys-security-button");

interface MaxKeysSecurityButtonProps {
  entityType: "milestone" | "quest" | "bootcamp";
  entityId: string;
  lockAddress: string;
  maxKeysFailureReason?: string | null;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  compact?: boolean; // Optional compact mode for smaller spaces
}

export default function MaxKeysSecurityButton({
  entityType,
  entityId,
  lockAddress,
  maxKeysFailureReason,
  onSuccess,
  onError,
  compact = false,
}: MaxKeysSecurityButtonProps) {
  const [isSecuring, setIsSecuring] = useState(false);
  const { updateMaxKeysPerAddress, isLoading } = useUpdateMaxKeysPerAddress();
  const { adminFetch } = useAdminApi();

  const handleSecure = async () => {
    setIsSecuring(true);

    try {
      log.info("Starting purchase-disable security update", {
        entityType,
        entityId,
        lockAddress,
      });

      // Execute blockchain transaction to disable purchases (maxNumberOfKeys = 0)
      toast.loading("Updating lock configuration...", {
        id: "secure-max-keys",
      });

      const result = await updateMaxKeysPerAddress({
        lockAddress: lockAddress as Address,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to update lock configuration");
      }

      log.info("Blockchain update successful", {
        entityType,
        entityId,
        transactionHash: result.transactionHash,
      });

      toast.success("Lock purchases disabled successfully!", {
        id: "secure-max-keys",
      });

      // Update database to mark security as successful
      let updateResult;

      log.info("Updating database", { entityType, entityId });

      switch (entityType) {
        case "milestone":
          updateResult = await adminFetch("/api/admin/milestones", {
            method: "PUT",
            body: JSON.stringify({
              id: entityId,
              max_keys_secured: true,
              max_keys_failure_reason: null,
            }),
          });
          break;

        case "quest":
          updateResult = await adminFetch(`/api/admin/quests/${entityId}`, {
            method: "PATCH",
            body: JSON.stringify({
              max_keys_secured: true,
              max_keys_failure_reason: null,
            }),
          });
          break;

        case "bootcamp":
          updateResult = await adminFetch(`/api/admin/bootcamps/${entityId}`, {
            method: "PUT",
            body: JSON.stringify({
              max_keys_secured: true,
              max_keys_failure_reason: null,
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
          "Blockchain update succeeded but database update failed",
        );
      }

      log.info("Database update successful", { entityType, entityId });

      onSuccess?.();
    } catch (error: any) {
      const errorMsg = error.message || "Failed to disable purchases";
      log.error("Purchase-disable security update failed", {
        entityType,
        entityId,
        error: errorMsg,
      });
      toast.error(errorMsg, { id: "secure-max-keys" });
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
            Disable Purchases
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
            This lock allows purchases. Users can bypass server-side validation
            by directly purchasing keys if they know the lock address.
          </p>
          {maxKeysFailureReason && (
            <div className="bg-red-950/50 border border-red-800 rounded p-2 mb-3">
              <p className="text-red-400 text-xs font-mono">
                {maxKeysFailureReason}
              </p>
            </div>
          )}
          <p className="text-gray-400 text-xs">
            Click the button to set maxNumberOfKeys to 0 and disable purchases.
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
              Disable Purchases
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
