/**
 * Core types and interfaces for the daily check-in system
 * Defines contracts for all modules to ensure modularity and extensibility
 */

import type { AttestationData } from "@/lib/attestation/core/types";

// ================================
// Core Domain Types
// ================================

export interface CheckinData extends AttestationData {
  walletAddress: string;
  greeting: string;
  timestamp: number;
  userDid: string;
  xpGained: number;
}

export interface StreakInfo {
  currentStreak: number;
  lastCheckinDate: Date | null;
  longestStreak: number;
  isActive: boolean;
}

export interface XPBreakdown {
  baseXP: number;
  streakBonus: number;
  multiplier: number;
  totalXP: number;
  breakdown?: {
    weeklyBonus?: number;
    dailyBonus?: number;
    tierBonus?: number;
    eventBonus?: number;
    contextBonus?: number;
  };
}

export interface CheckinResult {
  success: boolean;
  xpEarned: number;
  newStreak: number;
  attestationUid?: string;
  error?: string;
  breakdown?: XPBreakdown;
}

export interface CheckinStatus {
  canCheckin: boolean;
  hasCheckedInToday: boolean;
  nextCheckinAvailable?: Date;
  timeUntilNextCheckin?: number;
}

export interface CheckinPreview {
  currentStreak: number;
  nextStreak: number;
  currentMultiplier: number;
  nextMultiplier: number;
  previewXP: number;
  breakdown: XPBreakdown;
}

// ================================
// Strategy Interfaces (for extensibility)
// ================================

export interface StreakCalculatorStrategy {
  /**
   * Calculate the current streak for a user
   */
  calculateStreak(userAddress: string): Promise<number>;

  /**
   * Determine if a streak is broken based on timing
   */
  isStreakBroken(lastCheckin: Date, today: Date): boolean;

  /**
   * Get comprehensive streak information
   */
  getStreakInfo(userAddress: string): Promise<StreakInfo>;

  /**
   * Validate if a new checkin would continue the streak
   */
  validateStreakContinuity(
    userAddress: string,
    checkinDate: Date,
  ): Promise<boolean>;
}

export interface MultiplierStrategy {
  /**
   * Calculate the multiplier for a given streak
   */
  calculateMultiplier(streak: number): number;

  /**
   * Get all available multiplier tiers
   */
  getMultiplierTiers(): MultiplierTier[];

  /**
   * Get the current tier for a streak
   */
  getCurrentTier(streak: number): MultiplierTier | null;

  /**
   * Get the next tier to achieve
   */
  getNextTier(streak: number): MultiplierTier | null;

  /**
   * Calculate progress to next tier (0-1)
   */
  getProgressToNextTier(streak: number): number;
}

export interface XPCalculatorStrategy {
  /**
   * Calculate base XP (before bonuses and multipliers)
   */
  calculateBaseXP(): number;

  /**
   * Calculate streak-based bonus XP
   */
  calculateStreakBonus(streak: number): number;

  /**
   * Calculate final total XP with all bonuses and multipliers
   */
  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number;

  /**
   * Get detailed XP breakdown for transparency
   */
  calculateXPBreakdown?(streak: number, multiplier: number): XPBreakdown;

  /**
   * Validate minimum XP requirements
   */
  validateMinimumXP?(calculatedXP: number): number;
}

export interface XPUpdaterStrategy {
  /**
   * Update user's XP in their profile
   */
  updateUserXP(
    userProfileId: string,
    xpAmount: number,
    metadata: any,
  ): Promise<void>;

  /**
   * Record the activity in user activity log
   */
  recordActivity(userProfileId: string, activityData: any): Promise<void>;

  /**
   * Atomic operation to update XP and record activity
   */
  updateUserXPWithActivity?(
    userProfileId: string,
    xpAmount: number,
    activityData: any,
  ): Promise<void>;

  /**
   * Get user's current XP (for validation)
   */
  getCurrentUserXP?(userProfileId: string): Promise<number>;
}

// ================================
// Configuration Types
// ================================

