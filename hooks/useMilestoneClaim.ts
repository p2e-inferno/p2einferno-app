import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useMilestoneClaim');


interface UseMilestoneClaimProps {
  milestoneId: string;
  onSuccess: () => void; // Callback to refetch data after a successful claim
}

/**
 * A hook to manage the state and logic for claiming a milestone key.
 * It handles the API call, loading states, and user feedback via toasts.
 *
 * @param milestoneId - The ID of the milestone to be claimed.
 * @param onSuccess - A callback function to execute after a successful claim, typically to refetch data.
 */
export const useMilestoneClaim = ({ milestoneId, onSuccess }: UseMilestoneClaimProps) => {
  const [isClaiming, setIsClaiming] = useState(false);

  const claimMilestoneKey = async () => {
    if (!milestoneId) {
      toast.error("Milestone ID is missing.");
      return;
    }

    setIsClaiming(true);
    const toastId = toast.loading("Claiming your milestone key on-chain...");

    try {
      const response = await fetch('/api/milestones/claim', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Assuming the browser sends the auth cookie automatically
        },
        body: JSON.stringify({ milestoneId }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMessage = data.error || "An unknown error occurred while claiming the key.";
        toast.error(errorMessage, { id: toastId });
        return;
      }
      
      toast.success("Milestone key granted successfully! Your achievement is now on-chain.", { id: toastId });
      
      // Call the success callback to refresh the UI data
      onSuccess();

    } catch (error: any) {
      log.error("Failed to claim milestone key:", error);
      const errorMessage = error.message || "An unknown error occurred while claiming the key.";
      toast.error(errorMessage, { id: toastId });
      // Don't re-throw the error to prevent runtime error overlay
    } finally {
      setIsClaiming(false);
    }
  };

  return { isClaiming, claimMilestoneKey };
};
