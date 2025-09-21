/**
 * Streak calculation module for daily check-ins
 * Implements StreakCalculatorStrategy interface for modularity
 */

import { 
  StreakCalculatorStrategy, 
  StreakInfo, 
  StreakConfig, 
  StreakCalculationError,
  StreakStatus
} from '../core/types';
import { supabase } from '@/lib/supabase';
import { P2E_SCHEMA_UIDS } from '@/lib/attestation/core/config';

// ================================
// Default Streak Calculator Implementation
// ================================

export class DefaultStreakCalculator implements StreakCalculatorStrategy {
  constructor(
    protected config: StreakConfig = {
      maxStreakGap: 24, // 24 hours before streak is broken
      timezone: 'UTC'
    }
  ) {}

  /**
   * Calculate current streak using existing database function
   */
  async calculateStreak(userAddress: string): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_user_checkin_streak', {
        user_address: userAddress
      });
      
      if (error) {
        throw new StreakCalculationError(
          `Failed to calculate streak: ${error.message}`,
          { userAddress, error }
        );
      }
      
      return data || 0;
    } catch (error) {
      if (error instanceof StreakCalculationError) {
        throw error;
      }
      throw new StreakCalculationError(
        'Unexpected error calculating streak',
        { userAddress, error }
      );
    }
  }

  /**
   * Determine if streak is broken based on timing
   */
  isStreakBroken(lastCheckin: Date, today: Date): boolean {
    const timeDifference = today.getTime() - lastCheckin.getTime();
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    
    return hoursDifference > this.config.maxStreakGap;
  }

  /**
   * Get comprehensive streak information
   */
  async getStreakInfo(userAddress: string): Promise<StreakInfo> {
    try {
      // Get current streak
      const currentStreak = await this.calculateStreak(userAddress);
      
      // Get last checkin information
      const { data: lastCheckinData, error: lastCheckinError } = await supabase
        .from('attestations')
        .select('created_at')
        .eq('recipient', userAddress)
        .eq('schema_uid', P2E_SCHEMA_UIDS.DAILY_CHECKIN)
        .eq('is_revoked', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCheckinError) {
        throw new StreakCalculationError(
          `Failed to get last checkin: ${lastCheckinError.message}`,
          { userAddress, error: lastCheckinError }
        );
      }

      const lastCheckinDate = lastCheckinData 
        ? new Date(lastCheckinData.created_at) 
        : null;

      // For now, use current streak as longest streak
      // This could be enhanced with a separate tracking mechanism
      const longestStreak = Math.max(currentStreak, 0);

      // Determine if streak is active
      const isActive = lastCheckinDate 
        ? !this.isStreakBroken(lastCheckinDate, new Date())
        : false;

      return {
        currentStreak,
        lastCheckinDate,
        longestStreak,
        isActive
      };
    } catch (error) {
      if (error instanceof StreakCalculationError) {
        throw error;
      }
      throw new StreakCalculationError(
        'Failed to get streak info',
        { userAddress, error }
      );
    }
  }

  /**
   * Validate if a new checkin would continue the streak
   */
  async validateStreakContinuity(userAddress: string, checkinDate: Date): Promise<boolean> {
    try {
      const streakInfo = await this.getStreakInfo(userAddress);
      
      // If no previous checkin, this starts a new streak
      if (!streakInfo.lastCheckinDate) {
        return true;
      }

      // Check if the gap is within acceptable range
      return !this.isStreakBroken(streakInfo.lastCheckinDate, checkinDate);
    } catch (error) {
      throw new StreakCalculationError(
        'Failed to validate streak continuity',
        { userAddress, checkinDate, error }
      );
    }
  }

  /**
   * Get streak status for UI display
   */
  async getStreakStatus(userAddress: string): Promise<StreakStatus> {
    try {
      const streakInfo = await this.getStreakInfo(userAddress);
      
      if (streakInfo.currentStreak === 0) {
        return 'new';
      }

      if (!streakInfo.isActive) {
        return 'broken';
      }

      // Check if streak is at risk (within last few hours of breaking)
      if (streakInfo.lastCheckinDate) {
        const now = new Date();
        const timeSinceLastCheckin = now.getTime() - streakInfo.lastCheckinDate.getTime();
        const hoursUntilBreak = this.config.maxStreakGap - (timeSinceLastCheckin / (1000 * 60 * 60));
        
        if (hoursUntilBreak <= 3) { // At risk if less than 3 hours remaining
          return 'at_risk';
        }
      }

      return 'active';
    } catch (error) {
      throw new StreakCalculationError(
        'Failed to get streak status',
        { userAddress, error }
      );
    }
  }

  /**
   * Get time until streak expires (in milliseconds)
   */
  async getTimeUntilStreakExpires(userAddress: string): Promise<number | null> {
    try {
      const streakInfo = await this.getStreakInfo(userAddress);
      
      if (!streakInfo.lastCheckinDate || !streakInfo.isActive) {
        return null;
      }

      const now = new Date();
      const expirationTime = new Date(
        streakInfo.lastCheckinDate.getTime() + (this.config.maxStreakGap * 60 * 60 * 1000)
      );
      
      const timeRemaining = expirationTime.getTime() - now.getTime();
      return Math.max(0, timeRemaining);
    } catch (error) {
      throw new StreakCalculationError(
        'Failed to calculate time until streak expires',
        { userAddress, error }
      );
    }
  }
}

// ================================
// Alternative Implementation: Enhanced Streak Calculator
// ================================

