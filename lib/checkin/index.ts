/**
 * Daily Check-in Module - Public API
 * Main entry point for the daily check-in system
 */

import {
  CheckinServiceFactory,
  getDefaultCheckinService,
  getEnvironmentConfig,
  DEFAULT_CHECKIN_CONFIG,
  type CheckinServiceConfig,
} from "./core/schemas";

import type { CheckinResult, StreakInfo, XPBreakdown } from "./core/types";

// ================================
// Core Exports
// ================================

// Main service and factory
export { DailyCheckinService } from "./core/service";
export {
  CheckinServiceFactory,
  createDailyCheckinService,
  createTestCheckinService,
  getDefaultCheckinService,
  resetDefaultCheckinService,
  validateCheckinConfig,
  getEnvironmentConfig,
} from "./core/schemas";

// Core types and interfaces
export type {
  // Main types
  CheckinData,
  CheckinResult,
  CheckinStatus,
  CheckinPreview,
  StreakInfo,
  XPBreakdown,

  // Configuration types
  XPConfig,
  StreakConfig,
  CheckinConfig,
  MultiplierTier,
  CheckinServiceDependencies,

  // Strategy interfaces
  StreakCalculatorStrategy,
  MultiplierStrategy,
  XPCalculatorStrategy,
  XPUpdaterStrategy,

  // Event and utility types
  CheckinEvent,
  StreakMilestone,
  CheckinActivityType,
  StreakStatus,
  MultiplierType,

  // Hook return types
  UseStreakDataReturn,
  UseDailyCheckinReturn,

  // Component prop types
  StreakDisplayProps,
  DailyCheckinButtonProps,
  CheckinCardProps,

  // Error types
  CheckinError,
  StreakCalculationError,
  XPCalculationError,
  XPUpdateError,
  AttestationError,
} from "./core/types";

export type { CheckinServiceConfig } from "./core/schemas";

// ================================
// Streak Module Exports
// ================================

// Streak calculators
export {
  DefaultStreakCalculator,
  EnhancedStreakCalculator,
  TimezoneAwareStreakCalculator,
  createStreakCalculator,
  createEnhancedStreakCalculator,
  createTimezoneAwareStreakCalculator,
} from "./streak/calculator";

// Streak utilities
export {
  getStreakEmoji,
  getStreakMessage,
  formatStreakDuration,
} from "./streak/calculator";

// Multiplier strategies
export {
  TieredMultiplierStrategy,
  LinearMultiplierStrategy,
  ExponentialMultiplierStrategy,
  SeasonalMultiplierStrategy,
  createTieredMultiplier,
  createLinearMultiplier,
  createExponentialMultiplier,
  createSeasonalMultiplier,
  MULTIPLIER_PRESETS,
} from "./streak/multiplier";

// Multiplier utilities
export {
  getMultiplierColor,
  formatMultiplier,
  getMultiplierDescription,
} from "./streak/multiplier";

// ================================
// XP Module Exports
// ================================

// XP calculators
export {
  StandardXPCalculator,
  ProgressiveXPCalculator,
  TieredXPCalculator,
  EventXPCalculator,
  ContextualXPCalculator,
  createStandardXPCalculator,
  createProgressiveXPCalculator,
  createTieredXPCalculator,
  createEventXPCalculator,
  createContextualXPCalculator,
  XP_PRESETS,
} from "./xp/calculator";

// XP calculator types
export type { XPTier } from "./xp/calculator";

// XP updaters
export {
  SupabaseXPUpdater,
  BatchXPUpdater,
  MockXPUpdater,
  CachedXPUpdater,
  createSupabaseXPUpdater,
  createBatchXPUpdater,
  createMockXPUpdater,
  createCachedXPUpdater,
} from "./xp/updater";

// XP utilities
export { formatXP, getXPColor, calculateXPGrowth } from "./xp/calculator";
export {
  validateXPAmount,
  formatActivityData,
  calculateXPUpdateMetrics,
} from "./xp/updater";

// ================================
// Configuration Exports
// ================================

