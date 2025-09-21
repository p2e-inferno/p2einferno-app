/**
 * Daily Check-in Hooks - Public API
 * Main entry point for all daily check-in React hooks
 */

// Main hooks
export { useStreakData } from './useStreakData';
export { useDailyCheckin } from './useDailyCheckin';

// Hook option types
export type { UseStreakDataOptions } from './useStreakData';
export type { UseDailyCheckinOptions } from './useDailyCheckin';

// Re-export hook return types from core types
export type { 
  UseStreakDataReturn,
  UseDailyCheckinReturn 
} from '@/lib/checkin/core/types';

// Convenience hooks and utilities
import { useMemo } from 'react';
import { useStreakData } from './useStreakData';
import { useDailyCheckin } from './useDailyCheckin';
import { formatStreakDuration, getStreakEmoji, getStreakMessage } from '@/lib/checkin';

/**
 * Combined hook that provides both streak data and check-in functionality
 */
export const useCheckinWithStreak = (
  userAddress: string,
  userProfileId: string,
  options: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    showToasts?: boolean;
    onCheckinSuccess?: (result: any) => void;
    onCheckinError?: (error: string) => void;
  } = {}
) => {
  const streakData = useStreakData(userAddress, {
    autoRefresh: options.autoRefresh,
    refreshInterval: options.refreshInterval
  });

  const checkinData = useDailyCheckin(userAddress, userProfileId, {
    autoRefreshStatus: options.autoRefresh,
    statusRefreshInterval: options.refreshInterval,
    showToasts: options.showToasts,
    onCheckinSuccess: options.onCheckinSuccess,
    onCheckinError: options.onCheckinError
  });

  return {
    ...streakData,
    ...checkinData,
    // Computed values for convenience
    streakEmoji: getStreakEmoji(streakData.streakInfo?.currentStreak || 0),
    streakMessage: getStreakMessage(streakData.streakInfo?.currentStreak || 0),
    streakDuration: formatStreakDuration(streakData.streakInfo?.currentStreak || 0)
  };
};

/**
 * Hook for displaying streak information in read-only mode
 */
export const useStreakDisplay = (userAddress: string) => {
  const { streakInfo, currentTier, nextTier, progress, multiplier } = useStreakData(userAddress);

  const displayData = useMemo(() => {
    const streak = streakInfo?.currentStreak || 0;
    
    return {
      streak,
      emoji: getStreakEmoji(streak),
      message: getStreakMessage(streak),
      duration: formatStreakDuration(streak),
      tier: currentTier,
      nextTier,
      progress,
      multiplier,
      isActive: streakInfo?.isActive || false
    };
  }, [streakInfo, currentTier, nextTier, progress, multiplier]);

  return displayData;
};

/**
 * Hook for getting check-in eligibility without full state management
 */
export const useCheckinEligibility = (userAddress: string) => {
  const { canCheckinToday, hasCheckedInToday, nextCheckinTime, previewXP, error } = useDailyCheckin(
    userAddress,
    '', // No profile ID needed for eligibility check
    { showToasts: false }
  );

  return {
    canCheckin: canCheckinToday,
    hasCheckedIn: hasCheckedInToday,
    nextCheckinTime,
    previewXP,
    error
  };
};
