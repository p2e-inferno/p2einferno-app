import React from "react";
import { toast } from "react-hot-toast";

export default function MilestoneTaskClaimButton({ taskId, milestone: _milestone, reward, rewardClaimed, onClaimed }: {
  taskId: string;
  milestone: any;
  reward: number;
  rewardClaimed?: boolean;
  onClaimed: () => void
}) {
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [claimed, setClaimed] = React.useState(rewardClaimed || false);
  const [isExpired, setIsExpired] = React.useState(false);

  const handleClaim = async () => {
    try {
      setIsClaiming(true);
      const resp = await fetch(`/api/user/task/${taskId}/claim`, { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) {
        if (data.error === 'Reward eligibility expired') {
          setIsExpired(true);
          toast.error('Reward expired - submission was after milestone deadline');
        } else {
          throw new Error(data.error || 'Failed to claim');
        }
        return;
      }
      setClaimed(true);
      toast.success(`Claimed ${reward} DGT`);
      onClaimed();
    } catch (e: any) {
      toast.error(e.message || 'Claim failed');
    } finally {
      setIsClaiming(false);
    }
  };

  if (claimed) {
    return (
      <button className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 cursor-not-allowed" disabled>
        Claimed
      </button>
    );
  }

  if (isExpired) {
    return (
      <button className="px-4 py-2 rounded-lg font-medium bg-gray-700 text-gray-300 cursor-not-allowed" disabled>
        Expired
      </button>
    );
  }

  return (
    <button onClick={handleClaim} disabled={isClaiming} className="px-4 py-2 rounded-lg font-medium bg-cyan-400 text-black hover:bg-cyan-300 disabled:opacity-60">
      {isClaiming ? 'Claiming...' : 'Claim'}
    </button>
  );
}