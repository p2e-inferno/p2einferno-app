/**
 * useDailyCheckin Hook
 * Main orchestrator hook for daily check-in functionality
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

// Minimal helper to detect the specific edge case where the user already
// checked in today. Keeps semantics clear without broad refactors.
const isAlreadyCheckedIn = (msg?: string): boolean =>
  typeof msg === "string" && msg.toLowerCase().includes("already checked in");

// Shared helper to refresh UI and notify other hook instances
const useRefreshUIAndNotifyPeers = (
  fetchCheckinStatus: () => Promise<void>,
  refetchStreak: () => Promise<void>,
  userAddress: string,
  userProfileId: string,
  originId: string
) =>
  useCallback(
    async (opts?: {
      event?: "checkin-success" | "checkin-complete";
      reason?: string;
      includeStatusRefresh?: boolean;
    }) => {
      try {
        await Promise.all([fetchCheckinStatus(), refetchStreak()]);
      } catch (err) {
        log.error("UI refresh failed", { error: err });
      }

      if (typeof window !== "undefined") {
        if (opts?.event === "checkin-success") {
          window.dispatchEvent(
            new CustomEvent("checkin-success", {
              detail: { userAddress, userProfileId, originId },
            })
          );
        }
        if (opts?.event === "checkin-complete") {
          window.dispatchEvent(
            new CustomEvent("checkin-complete", {
              detail: {
                userAddress,
                userProfileId,
                reason: opts?.reason,
                originId,
              },
            })
          );
        }
        if (opts?.includeStatusRefresh) {
          window.dispatchEvent(
            new CustomEvent("checkin-status-refresh", {
              detail: { userAddress, userProfileId, originId },
            })
          );
        }
      }
    },
    [fetchCheckinStatus, refetchStreak, userAddress, userProfileId, originId]
  );

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
  options: UseDailyCheckinOptions = {}
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
    null
  );
  const [checkinPreview, setCheckinPreview] = useState<CheckinPreview | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isPerformingCheckin, setIsPerformingCheckin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service instance
  const checkinService = useMemo(() => getDefaultCheckinService(), []);

  // Shared event detail shape for inter-instance communication
  type CheckinEventDetail = {
    userAddress: string;
    userProfileId: string;
    originId?: string;
    reason?: string;
  };

  // Unique origin per hook instance to avoid re-processing self-originated events
  const originRef = useRef<string>("");
  if (!originRef.current) {
    originRef.current = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  // Use streak data hook
  const handleStreakError = useCallback(
    (err: string) => {
      log.error("Streak data error", { userAddress, error: err });
      setError(err);
    },
    [userAddress]
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

  const refreshUIAndNotifyPeers = useRefreshUIAndNotifyPeers(
    fetchCheckinStatus,
    refetchStreak,
    userAddress,
    userProfileId,
    originRef.current
  );

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
          user.wallet
        );

        if (!validation.isValid) {
          const error = validation.reason || "Checkin validation failed";
          log.warn("Checkin validation failed", {
            userAddress,
            reason: validation.reason,
          });

          // If user already checked in, emit completion + refresh and use info toast
          if (isAlreadyCheckedIn(validation.reason)) {
            if (showToasts) {
              toast("Already checked in today");
            }

            await refreshUIAndNotifyPeers({
              event: "checkin-complete",
              reason: "already_checked_in",
              includeStatusRefresh: true,
            });

            onCheckinError?.(error);
            return {
              success: false,
              xpEarned: 0,
              newStreak: 0,
              error,
            };
          }

          // Non-edge-case failure: keep existing error behavior
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
          writeWallet as any
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
              `Daily check-in complete! +${result.xpEarned} XP (Streak: ${result.newStreak} days)`
            );
          }

          // Refresh UI and notify peers about successful check-in
          await refreshUIAndNotifyPeers({
            event: "checkin-success",
            includeStatusRefresh: true,
          });

          onCheckinSuccess?.(result);
        } else {
          log.error("Daily checkin failed", {
            userAddress,
            error: result.error,
          });

          const already = isAlreadyCheckedIn(result.error);

          if (showToasts) {
            if (already) {
              toast("Already checked in today");
            } else {
              toast.error(result.error || "Check-in failed");
            }
          }

          onCheckinError?.(result.error || "Check-in failed");

          // Refresh UI and notify peers for failure
          await refreshUIAndNotifyPeers({
            event: already ? "checkin-complete" : undefined,
            reason: already ? "already_checked_in" : undefined,
            includeStatusRefresh: true,
          });
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Unexpected error during check-in";
        log.error("Error performing checkin", { userAddress, error: err });

        const already = isAlreadyCheckedIn(errorMessage);
        if (showToasts) {
          if (already) {
            toast("Already checked in today");
          } else {
            toast.error(errorMessage);
          }
        }

        onCheckinError?.(errorMessage);

        // On error, refresh UI and notify peers to stay in sync
        await refreshUIAndNotifyPeers({
          event: already ? "checkin-complete" : undefined,
          reason: already ? "already_checked_in" : undefined,
          includeStatusRefresh: true,
        });

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
      refreshUIAndNotifyPeers,
      writeWallet,
      onCheckinSuccess,
      onCheckinError,
      showToasts,
    ]
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
  useVisibilityAwarePoll(fetchCheckinStatus, statusRefreshInterval, {
    enabled: autoRefreshStatus && !!userAddress,
  });

  // Listen for check-in events from other components to keep instances in sync
  useEffect(() => {
    if (!userAddress) return;

    const handleEvent = (event: Event) => {
      const customEvent = event as CustomEvent<CheckinEventDetail>;
      // Only refresh if the event is for this user
      if (
        customEvent.detail?.userAddress === userAddress &&
        customEvent.detail?.originId !== originRef.current
      ) {
        log.debug("Received check-in event, refreshing status", {
          userAddress,
        });
        fetchCheckinStatus();
        refetchStreak();
      }
    };

    window.addEventListener("checkin-status-refresh", handleEvent);

    return () => {
      window.removeEventListener("checkin-status-refresh", handleEvent);
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