export class EnhancedStreakCalculator extends DefaultStreakCalculator {
  /**
   * Enhanced version that tracks longest streaks separately
   */
  override async getStreakInfo(userAddress: string): Promise<StreakInfo> {
    const baseInfo = await super.getStreakInfo(userAddress);
    
    // Calculate longest streak by analyzing all checkins
    const longestStreak = await this.calculateLongestStreak(userAddress);
    
    return {
      ...baseInfo,
      longestStreak: Math.max(longestStreak, baseInfo.currentStreak)
    };
  }

  private async calculateLongestStreak(userAddress: string): Promise<number> {
    try {
      // Get all checkins ordered by date
      const { data: checkins, error } = await supabase
        .from('attestations')
        .select('created_at')
        .eq('recipient', userAddress)
        .eq('schema_uid', P2E_SCHEMA_UIDS.DAILY_CHECKIN)
        .eq('is_revoked', false)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      if (!checkins || checkins.length === 0) {
        return 0;
      }

      const firstCheckin = checkins[0];
      if (!firstCheckin) {
        return 0;
      }

      let maxStreak = 1;
      let currentStreak = 1;
      let lastDate = new Date(firstCheckin.created_at);

      for (let i = 1; i < checkins.length; i++) {
        const entry = checkins[i];
        if (!entry) {
          continue;
        }

        const currentDate = new Date(entry.created_at);
        
        // Check if dates are consecutive days
        const daysDifference = Math.floor(
          (currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDifference === 1) {
          // Consecutive day
          currentStreak++;
        } else if (daysDifference === 0) {
          // Same day (multiple checkins), don't increment
          continue;
        } else {
          // Gap in checkins, reset streak
          maxStreak = Math.max(maxStreak, currentStreak);
          currentStreak = 1;
        }

        lastDate = currentDate;
      }

      return Math.max(maxStreak, currentStreak);
    } catch (error) {
      // Fallback to base implementation if enhanced calculation fails
      return 0;
    }
  }
}

// ================================
// Timezone-aware Streak Calculator
// ================================

export class TimezoneAwareStreakCalculator extends DefaultStreakCalculator {
  constructor(
    config: StreakConfig & { userTimezone?: string } = {
      maxStreakGap: 24,
      timezone: 'UTC',
      userTimezone: 'UTC'
    }
  ) {
    super(config);
  }

  /**
   * Check if checkin happened today in user's timezone
   */
  async hasCheckedInToday(userAddress: string): Promise<boolean> {
    try {
      // Query for checkins today
      const { data, error } = await supabase.rpc('has_checked_in_today', {
        user_address: userAddress
      });

      if (error) {
        throw new Error(error.message);
      }

      return data || false;
    } catch (error) {
      throw new StreakCalculationError(
        'Failed to check today\'s checkin status',
        { userAddress, error }
      );
    }
  }

  /**
   * Get next available checkin time in user's timezone
   */
  async getNextCheckinTime(userAddress: string, userTimezone?: string): Promise<Date | null> {
    try {
      const hasCheckedIn = await this.hasCheckedInToday(userAddress);
      
      if (!hasCheckedIn) {
        return new Date(); // Can checkin now
      }

      // Calculate next day start time in user's timezone
      const timezone = userTimezone || this.config.timezone || 'UTC';
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Set to start of day in user's timezone
      const tomorrowStart = new Date(tomorrow.toLocaleString('en-US', { timeZone: timezone }));
      tomorrowStart.setHours(0, 0, 0, 0);
      
      return tomorrowStart;
    } catch (error) {
      throw new StreakCalculationError(
        'Failed to calculate next checkin time',
        { userAddress, error }
      );
    }
  }
}

// ================================
// Factory Functions
// ================================

export const createStreakCalculator = (config?: StreakConfig): StreakCalculatorStrategy => {
  return new DefaultStreakCalculator(config);
};

export const createEnhancedStreakCalculator = (config?: StreakConfig): StreakCalculatorStrategy => {
  return new EnhancedStreakCalculator(config);
};

export const createTimezoneAwareStreakCalculator = (
  config?: StreakConfig & { userTimezone?: string }
): StreakCalculatorStrategy => {
  return new TimezoneAwareStreakCalculator(config);
};

// ================================
// Utility Functions
// ================================

export const getStreakEmoji = (streak: number): string => {
  if (streak === 0) return '🌱';
  if (streak < 7) return '🔥';
  if (streak < 30) return '⚡';
  if (streak < 100) return '💎';
  return '👑';
};

export const getStreakMessage = (streak: number): string => {
  if (streak === 0) return 'Start your journey!';
  if (streak === 1) return 'Great start!';
  if (streak < 7) return 'Building momentum!';
  if (streak === 7) return 'One week strong!';
  if (streak < 30) return 'Consistency is key!';
  if (streak === 30) return 'One month achieved!';
  if (streak < 100) return 'Dedication paying off!';
  if (streak === 100) return 'Century milestone!';
  return 'Legendary dedication!';
};

export const formatStreakDuration = (streak: number): string => {
  if (streak < 7) {
    return `${streak} day${streak !== 1 ? 's' : ''}`;
  } else if (streak < 30) {
    const weeks = Math.floor(streak / 7);
    const days = streak % 7;
    return `${weeks} week${weeks !== 1 ? 's' : ''}${days > 0 ? ` ${days} day${days !== 1 ? 's' : ''}` : ''}`;
  } else {
    const months = Math.floor(streak / 30);
    const days = streak % 30;
    return `${months} month${months !== 1 ? 's' : ''}${days > 0 ? ` ${days} day${days !== 1 ? 's' : ''}` : ''}`;
  }
};
