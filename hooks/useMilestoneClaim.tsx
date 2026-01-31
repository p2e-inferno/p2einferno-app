import { useState } from "react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";

const log = getLogger("hooks:useMilestoneClaim");

interface UseMilestoneClaimProps {
  milestone: {
    id: string;
    name: string;
    total_reward?: number;
    lock_address?: string | null;
    user_progress?: { reward_amount?: number } | null;
  };
  onSuccess: () => void; // Callback to refetch data after a successful claim
}

/**
 * A hook to manage the state and logic for claiming a milestone key.
 * It handles the API call, loading states, and user feedback via toasts.
 *
 * @param milestoneId - The ID of the milestone to be claimed.
 * @param onSuccess - A callback function to execute after a successful claim, typically to refetch data.
 */
export const useMilestoneClaim = ({
  milestone,
  onSuccess,
}: UseMilestoneClaimProps) => {
  const [isClaiming, setIsClaiming] = useState(false);
  const { signAttestation, isSigning } = useGaslessAttestation();

  const isUserRejected = (err: any): boolean => {
    const code = (err?.code ?? err?.error?.code) as any;
    const name = (err?.name || "").toString().toLowerCase();
    const msg = (err?.message || "").toString().toLowerCase();
    return (
      code === 4001 ||
      code === "ACTION_REJECTED" ||
      name.includes("userrejected") ||
      msg.includes("user rejected") ||
      msg.includes("rejected") ||
      msg.includes("denied") ||
      msg.includes("cancel") ||
      msg.includes("canceled") ||
      msg.includes("cancelled")
    );
  };

  const claimMilestoneKey = async () => {
    if (!milestone?.id) {
      toast.error("Milestone ID is missing.");
      return;
    }

    setIsClaiming(true);
    const toastId = toast.loading("Claiming your milestone key on-chain...");

    try {
      const easEnabled = isEASEnabled();
      const response = await fetch("/api/milestones/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Assuming the browser sends the auth cookie automatically
        },
        body: JSON.stringify({
          milestoneId: milestone.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error || "An unknown error occurred while claiming the key.";
        toast.error(errorMessage, { id: toastId });
        return;
      }

      let attestationScanUrl: string | null | undefined = null;
      let proofCancelled = false;

      if (easEnabled && data.attestationRequired && data.attestationPayload) {
        try {
          const signature = await signAttestation({
            schemaKey: data.attestationPayload.schemaKey,
            recipient: data.attestationPayload.recipient,
            schemaData: data.attestationPayload.schemaData,
          });

          const commitResp = await fetch("/api/milestones/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              milestoneId: milestone.id,
              attestationSignature: signature,
            }),
          });
          const commitJson = await commitResp.json().catch(() => ({}));
          attestationScanUrl = commitJson?.attestationScanUrl || null;
        } catch (err: any) {
          if (isUserRejected(err)) {
            proofCancelled = true;
          } else {
            throw err;
          }
        }
      }

      toast.success(
        <div className="text-sm leading-relaxed">
          Milestone key granted successfully!
          {proofCancelled && (
            <div className="text-xs mt-1 text-gray-300">
              Completion proof cancelled — claim completed.
            </div>
          )}
          {attestationScanUrl && (
            <div className="text-xs mt-1 break-all">
              <a
                href={attestationScanUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-500 underline"
              >
                View attestation on EAS Scan
              </a>
            </div>
          )}
        </div>,
        { id: toastId },
      );

      // Call the success callback to refresh the UI data
      onSuccess();
    } catch (error: any) {
      log.error("Failed to claim milestone key:", error);
      const errorMessage =
        error.message || "An unknown error occurred while claiming the key.";
      toast.error(errorMessage, { id: toastId });
      // Don't re-throw the error to prevent runtime error overlay
    } finally {
      setIsClaiming(false);
    }
  };

  return { isClaiming: isClaiming || isSigning, claimMilestoneKey };
};