export interface MultiplierTier {
  minStreak: number;
  maxStreak: number | null;
  multiplier: number;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface XPConfig {
  baseXP: number;
  weeklyBonus: number;
  dailyBonus: number;
  minimumXP: number;
  maximumXP?: number;
}

export interface StreakConfig {
  maxStreakGap: number; // Hours before streak is broken
  timezone?: string;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
}

export interface CheckinConfig {
  allowMultiplePerDay: boolean;
  requireWalletConnection: boolean;
  enableNotifications: boolean;
  greetingOptions: string[];
}

// ================================
// Event Types (for React hooks)
// ================================

export interface CheckinEvent {
  type: "checkin_success" | "checkin_error" | "streak_milestone" | "xp_gained";
  data: any;
  timestamp: Date;
}

export interface StreakMilestone {
  streak: number;
  title: string;
  description: string;
  reward?: {
    type: "xp" | "badge" | "multiplier";
    value: number | string;
  };
}

// ================================
// Error Types
// ================================

export class CheckinError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = "CheckinError";
  }
}

export class StreakCalculationError extends CheckinError {
  constructor(message: string, details?: any) {
    super(message, "STREAK_CALCULATION_ERROR", details);
  }
}

export class XPCalculationError extends CheckinError {
  constructor(message: string, details?: any) {
    super(message, "XP_CALCULATION_ERROR", details);
  }
}

export class XPUpdateError extends CheckinError {
  constructor(message: string, details?: any) {
    super(message, "XP_UPDATE_ERROR", details);
  }
}

export class AttestationError extends CheckinError {
  constructor(message: string, details?: any) {
    super(message, "ATTESTATION_ERROR", details);
  }
}

// ================================
// Utility Types
// ================================

export type CheckinActivityType =
  | "daily_checkin"
  | "streak_milestone"
  | "tier_upgrade"
  | "special_event_checkin";

export type StreakStatus = "active" | "at_risk" | "broken" | "new";

export type MultiplierType = "tiered" | "linear" | "exponential" | "custom";

// ================================
// Service Dependencies
// ================================

export interface CheckinServiceDependencies {
  attestationService: any; // Will be the AttestationService from lib/attestation
  streakCalculator: StreakCalculatorStrategy;
  multiplierStrategy: MultiplierStrategy;
  xpCalculator: XPCalculatorStrategy;
  xpUpdater: XPUpdaterStrategy;
}

// ================================
// Hook Return Types
// ================================

export interface UseStreakDataReturn {
  streakInfo: StreakInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getCurrentTier: () => MultiplierTier | null;
  getNextTier: () => MultiplierTier | null;
  getProgressToNextTier: () => number;
  getCurrentMultiplier: () => number;
  getStreakStatus?: () => StreakStatus;
  getTimeUntilExpiration?: () => number | null;
  currentTier: MultiplierTier | null;
  nextTier: MultiplierTier | null;
  progress: number;
  multiplier: number;
  status: StreakStatus;
  timeUntilExpiration: number | null;
}

export interface UseDailyCheckinReturn {
  // Status
  checkinStatus: CheckinStatus | null;
  streakInfo: StreakInfo | null;
  checkinPreview: CheckinPreview | null;

  // Actions
  performCheckin: (greeting?: string) => Promise<CheckinResult>;
  refreshStatus: () => Promise<void>;

  // State
  isLoading: boolean;
  isPerformingCheckin: boolean;
  error: string | null;

  // Convenience getters
  canCheckinToday: boolean;
  hasCheckedInToday: boolean;
  nextCheckinTime: Date | null;
  timeUntilNextCheckin: number | null;
  previewXP: number;

  // Events
  onCheckinSuccess?: (result: CheckinResult) => void;
  onCheckinError?: (error: string) => void;
}

// ================================
// Component Props Types
// ================================

export interface StreakDisplayProps {
  streak: number;
  multiplier: number;
  currentTier?: MultiplierTier | null;
  nextTier?: MultiplierTier | null;
  showProgress?: boolean;
  compact?: boolean;
  className?: string;
}

export interface DailyCheckinButtonProps {
  userAddress: string;
  userProfileId: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  greeting?: string;
  onSuccess?: (result: CheckinResult) => void;
  onError?: (error: string) => void;
  className?: string;
}

export interface CheckinCardProps {
  userAddress: string;
  userProfileId: string;
  showStreak?: boolean;
  showPreview?: boolean;
  compact?: boolean;
  onCheckinSuccess?: (result: CheckinResult) => void;
  onCheckinError?: (error: string) => void;
  className?: string;
}