export {
  DEFAULT_CHECKIN_CONFIG,
  GAMING_FOCUSED_CONFIG,
  CONSERVATIVE_CONFIG,
  EVENT_CONFIG,
} from "./core/schemas";

// ================================
// Convenience Functions
// ================================

/**
 * Quick service creation with minimal configuration
 */
export const createQuickCheckinService = (
  preset: "default" | "gaming" | "conservative" = "default",
) => {
  switch (preset) {
    case "gaming":
      return CheckinServiceFactory.createGamingService();
    case "conservative":
      return CheckinServiceFactory.createConservativeService();
    default:
      return CheckinServiceFactory.createDefaultService();
  }
};

/**
 * Create service for a specific event period
 */
export const createEventCheckinService = (
  eventName: string,
  startDate: Date,
  endDate: Date,
) => {
  return CheckinServiceFactory.createEventService(
    startDate,
    endDate,
    eventName,
  );
};

// ================================
// Version and Module Information
// ================================

export const CHECKIN_MODULE_VERSION = "1.0.0";
export const CHECKIN_MODULE_NAME = "Daily Check-in System";

export const getModuleInfo = () => ({
  name: CHECKIN_MODULE_NAME,
  version: CHECKIN_MODULE_VERSION,
  description:
    "Modular daily check-in system with streak tracking, XP rewards, and blockchain attestations",
  features: [
    "Multiple streak calculation strategies",
    "Flexible multiplier systems",
    "Configurable XP calculation",
    "Blockchain attestation integration",
    "Comprehensive testing support",
    "Production-ready caching and batching",
  ],
  dependencies: {
    eas: "@/lib/attestation",
    supabase: "@/lib/supabase",
    logger: "@/lib/utils/logger",
  },
});

// ================================
// Health Check and Diagnostics
// ================================

export const checkModuleHealth = async () => {
  try {
    const service = getDefaultCheckinService();
    return await service.getHealthStatus();
  } catch (error) {
    return {
      status: "unhealthy" as const,
      services: {},
      timestamp: new Date(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ================================
// Development and Debug Utilities
// ================================

export const debugCheckinModule = () => {
  const moduleInfo = getModuleInfo();
  const config = getEnvironmentConfig();

  return {
    ...moduleInfo,
    environment: process.env.NODE_ENV,
    config,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Create a service with debug logging enabled
 */
export const createDebugCheckinService = (config?: CheckinServiceConfig) => {
  // In development, we could enhance this with additional logging
  return CheckinServiceFactory.createService(config);
};

// ================================
// Migration Helpers
// ================================

/**
 * Helper to migrate from legacy check-in systems
 */
export const createMigrationService = () => {
  // This could be used to help migrate from existing systems
  return CheckinServiceFactory.createService({
    ...DEFAULT_CHECKIN_CONFIG,
    updater: {
      strategy: "batch",
      batchConfig: {
        batchSize: 50,
        autoFlushMs: 1000,
      },
    },
  });
};

// ================================
// Type Guards and Validators
// ================================

export const isValidCheckinResult = (result: any): result is CheckinResult => {
  return (
    typeof result === "object" &&
    typeof result.success === "boolean" &&
    typeof result.xpEarned === "number" &&
    typeof result.newStreak === "number"
  );
};

export const isValidStreakInfo = (info: any): info is StreakInfo => {
  return (
    typeof info === "object" &&
    typeof info.currentStreak === "number" &&
    typeof info.isActive === "boolean" &&
    (info.lastCheckinDate === null || info.lastCheckinDate instanceof Date)
  );
};

export const isValidXPBreakdown = (
  breakdown: any,
): breakdown is XPBreakdown => {
  return (
    typeof breakdown === "object" &&
    typeof breakdown.baseXP === "number" &&
    typeof breakdown.streakBonus === "number" &&
    typeof breakdown.multiplier === "number" &&
    typeof breakdown.totalXP === "number"
  );
};

// ================================
// Re-export from other modules for convenience
// ================================

// Re-export commonly used EAS types and functions
export { P2E_SCHEMA_UIDS } from "@/lib/attestation/core/config";
export type { AttestationResult } from "@/lib/attestation/core/types";
