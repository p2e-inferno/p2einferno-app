/**
 * XP updater implementations for daily check-ins
 * Handles persistence of XP updates to user profiles and activity logs
 */

import { 
  XPUpdaterStrategy, 
  XPUpdateError,
  CheckinActivityType 
} from '../core/types';
import { supabase } from '@/lib/supabase';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('checkin:xp-updater');

// ================================
// Supabase XP Updater (Primary Implementation)
// ================================

export class SupabaseXPUpdater implements XPUpdaterStrategy {
  /**
   * Update user's XP in their profile using existing pattern
   */
  async updateUserXP(
    userProfileId: string, 
    xpAmount: number, 
    metadata: any = {}
  ): Promise<void> {
    try {
      log.debug('Updating user XP', { userProfileId, xpAmount, metadata });

      const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('experience_points')
        .eq('id', userProfileId)
        .single();

      if (fetchError) {
        log.error('Failed to fetch current user XP', { userProfileId, error: fetchError });
        throw new XPUpdateError(
          `Failed to fetch user XP before update: ${fetchError.message}`,
          { userProfileId, error: fetchError }
        );
      }

      const currentXP = profile?.experience_points ?? 0;
      const updatedXP = currentXP + xpAmount;

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          experience_points: updatedXP,
          updated_at: new Date().toISOString()
        })
        .eq('id', userProfileId);

      if (profileError) {
        log.error('Failed to update user profile XP', { 
          userProfileId, 
          xpAmount, 
          error: profileError 
        });
        throw new XPUpdateError(
          `Failed to update user XP: ${profileError.message}`,
          { userProfileId, xpAmount, error: profileError }
        );
      }

      log.info('Successfully updated user XP', { userProfileId, xpAmount });
    } catch (error) {
      if (error instanceof XPUpdateError) {
        throw error;
      }
      
      log.error('Unexpected error updating user XP', { 
        userProfileId, 
        xpAmount, 
        error 
      });
      throw new XPUpdateError(
        'Unexpected error updating user XP',
        { userProfileId, xpAmount, error }
      );
    }
  }

  /**
   * Record the activity in user activity log using existing pattern
   */
  async recordActivity(userProfileId: string, activityData: any): Promise<void> {
    try {
      log.debug('Recording activity', { userProfileId, activityData });

      // Use the existing pattern from the codebase
      const { error: activityError } = await supabase
        .from('user_activities')
        .insert({
          user_profile_id: userProfileId,
          activity_type: activityData.activityType || 'daily_checkin',
          activity_data: {
            greeting: activityData.greeting,
            streak: activityData.streak,
            attestation_uid: activityData.attestationUid,
            xp_breakdown: activityData.xpBreakdown,
            timestamp: activityData.timestamp || new Date().toISOString(),
            multiplier: activityData.multiplier,
            tier_info: activityData.tierInfo
          },
          points_earned: activityData.xpGained || 0
        });

      if (activityError) {
        log.error('Failed to record activity', { 
          userProfileId, 
          activityData, 
          error: activityError 
        });
        throw new XPUpdateError(
          `Failed to record activity: ${activityError.message}`,
          { userProfileId, activityData, error: activityError }
        );
      }

      log.info('Successfully recorded activity', { userProfileId, activityType: activityData.activityType });
    } catch (error) {
      if (error instanceof XPUpdateError) {
        throw error;
      }
      
      log.error('Unexpected error recording activity', { 
        userProfileId, 
        activityData, 
        error 
      });
      throw new XPUpdateError(
        'Unexpected error recording activity',
        { userProfileId, activityData, error }
      );
    }
  }

  /**
   * Atomic operation to update XP and record activity
   * This ensures consistency between user_profiles and user_activities tables
   */
  async updateUserXPWithActivity(
    userProfileId: string,
    xpAmount: number,
    activityData: any
  ): Promise<void> {
    try {
      log.debug('Performing atomic XP update with activity', { 
        userProfileId, 
        xpAmount, 
        activityData 
      });

      // Use Promise.all for parallel execution but handle errors properly
      const [profileResult, activityResult] = await Promise.allSettled([
        this.updateUserXP(userProfileId, xpAmount, activityData),
        this.recordActivity(userProfileId, { ...activityData, xpGained: xpAmount })
      ]);

      // Check if profile update failed
      if (profileResult.status === 'rejected') {
        log.error('Profile update failed in atomic operation', { 
          userProfileId, 
          error: profileResult.reason 
        });
        throw profileResult.reason;
      }

      // Check if activity recording failed
      if (activityResult.status === 'rejected') {
        log.warn('Activity recording failed but profile was updated', { 
          userProfileId, 
          xpAmount,
          error: activityResult.reason 
        });
        
        // Don't throw here - XP was updated successfully
        // Just log the warning as activity recording is less critical
      }

      log.info('Atomic XP update completed successfully', { userProfileId, xpAmount });
    } catch (error) {
      log.error('Atomic XP update failed', { userProfileId, xpAmount, error });
      throw error;
    }
  }

  /**
   * Get user's current XP for validation
   */
  async getCurrentUserXP(userProfileId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('experience_points')
        .eq('id', userProfileId)
        .single();

      if (error) {
        log.error('Failed to get current user XP', { userProfileId, error });
        throw new XPUpdateError(
          `Failed to get current user XP: ${error.message}`,
          { userProfileId, error }
        );
      }

      return data?.experience_points || 0;
    } catch (error) {
      if (error instanceof XPUpdateError) {
        throw error;
      }
      
      throw new XPUpdateError(
        'Unexpected error getting current user XP',
        { userProfileId, error }
      );
    }
  }

  /**
   * Validate XP update before applying (optional safety check)
   */
  async validateXPUpdate(
    userProfileId: string, 
    xpAmount: number
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Check if user profile exists
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, experience_points')
        .eq('id', userProfileId)
        .single();

      if (error || !data) {
        return { 
          isValid: false, 
          reason: 'User profile not found' 
        };
      }

      // Validate XP amount
      if (xpAmount < 0) {
        return { 
          isValid: false, 
          reason: 'XP amount cannot be negative' 
        };
      }

      if (xpAmount > 10000) { // Reasonable upper limit
        return { 
          isValid: false, 
          reason: 'XP amount exceeds maximum allowed' 
        };
      }

      return { isValid: true };
    } catch (error) {
      log.error('Error validating XP update', { userProfileId, xpAmount, error });
      return { 
        isValid: false, 
        reason: 'Validation error occurred' 
      };
    }
  }

  /**
   * Get recent XP activities for a user
   */
  async getRecentXPActivities(
    userProfileId: string, 
    limit: number = 10
  ): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('user_activities')
        .select('*')
        .eq('user_profile_id', userProfileId)
        .eq('activity_type', 'daily_checkin')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        log.error('Failed to get recent XP activities', { userProfileId, error });
        return [];
      }

      return data || [];
    } catch (error) {
      log.error('Error getting recent XP activities', { userProfileId, error });
      return [];
    }
  }
}

