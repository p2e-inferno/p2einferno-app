/**
 * useStreakData Hook
 * Manages streak information and multiplier tier data
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  StreakInfo,
  MultiplierTier,
  UseStreakDataReturn,
  StreakStatus,
} from "@/lib/checkin/core/types";
import { getDefaultCheckinService } from "@/lib/checkin";
import { useVisibilityAwarePoll } from "./useVisibilityAwarePoll";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:useStreakData");

export interface UseStreakDataOptions {
  userAddress?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  onStreakUpdate?: (streakInfo: StreakInfo) => void;
  onError?: (error: string) => void;
}

export const useStreakData = (
  userAddress: string,
  options: UseStreakDataOptions = {},
): UseStreakDataReturn => {
  const {
    autoRefresh = false,
    refreshInterval = 60000, // 1 minute
    onStreakUpdate,
    onError,
  } = options;

  // State
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service instance
  const checkinService = useMemo(() => getDefaultCheckinService(), []);

  // Fetch streak data
  const fetchStreakData = useCallback(async () => {
    if (!userAddress) {
      log.warn("No user address provided for streak data");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      log.debug("Fetching streak data", { userAddress });

      const data = await checkinService.getStreakInfo(userAddress);

      setStreakInfo(data);
      onStreakUpdate?.(data);

      log.debug("Streak data fetched successfully", {
        userAddress,
        streakInfo: data,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch streak data";
      log.error("Error fetching streak data", { userAddress, error: err });

      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, checkinService, onStreakUpdate, onError]);

  // Get current tier information
  const getCurrentTier = useCallback((): MultiplierTier | null => {
    if (!streakInfo) return null;

    return checkinService.getCurrentTier(streakInfo.currentStreak);
  }, [streakInfo, checkinService]);

  // Get next tier information
  const getNextTier = useCallback((): MultiplierTier | null => {
    if (!streakInfo) return null;

    return checkinService.getNextTier(streakInfo.currentStreak);
  }, [streakInfo, checkinService]);

  // Get progress to next tier (0-1)
  const getProgressToNextTier = useCallback((): number => {
    if (!streakInfo) return 0;

    return checkinService.getProgressToNextTier(streakInfo.currentStreak);
  }, [streakInfo, checkinService]);

  // Get current multiplier
  const getCurrentMultiplier = useCallback((): number => {
    if (!streakInfo) return 1.0;

    return checkinService.getCurrentMultiplier(streakInfo.currentStreak);
  }, [streakInfo, checkinService]);

  // Get streak status
  const getStreakStatus = useCallback((): StreakStatus => {
    if (!streakInfo) return "new";

    if (streakInfo.currentStreak === 0) return "new";
    if (!streakInfo.isActive) return "broken";

    // Check if at risk (within last few hours)
    if (streakInfo.lastCheckinDate) {
      const now = new Date();
      const timeSinceLastCheckin =
        now.getTime() - streakInfo.lastCheckinDate.getTime();
      const hoursUntilBreak = 24 - timeSinceLastCheckin / (1000 * 60 * 60);

      if (hoursUntilBreak <= 3) return "at_risk";
    }

    return "active";
  }, [streakInfo]);

  // Get time until streak expires
  const getTimeUntilExpiration = useCallback((): number | null => {
    if (!streakInfo?.lastCheckinDate || !streakInfo.isActive) return null;

    const now = new Date();
    const expirationTime = new Date(
      streakInfo.lastCheckinDate.getTime() + 24 * 60 * 60 * 1000,
    );
    const timeRemaining = expirationTime.getTime() - now.getTime();

    return Math.max(0, timeRemaining);
  }, [streakInfo]);

  // Manual refresh function
  const refetch = useCallback(async () => {
    await fetchStreakData();
  }, [fetchStreakData]);

  const currentTier = useMemo(() => getCurrentTier(), [getCurrentTier]);
  const nextTier = useMemo(() => getNextTier(), [getNextTier]);
  const progress = useMemo(
    () => getProgressToNextTier(),
    [getProgressToNextTier],
  );
  const multiplier = useMemo(
    () => getCurrentMultiplier(),
    [getCurrentMultiplier],
  );
  const status = useMemo(() => getStreakStatus(), [getStreakStatus]);
  const timeUntilExpiration = useMemo(
    () => getTimeUntilExpiration(),
    [getTimeUntilExpiration],
  );

  // Initial fetch
  useEffect(() => {
    if (userAddress) {
      fetchStreakData();
    }
  }, [userAddress, fetchStreakData]);

  // Auto refresh interval with visibility awareness
  useVisibilityAwarePoll(
    fetchStreakData,
    refreshInterval,
    {
      enabled: autoRefresh && !!userAddress,
    }
  );

  return {
    streakInfo,
    isLoading,
    error,
    refetch,
    getCurrentTier,
    getNextTier,
    getProgressToNextTier,
    getCurrentMultiplier,
    getStreakStatus,
    getTimeUntilExpiration,
    currentTier,
    nextTier,
    progress,
    multiplier,
    status,
    timeUntilExpiration,
  };
};
