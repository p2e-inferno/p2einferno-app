import React from "react";
import { toast } from "react-hot-toast";
import { useWallets } from "@privy-io/react-auth";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";

export default function MilestoneTaskClaimButton({
  taskId,
  milestone,
  reward,
  rewardClaimed,
  submittedAt,
  endDate,
  onClaimed,
}: {
  taskId: string;
  milestone: any;
  reward: number;
  rewardClaimed?: boolean;
  submittedAt?: string;
  endDate?: string;
  onClaimed: () => void;
}) {
  const { wallets } = useWallets();
  const { signAttestation, isSigning } = useGaslessAttestation();
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [claimed, setClaimed] = React.useState(rewardClaimed || false);
  const [isExpired, setIsExpired] = React.useState(false);

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

  // Compute expiry on mount based on submission time vs milestone deadline
  React.useEffect(() => {
    if (submittedAt && endDate) {
      const submitted = new Date(submittedAt).getTime();
      const deadline = new Date(endDate).getTime();
      setIsExpired(submitted > deadline);
    }
  }, [submittedAt, endDate]);

  const handleClaim = async () => {
    try {
      setIsClaiming(true);
      const easEnabled = isEASEnabled();
      const claimTimestamp = BigInt(Math.floor(Date.now() / 1000));

      let attestationSignature: any = null;

      if (easEnabled) {
        if (!wallets?.[0]?.address) {
          throw new Error("Wallet not connected");
        }
        const userAddress = wallets[0].address;
        const milestoneLockAddress =
          typeof milestone?.lock_address === "string"
            ? milestone.lock_address
            : null;
        if (!milestoneLockAddress) {
          throw new Error("Milestone lock address missing");
        }

        try {
          attestationSignature = await signAttestation({
            schemaKey: "milestone_task_reward_claim",
            recipient: userAddress,
            schemaData: [
              { name: "milestoneId", type: "string", value: milestone?.id },
              { name: "userAddress", type: "address", value: userAddress },
              {
                name: "milestoneLockAddress",
                type: "address",
                value: milestoneLockAddress,
              },
              {
                name: "rewardAmount",
                type: "uint256",
                value: BigInt(reward),
              },
              {
                name: "claimTimestamp",
                type: "uint256",
                value: claimTimestamp,
              },
            ],
          });
        } catch (err: any) {
          if (isUserRejected(err)) {
            throw new Error("Claim cancelled");
          }
          throw err;
        }
      }

      const resp = await fetch(`/api/user/task/${taskId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestationSignature }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.error === "Reward eligibility expired") {
          setIsExpired(true);
          toast.error(
            "Reward expired - submission was after milestone deadline",
          );
        } else {
          throw new Error(data.error || "Failed to claim");
        }
        return;
      }
      setClaimed(true);
      const scanUrl = data.attestationScanUrl;
      toast.success(
        <div className="text-sm leading-relaxed">
          Claimed {reward} xDG.
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
      );
      onClaimed();
    } catch (e: any) {
      toast.error(e.message || "Claim failed");
    } finally {
      setIsClaiming(false);
    }
  };

  if (claimed) {
    return (
      <button
        className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 cursor-not-allowed"
        disabled
      >
        Claimed
      </button>
    );
  }

  if (isExpired) {
    return (
      <button
        className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 cursor-not-allowed"
        disabled
      >
        Rewards Expired
      </button>
    );
  }

  return (
    <button
      onClick={handleClaim}
      disabled={isClaiming || isSigning}
      className="px-4 py-2 rounded-lg font-medium bg-cyan-400 text-black hover:bg-cyan-300 disabled:opacity-60"
    >
      {isClaiming || isSigning ? "Claiming..." : "Claim"}
    </button>
  );
}
