/**
 * Daily Check-in Service - Main orchestrator
 * Coordinates all daily check-in modules and integrates with the existing EAS system
 */

import {
  CheckinData,
  CheckinResult,
  CheckinStatus,
  CheckinPreview,
  StreakInfo,
  XPBreakdown,
  StreakCalculatorStrategy,
  MultiplierStrategy,
  XPCalculatorStrategy,
  XPUpdaterStrategy,
  CheckinError,
  AttestationError,
  StreakCalculationError,
  MultiplierTier,
} from "./types";
import { AttestationService } from "@/lib/attestation/core/service";
import { requireSchemaUID, isEASEnabled } from "@/lib/attestation/core/config";
import { supabase } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("checkin:service");

let supabaseClient = supabase;

export const __setSupabaseClientForTests = (client: typeof supabase) => {
  supabaseClient = client;
};

export const __resetSupabaseClientForTests = () => {
  supabaseClient = supabase;
};

// ================================
// Daily Check-in Service
// ================================

export class DailyCheckinService {
  constructor(
    private attestationService: AttestationService,
    private streakCalculator: StreakCalculatorStrategy,
    private multiplierStrategy: MultiplierStrategy,
    private xpCalculator: XPCalculatorStrategy,
    private xpUpdater: XPUpdaterStrategy,
  ) {}

  /**
   * Check if user can perform a check-in today
   */
  async canCheckinToday(userAddress: string): Promise<boolean> {
    try {
      log.debug("Checking if user can checkin today", { userAddress });

      // Use existing database function
      const { data, error } = await supabaseClient.rpc("has_checked_in_today", {
        user_address: userAddress,
      });

      if (error) {
        log.error("Error checking checkin status", { userAddress, error });
        throw new CheckinError(
          `Failed to check today's checkin status: ${error.message}`,
          "CHECKIN_STATUS_ERROR",
          { userAddress, error },
        );
      }

      const hasCheckedIn = data || false;
      const canCheckin = !hasCheckedIn;

      log.debug("Checkin status checked", {
        userAddress,
        hasCheckedIn,
        canCheckin,
      });
      return canCheckin;
    } catch (error) {
      if (error instanceof CheckinError) {
        throw error;
      }

      log.error("Unexpected error checking checkin status", {
        userAddress,
        error,
      });
      throw new CheckinError(
        "Unexpected error checking checkin status",
        "UNEXPECTED_ERROR",
        { userAddress, error },
      );
    }
  }