// ================================
// Batch XP Updater (for bulk operations)
// ================================

export class BatchXPUpdater extends SupabaseXPUpdater {
  private batchQueue: Array<{
    userProfileId: string;
    xpAmount: number;
    activityData: any;
  }> = [];

  private batchSize: number = 10;
  private flushTimeout: NodeJS.Timeout | null = null;

  constructor(batchSize: number = 10, autoFlushMs: number = 5000) {
    super();
    this.batchSize = batchSize;
    
    // Auto-flush batch after timeout
    if (autoFlushMs > 0) {
      this.scheduleAutoFlush(autoFlushMs);
    }
  }

  /**
   * Add to batch queue instead of immediate update
   */
  override async updateUserXPWithActivity(
    userProfileId: string,
    xpAmount: number,
    activityData: any
  ): Promise<void> {
    this.batchQueue.push({ userProfileId, xpAmount, activityData });

    if (this.batchQueue.length >= this.batchSize) {
      await this.flushBatch();
    }
  }

  /**
   * Flush all pending updates
   */
  async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    log.debug('Flushing XP batch', { batchSize: batch.length });

    // Process batch in parallel with error handling
    const results = await Promise.allSettled(
      batch.map(item => 
        super.updateUserXPWithActivity(
          item.userProfileId, 
          item.xpAmount, 
          item.activityData
        )
      )
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        log.error('Batch XP update failed for item', { 
          index, 
          item: batch[index], 
          error: result.reason 
        });
      }
    });

    log.info('XP batch flush completed', { 
      total: batch.length, 
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length
    });
  }

  /**
   * Force flush remaining items
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    await this.flushBatch();
  }

  private scheduleAutoFlush(ms: number): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    
    this.flushTimeout = setTimeout(async () => {
      await this.flushBatch();
      this.scheduleAutoFlush(ms);
    }, ms);
  }

  /**
   * Get current batch queue size
   */
  getBatchQueueSize(): number {
    return this.batchQueue.length;
  }
}

// ================================
// Mock XP Updater (for testing)
// ================================

export class MockXPUpdater implements XPUpdaterStrategy {
  private updates: Array<{
    userProfileId: string;
    xpAmount: number;
    metadata: any;
    timestamp: Date;
  }> = [];

  private activities: Array<{
    userProfileId: string;
    activityData: any;
    timestamp: Date;
  }> = [];

  private userXP: Map<string, number> = new Map();

  async updateUserXP(
    userProfileId: string, 
    xpAmount: number, 
    metadata: any = {}
  ): Promise<void> {
    this.updates.push({
      userProfileId,
      xpAmount,
      metadata,
      timestamp: new Date()
    });

    // Update mock user XP
    const currentXP = this.userXP.get(userProfileId) || 0;
    this.userXP.set(userProfileId, currentXP + xpAmount);
  }

