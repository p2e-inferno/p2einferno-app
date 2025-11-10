/**
 * useDailyCheckin Hook
 * Main orchestrator hook for daily check-in functionality
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { toast } from "react-hot-toast";
import {
  CheckinStatus,
  CheckinPreview,
  CheckinResult,
  UseDailyCheckinReturn,
} from "@/lib/checkin/core/types";
import { getDefaultCheckinService } from "@/lib/checkin";
import { useStreakData } from "./useStreakData";
import { useVisibilityAwarePoll } from "./useVisibilityAwarePoll";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useDailyCheckin");

export interface UseDailyCheckinOptions {
  userAddress?: string;
  userProfileId?: string;
  autoRefreshStatus?: boolean;
  statusRefreshInterval?: number;
  onCheckinSuccess?: (result: CheckinResult) => void;
  onCheckinError?: (error: string) => void;
  showToasts?: boolean;
}

export const useDailyCheckin = (
  userAddress: string,
  userProfileId: string,
  options: UseDailyCheckinOptions = {},
): UseDailyCheckinReturn => {
  const {
    autoRefreshStatus = true,
    statusRefreshInterval = 43200000, // 12 hours (daily check-in feature)
    onCheckinSuccess,
    onCheckinError,
    showToasts = true,
  } = options;

  // Privy for wallet connection
  const { user } = usePrivy();
  const writeWallet = usePrivyWriteWallet();

  // State
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(
    null,
  );
  const [checkinPreview, setCheckinPreview] = useState<CheckinPreview | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isPerformingCheckin, setIsPerformingCheckin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service instance
  const checkinService = useMemo(() => getDefaultCheckinService(), []);

  // Use streak data hook
  const handleStreakError = useCallback(
    (err: string) => {
      log.error("Streak data error", { userAddress, error: err });
      setError(err);
    },
    [userAddress],
  );

  const {
    streakInfo,
    isLoading: isStreakLoading,
    error: streakError,
    refetch: refetchStreak,
  } = useStreakData(userAddress, {
    autoRefresh: autoRefreshStatus,
    refreshInterval: statusRefreshInterval,
    onError: handleStreakError,
  });

  // Fetch check-in status
  const fetchCheckinStatus = useCallback(async () => {
    if (!userAddress) {
      log.warn("No user address provided for checkin status");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      log.debug("Fetching checkin status", { userAddress });

      const [status, preview] = await Promise.all([
        checkinService.getCheckinStatus(userAddress),
        checkinService.getCheckinPreview(userAddress),
      ]);

      setCheckinStatus(status);
      setCheckinPreview(preview);

      log.debug("Checkin status fetched", {
        userAddress,
        canCheckin: status.canCheckin,
        previewXP: preview.previewXP,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch checkin status";
      log.error("Error fetching checkin status", { userAddress, error: err });
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, checkinService]);

  // Perform daily check-in
  const performCheckin = useCallback(
    async (greeting: string = "GM"): Promise<CheckinResult> => {
      if (!userAddress || !userProfileId) {
        const error = "User address and profile ID are required";
        log.error("Missing required parameters for checkin", {
          userAddress,
          userProfileId,
        });
        return {
          success: false,
          xpEarned: 0,
          newStreak: 0,
          error,
        };
      }

      if (!writeWallet) {
        const error = "Wallet not connected";
        log.error("Wallet not connected for checkin", { userAddress });
        return {
          success: false,
          xpEarned: 0,
          newStreak: 0,
          error,
        };
      }

      try {
        setIsPerformingCheckin(true);
        setError(null);

        log.info("Starting daily checkin", {
          userAddress,
          userProfileId,
          greeting,
        });

        // Validate checkin eligibility
        if (!user?.wallet) {
          throw new Error("User wallet not available");
        }
        
        const validation = await checkinService.validateCheckin(
          userAddress,
          userProfileId,
          user.wallet,
        );

        if (!validation.isValid) {
          const error = validation.reason || "Checkin validation failed";
          log.warn("Checkin validation failed", {
            userAddress,
            reason: validation.reason,
          });

          if (showToasts) {
            toast.error(error);
          }

          onCheckinError?.(error);
          return {
            success: false,
            xpEarned: 0,
            newStreak: 0,
            error,
          };
        }

        // Perform the check-in
        const result = await checkinService.performCheckin(
          userAddress,
          userProfileId,
          greeting,
          writeWallet as any,
        );

        if (result.success) {
          log.info("Daily checkin successful", {
            userAddress,
            xpEarned: result.xpEarned,
            newStreak: result.newStreak,
            attestationUid: result.attestationUid,
          });

          // Show success toast
          if (showToasts) {
            toast.success(
              `Daily check-in complete! +${result.xpEarned} XP (Streak: ${result.newStreak} days)`,
            );
          }

          // Refresh status and streak data
          await Promise.all([fetchCheckinStatus(), refetchStreak()]);

          // Dispatch custom event to notify all other hook instances
          // This ensures all components stay in sync when check-in happens
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('checkin-success', {
                detail: { userAddress, userProfileId },
              })
            );
          }

          onCheckinSuccess?.(result);
        } else {
          log.error("Daily checkin failed", {
            userAddress,
            error: result.error,
          });

          if (showToasts) {
            toast.error(result.error || "Check-in failed");
          }

          onCheckinError?.(result.error || "Check-in failed");
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Unexpected error during check-in";
        log.error("Error performing checkin", { userAddress, error: err });

        if (showToasts) {
          toast.error(errorMessage);
        }

        onCheckinError?.(errorMessage);

        return {
          success: false,
          xpEarned: 0,
          newStreak: 0,
          error: errorMessage,
        };
      } finally {
        setIsPerformingCheckin(false);
      }
    },
    [
      userAddress,
      userProfileId,
      user?.wallet,
      checkinService,
      fetchCheckinStatus,
      refetchStreak,
      onCheckinSuccess,
      onCheckinError,
      showToasts,
    ],
  );

  // Refresh all status data
  const refreshStatus = useCallback(async () => {
    await Promise.all([fetchCheckinStatus(), refetchStreak()]);
  }, [fetchCheckinStatus, refetchStreak]);

  // Check if user can check in
  const canCheckinToday = useMemo(() => {
    return checkinStatus?.canCheckin ?? false;
  }, [checkinStatus]);

  // Check if user has already checked in today
  const hasCheckedInToday = useMemo(() => {
    return checkinStatus?.hasCheckedInToday ?? false;
  }, [checkinStatus]);

  // Get next check-in time
  const nextCheckinTime = useMemo(() => {
    return checkinStatus?.nextCheckinAvailable || null;
  }, [checkinStatus]);

  // Get time until next check-in
  const timeUntilNextCheckin = useMemo(() => {
    return checkinStatus?.timeUntilNextCheckin || null;
  }, [checkinStatus]);

  // Get preview XP amount
  const previewXP = useMemo(() => {
    return checkinPreview?.previewXP || 0;
  }, [checkinPreview]);

  // Combined loading state
  const isLoadingAny = useMemo(() => {
    return isLoading || isStreakLoading || isPerformingCheckin;
  }, [isLoading, isStreakLoading, isPerformingCheckin]);

  // Combined error state
  const combinedError = useMemo(() => {
    return error || streakError;
  }, [error, streakError]);

  // Initial data fetch
  useEffect(() => {
    if (userAddress) {
      fetchCheckinStatus();
    }
  }, [userAddress, fetchCheckinStatus]);

  // Auto refresh status with visibility awareness
  useVisibilityAwarePoll(
    fetchCheckinStatus,
    statusRefreshInterval,
    {
      enabled: autoRefreshStatus && !!userAddress,
    }
  );

  // Listen for check-in success events from other components
  // This ensures all components stay in sync when check-in happens anywhere
  useEffect(() => {
    if (!userAddress) return;

    const handleCheckinSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<{ userAddress: string; userProfileId: string }>;
      // Only refresh if the event is for this user
      if (customEvent.detail?.userAddress === userAddress) {
        log.debug('Received checkin-success event, refreshing status', { userAddress });
        fetchCheckinStatus();
        refetchStreak();
      }
    };

    window.addEventListener('checkin-success', handleCheckinSuccess);

    return () => {
      window.removeEventListener('checkin-success', handleCheckinSuccess);
    };
  }, [userAddress, fetchCheckinStatus, refetchStreak]);

  return {
    // Status data
    checkinStatus,
    streakInfo,
    checkinPreview,

    // Actions
    performCheckin,
    refreshStatus,

    // State
    isLoading: isLoadingAny,
    isPerformingCheckin,
    error: combinedError,

    // Convenience getters
    canCheckinToday,
    hasCheckedInToday,
    nextCheckinTime,
    timeUntilNextCheckin,
    previewXP,

    // Event handlers (for external use)
    onCheckinSuccess,
    onCheckinError,
  };
};