  /**
   * Get comprehensive check-in status for a user
   */
  async getCheckinStatus(userAddress: string): Promise<CheckinStatus> {
    try {
      log.debug("Getting checkin status", { userAddress });

      const canCheckin = await this.canCheckinToday(userAddress);

      const hasCheckedInToday = !canCheckin;

      // Calculate next checkin time (start of next day)
      let nextCheckinAvailable: Date | undefined;
      let timeUntilNextCheckin: number | undefined;

      if (hasCheckedInToday) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        nextCheckinAvailable = tomorrow;
        timeUntilNextCheckin = tomorrow.getTime() - now.getTime();
      }

      const status: CheckinStatus = {
        canCheckin,
        hasCheckedInToday,
        nextCheckinAvailable,
        timeUntilNextCheckin,
      };

      log.debug("Checkin status retrieved", { userAddress, status });
      return status;
    } catch (error) {
      log.error("Error getting checkin status", { userAddress, error });
      throw error;
    }
  }

  /**
   * Get preview of what the user would earn from checking in
   */
  async getCheckinPreview(userAddress: string): Promise<CheckinPreview> {
    try {
      log.debug("Getting checkin preview", { userAddress });

      const currentStreak =
        await this.streakCalculator.calculateStreak(userAddress);
      const nextStreak = currentStreak + 1;

      const currentMultiplier =
        this.multiplierStrategy.calculateMultiplier(currentStreak);
      const nextMultiplier =
        this.multiplierStrategy.calculateMultiplier(nextStreak);

      const breakdown = this.xpCalculator.calculateXPBreakdown?.(
        nextStreak,
        nextMultiplier,
      ) || {
        baseXP: this.xpCalculator.calculateBaseXP(),
        streakBonus: this.xpCalculator.calculateStreakBonus(nextStreak),
        multiplier: nextMultiplier,
        totalXP: this.xpCalculator.calculateTotalXP(
          this.xpCalculator.calculateBaseXP(),
          this.xpCalculator.calculateStreakBonus(nextStreak),
          nextMultiplier,
        ),
      };

      const preview: CheckinPreview = {
        currentStreak,
        nextStreak,
        currentMultiplier,
        nextMultiplier,
        previewXP: breakdown.totalXP,
        breakdown,
      };

      log.debug("Checkin preview generated", { userAddress, preview });
      return preview;
    } catch (error) {
      if (error instanceof StreakCalculationError) {
        throw error;
      }

      log.error("Error generating checkin preview", { userAddress, error });
      throw new CheckinError(
        "Failed to generate checkin preview",
        "PREVIEW_ERROR",
        { userAddress, error },
      );
    }
  }

  /**
   * Perform the daily check-in
   */
  async performCheckin(
    userAddress: string,
    userProfileId: string,
    greeting: string = "GM",
    wallet: any,
  ): Promise<CheckinResult> {
    const startTime = Date.now();
    log.info("Starting daily checkin", {
      userAddress,
      userProfileId,
      greeting,
    });

    try {
      // 1. Validate check-in eligibility
      const canCheckin = await this.canCheckinToday(userAddress);
      if (!canCheckin) {
        log.warn("User already checked in today", { userAddress });
        return {
          success: false,
          xpEarned: 0,
          newStreak: await this.streakCalculator.calculateStreak(userAddress),
          error: "Already checked in today",
        };
      }

      // 2. Calculate streak and XP
      const currentStreak =
        await this.streakCalculator.calculateStreak(userAddress);
      const newStreak = currentStreak + 1;

      log.debug("Calculated streak progression", {
        userAddress,
        currentStreak,
        newStreak,
      });

      // 3. Calculate multiplier and XP breakdown
      const multiplier = this.multiplierStrategy.calculateMultiplier(newStreak);
      const xpBreakdown = this.xpCalculator.calculateXPBreakdown?.(
        newStreak,
        multiplier,
      ) || {
        baseXP: this.xpCalculator.calculateBaseXP(),
        streakBonus: this.xpCalculator.calculateStreakBonus(newStreak),
        multiplier,
        totalXP: this.xpCalculator.calculateTotalXP(
          this.xpCalculator.calculateBaseXP(),
          this.xpCalculator.calculateStreakBonus(newStreak),
          multiplier,
        ),
      };

      log.debug("Calculated XP breakdown", {
        userAddress,
        xpBreakdown,
      });

      // 4. Prepare check-in data for attestation
      const checkinData: CheckinData = {
        walletAddress: userAddress,
        greeting,
        timestamp: Date.now(),
        userDid: userProfileId,
        xpGained: xpBreakdown.totalXP,
      };

      // 5. Create attestation only when EAS is enabled
      let attestationResult: { success: boolean; attestationUid?: string; error?: string } = { success: true, attestationUid: undefined };

      if (isEASEnabled()) {
        log.debug("Creating attestation (EAS enabled)", { userAddress, checkinData });

        attestationResult = await this.attestationService.createAttestation(
          {
            schemaUid: requireSchemaUID('DAILY_CHECKIN'),
            recipient: userAddress,
            data: checkinData,
            wallet,
            allowMultiple: true,
          },
        );

        if (!attestationResult.success) {
          log.error("Attestation creation failed", {
            userAddress,
            error: attestationResult.error,
          });

          throw new AttestationError(
            attestationResult.error || "Failed to create attestation",
            { userAddress, checkinData, result: attestationResult },
          );
        }
      } else {
        log.debug("Skipping attestation creation (EAS disabled)", { userAddress });
      }

      log.info("Attestation created successfully", {
        userAddress,
        attestationUid: attestationResult.attestationUid,
      });

      // 6. Update user XP using existing pattern
      const activityData = {
        greeting,
        streak: newStreak,
        attestationUid: attestationResult.attestationUid,
        xpBreakdown,
        multiplier,
        tierInfo: this.multiplierStrategy.getCurrentTier(newStreak),
        timestamp: new Date().toISOString(),
        activityType: "daily_checkin",
        // Optional attestation for server API to persist when EAS is enabled
        attestation: attestationResult.attestationUid && isEASEnabled()
          ? {
              uid: attestationResult.attestationUid,
              schemaUid: requireSchemaUID('DAILY_CHECKIN'),
              attester: wallet.address,
              recipient: userAddress,
              data: checkinData,
              expirationTime: undefined as number | undefined,
            }
          : undefined,
      };

      log.debug("Updating user XP", {
        userAddress,
        xpAmount: xpBreakdown.totalXP,
      });

      if (this.xpUpdater.updateUserXPWithActivity) {
        await this.xpUpdater.updateUserXPWithActivity(
          userProfileId,
          xpBreakdown.totalXP,
          activityData,
        );
      } else {
        await Promise.all([
          this.xpUpdater.updateUserXP(
            userProfileId,
            xpBreakdown.totalXP,
            activityData,
          ),
          this.xpUpdater.recordActivity(userProfileId, activityData),
        ]);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      log.info("Daily checkin completed successfully", {
        userAddress,
        userProfileId,
        newStreak,
        xpEarned: xpBreakdown.totalXP,
        attestationUid: attestationResult.attestationUid,
        duration,
      });

      // 7. Return success result
      return {
        success: true,
        xpEarned: xpBreakdown.totalXP,
        newStreak,
        attestationUid: attestationResult.attestationUid,
        breakdown: xpBreakdown,
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      log.error("Daily checkin failed", {
        userAddress,
        userProfileId,
        greeting,
        error,
        duration,
      });

      // Return error result instead of throwing
      return {
        success: false,
        xpEarned: 0,
        newStreak: 0,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get user's streak information
   */
  async getStreakInfo(userAddress: string): Promise<StreakInfo> {
    try {
      return await this.streakCalculator.getStreakInfo(userAddress);
    } catch (error) {
      log.error("Error getting streak info", { userAddress, error });
      throw error;
    }
  }

  /**
   * Get user's XP breakdown for current streak
   */
  async getCurrentXPBreakdown(userAddress: string): Promise<XPBreakdown> {
    try {
      const streak = await this.streakCalculator.calculateStreak(userAddress);
      const multiplier = this.multiplierStrategy.calculateMultiplier(streak);

      return (
        this.xpCalculator.calculateXPBreakdown?.(streak, multiplier) || {
          baseXP: this.xpCalculator.calculateBaseXP(),
          streakBonus: this.xpCalculator.calculateStreakBonus(streak),
          multiplier,
          totalXP: this.xpCalculator.calculateTotalXP(
            this.xpCalculator.calculateBaseXP(),
            this.xpCalculator.calculateStreakBonus(streak),
            multiplier,
          ),
        }
      );
    } catch (error) {
      log.error("Error getting XP breakdown", { userAddress, error });
      throw error;
    }
  }

  /**
   * Multiplier utilities exposed for UI helpers
   */
  getMultiplierTiers(): MultiplierTier[] {
    return this.multiplierStrategy.getMultiplierTiers();
  }

  getCurrentMultiplier(streak: number): number {
    return this.multiplierStrategy.calculateMultiplier(streak);
  }

  getCurrentTier(streak: number): MultiplierTier | null {
    return this.multiplierStrategy.getCurrentTier(streak);
  }

  getNextTier(streak: number): MultiplierTier | null {
    return this.multiplierStrategy.getNextTier(streak);
  }

  getProgressToNextTier(streak: number): number {
    return this.multiplierStrategy.getProgressToNextTier(streak);
  }

  /**
   * Validate check-in operation before execution
   */
  async validateCheckin(
    userAddress: string,
    userProfileId: string,
    wallet: any,
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Check if user can checkin today
      const canCheckin = await this.canCheckinToday(userAddress);
      if (!canCheckin) {
        return { isValid: false, reason: "Already checked in today" };
      }

      // Validate wallet connection
      if (!wallet) {
        return { isValid: false, reason: "Wallet not connected" };
      }

      // Validate user profile ID
      if (!userProfileId) {
        return { isValid: false, reason: "User profile ID required" };
      }

      // Validate wallet address
      if (!userAddress || userAddress.length !== 42) {
        return { isValid: false, reason: "Invalid wallet address" };
      }

      return { isValid: true };
    } catch (error) {
      log.error("Error validating checkin", {
        userAddress,
        userProfileId,
        error,
      });
      return { isValid: false, reason: "Validation error occurred" };
    }
  }

  /**
   * Get check-in statistics for admin/analytics
   */
  async getCheckinStatistics(
    timeframe: "today" | "week" | "month" = "today",
  ): Promise<{
    totalCheckins: number;
    uniqueUsers: number;
    averageStreak: number;
    totalXPAwarded: number;
  }> {
    try {
      let startDate: Date;
      const now = new Date();

      switch (timeframe) {
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
      }

      // Use user_activities as single source of truth for analytics (EAS-independent)
      const { data, error } = await supabaseClient
        .from("user_activities")
        .select("user_profile_id, activity_data, points_earned, created_at")
        .eq("activity_type", "daily_checkin")
        .gte("created_at", startDate.toISOString());

      if (error) {
        throw new Error(error.message);
      }

      const checkins = data || [];
      const uniqueUsers = new Set(checkins.map((c) => c.user_profile_id)).size;
      const totalXPAwarded = checkins.reduce((sum, c) => {
        return sum + (c.points_earned || 0);
      }, 0);

      // Get wallet addresses for unique users to calculate streaks
      const userProfiles = await supabaseClient
        .from("user_profiles")
        .select("wallet_address")
        .in("id", Array.from(new Set(checkins.map((c) => c.user_profile_id))));

      const walletAddresses = userProfiles.data?.map(p => p.wallet_address) || [];
      
      // Calculate average streak (simplified)
      const streaks = await Promise.all(
        walletAddresses.map((address) =>
          this.streakCalculator.calculateStreak(address),
        ),
      );
      const averageStreak =
        streaks.length > 0
          ? streaks.reduce((sum, streak) => sum + streak, 0) / streaks.length
          : 0;

      return {
        totalCheckins: checkins.length,
        uniqueUsers,
        averageStreak: Math.round(averageStreak * 100) / 100,
        totalXPAwarded,
      };
    } catch (error) {
      log.error("Error getting checkin statistics", { timeframe, error });
      throw new CheckinError(
        "Failed to get checkin statistics",
        "STATISTICS_ERROR",
        { timeframe, error },
      );
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    services: Record<string, boolean>;
    timestamp: Date;
  }> {
    const services: Record<string, boolean> = {};
    let overallHealthy = true;

    try {
      // Test database connection using user_activities (EAS-independent)
      const { error: dbError } = await supabaseClient
        .from("user_activities")
        .select("id")
        .eq("activity_type", "daily_checkin")
        .limit(1);

      services.database = !dbError;
      if (dbError) overallHealthy = false;

      // Test attestation service
      try {
        // Just test instantiation, not actual operations
        services.attestationService = !!this.attestationService;
      } catch {
        services.attestationService = false;
        overallHealthy = false;
      }

      // Test module instantiation
      services.streakCalculator = !!this.streakCalculator;
      services.multiplierStrategy = !!this.multiplierStrategy;
      services.xpCalculator = !!this.xpCalculator;
      services.xpUpdater = !!this.xpUpdater;

      return {
        status: overallHealthy ? "healthy" : "degraded",
        services,
        timestamp: new Date(),
      };
    } catch (error) {
      log.error("Error checking service health", { error });
      return {
        status: "unhealthy",
        services,
        timestamp: new Date(),
      };
    }
  }
}
