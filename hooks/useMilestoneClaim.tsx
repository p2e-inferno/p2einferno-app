import { useState } from "react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

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
  const selectedWallet = useSmartWalletSelection();

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
      log.debug("Starting milestone key claim", {
        milestoneId: milestone.id,
        easEnabled,
      });

      const response = await fetch("/api/milestones/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          milestoneId: milestone.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error || "An unknown error occurred while claiming the key.";
        log.error("Milestone key claim failed", {
          milestoneId: milestone.id,
          status: response.status,
          error: errorMessage,
        });
        toast.error(errorMessage, { id: toastId });
        return;
      }

      log.info("Milestone key granted on-chain", {
        milestoneId: milestone.id,
        transactionHash: data.transactionHash,
        keyTokenId: data.keyTokenId,
        attestationRequired: data.attestationRequired,
      });

      let attestationScanUrl: string | null | undefined = null;
      let proofCancelled = false;

      if (easEnabled && data.attestationRequired) {
        const userAddress = selectedWallet?.address;
        if (!userAddress) {
          log.warn("Wallet not connected for milestone attestation", {
            milestoneId: milestone.id,
          });
          throw new Error("Wallet not connected");
        }

        const milestoneLockAddress =
          data.milestoneLockAddress ||
          milestone.lock_address ||
          "0x0000000000000000000000000000000000000000";
        const cohortLockAddress =
          data.cohortLockAddress ||
          "0x0000000000000000000000000000000000000000";
        const keyTokenId = BigInt(data.keyTokenId || "0");
        const grantTxHash =
          data.transactionHash ||
          "0x0000000000000000000000000000000000000000000000000000000000000000";
        const achievementDate = data.achievementDate
          ? BigInt(Math.floor(new Date(data.achievementDate).getTime() / 1000))
          : BigInt(Math.floor(Date.now() / 1000));

        log.debug("Building milestone achievement schema data", {
          milestoneId: milestone.id,
          milestoneTitle: data.milestoneTitle,
          userAddress,
          cohortLockAddress,
          milestoneLockAddress,
          keyTokenId: keyTokenId.toString(),
          grantTxHash,
          achievementDate: achievementDate.toString(),
          xpEarned: data.xpEarned,
        });

        try {
          const signature = await signAttestation({
            schemaKey: "milestone_achievement",
            recipient: userAddress,
            schemaData: [
              { name: "milestoneId", type: "string", value: String(milestone.id) },
              {
                name: "milestoneTitle",
                type: "string",
                value: data.milestoneTitle || "",
              },
              { name: "userAddress", type: "address", value: userAddress },
              {
                name: "cohortLockAddress",
                type: "address",
                value: cohortLockAddress,
              },
              {
                name: "milestoneLockAddress",
                type: "address",
                value: milestoneLockAddress,
              },
              { name: "keyTokenId", type: "uint256", value: keyTokenId },
              { name: "grantTxHash", type: "bytes32", value: grantTxHash },
              { name: "achievementDate", type: "uint256", value: achievementDate },
              {
                name: "xpEarned",
                type: "uint256",
                value: BigInt(data.xpEarned || 0),
              },
              { name: "skillLevel", type: "string", value: "" },
            ],
          });

          log.debug("Milestone achievement signature created, committing", {
            milestoneId: milestone.id,
          });

          const commitResp = await fetch("/api/milestones/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              milestoneId: milestone.id,
              attestationSignature: signature,
            }),
          });

          if (commitResp.ok) {
            const commitJson = await commitResp.json().catch(() => ({}));
            attestationScanUrl = commitJson?.attestationScanUrl || null;
            log.info("Milestone achievement attestation committed", {
              milestoneId: milestone.id,
              attestationUid: commitJson?.attestationUid,
              attestationScanUrl,
            });
          } else {
            const errorJson = await commitResp.json().catch(() => ({}));
            log.warn("Milestone achievement attestation commit failed", {
              milestoneId: milestone.id,
              status: commitResp.status,
              error: errorJson?.error || "Unknown error",
            });
          }
        } catch (err: any) {
          if (isUserRejected(err)) {
            proofCancelled = true;
            log.info("Milestone achievement attestation cancelled by user", {
              milestoneId: milestone.id,
            });
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

  return {
    isClaiming: isClaiming || isSigning,
    claimMilestoneKey,
  };
};
