import { useState } from "react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useWallets } from "@privy-io/react-auth";
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
  const { wallets } = useWallets();
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
      let attestationSignature: any = null;

      // UX: when EAS is enabled, signing is required. Canceling the signature == canceling the claim.
      if (easEnabled) {
        const wallet = wallets?.[0];
        if (!wallet?.address) {
          throw new Error("Wallet not connected");
        }

        try {
          const userAddress = wallet.address;
          const achievementDate = BigInt(Math.floor(Date.now() / 1000));
          const xpEarned = BigInt(
            milestone?.user_progress?.reward_amount ??
              milestone?.total_reward ??
              0,
          );
          const cohortLockAddress =
            "0x0000000000000000000000000000000000000000";
          const milestoneLockAddress =
            typeof milestone?.lock_address === "string" && milestone.lock_address
              ? milestone.lock_address
              : "0x0000000000000000000000000000000000000000";
          const keyTokenId = 0n;
          const grantTxHash =
            "0x0000000000000000000000000000000000000000000000000000000000000000";

          attestationSignature = await signAttestation({
            schemaKey: "milestone_achievement",
            recipient: userAddress,
            schemaData: [
              { name: "milestoneId", type: "string", value: milestone.id },
              {
                name: "milestoneTitle",
                type: "string",
                value: milestone.name,
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
              {
                name: "achievementDate",
                type: "uint256",
                value: achievementDate,
              },
              { name: "xpEarned", type: "uint256", value: xpEarned },
              { name: "skillLevel", type: "string", value: "" },
            ],
          });
        } catch (err: any) {
          if (isUserRejected(err)) {
            throw new Error("Claim cancelled");
          }
          throw err;
        }
      }

      const response = await fetch("/api/milestones/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Assuming the browser sends the auth cookie automatically
        },
        body: JSON.stringify({
          milestoneId: milestone.id,
          attestationSignature,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          data.error || "An unknown error occurred while claiming the key.";
        toast.error(errorMessage, { id: toastId });
        return;
      }

      const scanUrl = data.attestationScanUrl;
      toast.success(
        <div className="text-sm leading-relaxed">
          Milestone key granted successfully!
          {scanUrl && (
            <div className="text-xs mt-1 break-all">
              <a
                href={scanUrl}
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