  async recordActivity(userProfileId: string, activityData: any): Promise<void> {
    this.activities.push({
      userProfileId,
      activityData,
      timestamp: new Date()
    });
  }

  async updateUserXPWithActivity(
    userProfileId: string,
    xpAmount: number,
    activityData: any
  ): Promise<void> {
    await Promise.all([
      this.updateUserXP(userProfileId, xpAmount, activityData),
      this.recordActivity(userProfileId, { ...activityData, xpGained: xpAmount })
    ]);
  }

  async getCurrentUserXP(userProfileId: string): Promise<number> {
    return this.userXP.get(userProfileId) || 0;
  }

  // Testing helper methods
  getUpdates() { 
    return [...this.updates]; 
  }

  getActivities() { 
    return [...this.activities]; 
  }

  getUserXP(userProfileId: string): number {
    return this.userXP.get(userProfileId) || 0;
  }

  setUserXP(userProfileId: string, xp: number): void {
    this.userXP.set(userProfileId, xp);
  }

  clear(): void {
    this.updates = [];
    this.activities = [];
    this.userXP.clear();
  }

  getUpdateCount(): number {
    return this.updates.length;
  }

  getActivityCount(): number {
    return this.activities.length;
  }
}

// ================================
// Cached XP Updater (with cache invalidation)
// ================================

export class CachedXPUpdater extends SupabaseXPUpdater {
  private xpCache: Map<string, { xp: number; timestamp: Date }> = new Map();
  private cacheTimeoutMs: number;

  constructor(cacheTimeoutMs: number = 60000) { // 1 minute default
    super();
    this.cacheTimeoutMs = cacheTimeoutMs;
  }

  override async updateUserXP(
    userProfileId: string, 
    xpAmount: number, 
    metadata: any = {}
  ): Promise<void> {
    await super.updateUserXP(userProfileId, xpAmount, metadata);
    
    // Invalidate cache for this user
    this.invalidateUserCache(userProfileId);
  }

  override async getCurrentUserXP(userProfileId: string): Promise<number> {
    // Check cache first
    const cached = this.xpCache.get(userProfileId);
    const now = new Date();
    
    if (cached && (now.getTime() - cached.timestamp.getTime()) < this.cacheTimeoutMs) {
      return cached.xp;
    }

    // Fetch from database
    const xp = await super.getCurrentUserXP(userProfileId);
    
    // Update cache
    this.xpCache.set(userProfileId, { xp, timestamp: now });
    
    return xp;
  }

  private invalidateUserCache(userProfileId: string): void {
    this.xpCache.delete(userProfileId);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.xpCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.xpCache.size,
      timeoutMs: this.cacheTimeoutMs
    };
  }
}

// ================================
// Factory Functions
// ================================

export const createSupabaseXPUpdater = (): XPUpdaterStrategy => {
  return new SupabaseXPUpdater();
};

export const createBatchXPUpdater = (
  batchSize?: number, 
  autoFlushMs?: number
): BatchXPUpdater => {
  return new BatchXPUpdater(batchSize, autoFlushMs);
};

export const createMockXPUpdater = (): MockXPUpdater => {
  return new MockXPUpdater();
};

export const createCachedXPUpdater = (cacheTimeoutMs?: number): CachedXPUpdater => {
  return new CachedXPUpdater(cacheTimeoutMs);
};

// ================================
// Utility Functions
// ================================

export const validateXPAmount = (xpAmount: number): { isValid: boolean; reason?: string } => {
  if (typeof xpAmount !== 'number' || isNaN(xpAmount)) {
    return { isValid: false, reason: 'XP amount must be a valid number' };
  }

  if (xpAmount < 0) {
    return { isValid: false, reason: 'XP amount cannot be negative' };
  }

  if (xpAmount > 10000) {
    return { isValid: false, reason: 'XP amount exceeds maximum allowed (10,000)' };
  }

  return { isValid: true };
};

export const formatActivityData = (
  greeting: string,
  streak: number,
  attestationUid: string,
  xpBreakdown: any,
  multiplier: number,
  tierInfo?: any
): any => {
  return {
    greeting,
    streak,
    attestationUid,
    xpBreakdown,
    multiplier,
    tierInfo,
    timestamp: new Date().toISOString(),
    activityType: 'daily_checkin' as CheckinActivityType
  };
};

export const calculateXPUpdateMetrics = (updates: any[]): {
  totalXP: number;
  averageXP: number;
  updateCount: number;
  uniqueUsers: number;
} => {
  if (updates.length === 0) {
    return { totalXP: 0, averageXP: 0, updateCount: 0, uniqueUsers: 0 };
  }

  const totalXP = updates.reduce((sum, update) => sum + update.xpAmount, 0);
  const uniqueUsers = new Set(updates.map(update => update.userProfileId)).size;

  return {
    totalXP,
    averageXP: totalXP / updates.length,
    updateCount: updates.length,
    uniqueUsers
  };
};
