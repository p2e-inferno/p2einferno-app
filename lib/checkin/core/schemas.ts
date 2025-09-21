/**
 * Service factory and configuration for daily check-ins
 * Provides dependency injection and configuration management
 */

import { DailyCheckinService } from './service';
import { 
  StreakCalculatorStrategy, 
  MultiplierStrategy, 
  XPCalculatorStrategy, 
  XPUpdaterStrategy,
  StreakConfig,
  XPConfig,
  MultiplierTier,
  CheckinServiceDependencies
} from './types';

// Import existing EAS service
import { AttestationService } from '@/lib/attestation/core/service';

// Import our strategy implementations
import {
  createStreakCalculator,
  createEnhancedStreakCalculator,
  createTimezoneAwareStreakCalculator
} from '../streak/calculator';

import {
  createTieredMultiplier,
  createLinearMultiplier,
  createExponentialMultiplier,
  createSeasonalMultiplier,
  MULTIPLIER_PRESETS
} from '../streak/multiplier';

import {
  createStandardXPCalculator,
  createProgressiveXPCalculator,
  createTieredXPCalculator,
  createEventXPCalculator,
  createContextualXPCalculator,
  XP_PRESETS
} from '../xp/calculator';

import {
  createSupabaseXPUpdater,
  createBatchXPUpdater,
  createCachedXPUpdater,
  createMockXPUpdater
} from '../xp/updater';

// ================================
// Configuration Interfaces
// ================================

export interface CheckinServiceConfig {
  // Streak configuration
  streak?: {
    strategy?: 'default' | 'enhanced' | 'timezone-aware';
    config?: StreakConfig;
    userTimezone?: string;
  };
  
  // Multiplier configuration
  multiplier?: {
    strategy?: 'tiered' | 'linear' | 'exponential' | 'seasonal' | 'preset';
    preset?: keyof typeof MULTIPLIER_PRESETS;
    customTiers?: MultiplierTier[];
    linearConfig?: {
      baseMultiplier?: number;
      incrementPerWeek?: number;
      maxMultiplier?: number;
      incrementInterval?: number;
    };
    exponentialConfig?: {
      baseMultiplier?: number;
      exponentBase?: number;
      maxMultiplier?: number;
      intervalDays?: number;
    };
    seasonalConfig?: {
      baseStrategy?: MultiplierStrategy;
      seasonalMultiplier?: number;
      eventStartDate?: Date;
      eventEndDate?: Date;
      eventName?: string;
    };
  };
  
  // XP configuration
  xp?: {
    strategy?: 'standard' | 'progressive' | 'tiered' | 'event' | 'contextual' | 'preset';
    preset?: keyof typeof XP_PRESETS;
    config?: Partial<XPConfig>;
    progressiveConfig?: {
      progressionRate?: number;
    };
    tieredConfig?: {
      customTiers?: any[];
    };
    eventConfig?: {
      baseCalculator?: XPCalculatorStrategy;
      eventMultiplier?: number;
      eventStartDate?: Date;
      eventEndDate?: Date;
      eventName?: string;
    };
    contextualConfig?: {
      baseCalculator?: XPCalculatorStrategy;
      contextMultipliers?: Map<string, number>;
    };
  };
  
  // XP Updater configuration
  updater?: {
    strategy?: 'supabase' | 'batch' | 'cached' | 'mock';
    batchConfig?: {
      batchSize?: number;
      autoFlushMs?: number;
    };
    cacheConfig?: {
      cacheTimeoutMs?: number;
    };
  };
}

// ================================
// Default Configurations
// ================================

export const DEFAULT_CHECKIN_CONFIG: CheckinServiceConfig = {
  streak: {
    strategy: 'default',
    config: {
      maxStreakGap: 24,
      timezone: 'UTC'
    }
  },
  multiplier: {
    strategy: 'preset',
    preset: 'balanced'
  },
  xp: {
    strategy: 'preset',
    preset: 'standard'
  },
  updater: {
    strategy: 'supabase'
  }
};

export const GAMING_FOCUSED_CONFIG: CheckinServiceConfig = {
  streak: {
    strategy: 'enhanced'
  },
  multiplier: {
    strategy: 'preset',
    preset: 'aggressive'
  },
  xp: {
    strategy: 'preset',
    preset: 'generous'
  },
  updater: {
    strategy: 'cached',
    cacheConfig: {
      cacheTimeoutMs: 30000 // 30 seconds
    }
  }
};

export const CONSERVATIVE_CONFIG: CheckinServiceConfig = {
  streak: {
    strategy: 'default'
  },
  multiplier: {
    strategy: 'preset',
    preset: 'conservative'
  },
  xp: {
    strategy: 'preset',
    preset: 'conservative'
  },
  updater: {
    strategy: 'supabase'
  }
};

export const EVENT_CONFIG: CheckinServiceConfig = {
  streak: {
    strategy: 'enhanced'
  },
  multiplier: {
    strategy: 'seasonal',
    seasonalConfig: {
      baseStrategy: createTieredMultiplier(),
      seasonalMultiplier: 2.0,
      eventName: 'Holiday Special'
    }
  },
  xp: {
    strategy: 'event',
    eventConfig: {
      baseCalculator: createStandardXPCalculator(),
      eventMultiplier: 1.5,
      eventName: 'Holiday XP Boost'
    }
  },
  updater: {
    strategy: 'batch',
    batchConfig: {
      batchSize: 5,
      autoFlushMs: 3000
    }
  }
};

// ================================
// Service Factory
// ================================

export class CheckinServiceFactory {
  /**
   * Create a DailyCheckinService with the specified configuration
   */
  static createService(config: CheckinServiceConfig = DEFAULT_CHECKIN_CONFIG): DailyCheckinService {
    // Create AttestationService (reusing existing EAS system)
    const attestationService = new AttestationService();
    
    // Create strategy instances based on configuration
    const streakCalculator = this.createStreakCalculator(config.streak);
    const multiplierStrategy = this.createMultiplierStrategy(config.multiplier);
    const xpCalculator = this.createXPCalculator(config.xp);
    const xpUpdater = this.createXPUpdater(config.updater);
    
    return new DailyCheckinService(
      attestationService,
      streakCalculator,
      multiplierStrategy,
      xpCalculator,
      xpUpdater
    );
  }

  /**
   * Create service with predefined configuration
   */
  static createDefaultService(): DailyCheckinService {
    return this.createService(DEFAULT_CHECKIN_CONFIG);
  }

  static createGamingService(): DailyCheckinService {
    return this.createService(GAMING_FOCUSED_CONFIG);
  }

  static createConservativeService(): DailyCheckinService {
    return this.createService(CONSERVATIVE_CONFIG);
  }

  static createEventService(
    eventStartDate?: Date, 
    eventEndDate?: Date, 
    eventName?: string
  ): DailyCheckinService {
    const config = { 
      ...EVENT_CONFIG,
      multiplier: {
        ...EVENT_CONFIG.multiplier,
        seasonalConfig: {
          ...EVENT_CONFIG.multiplier?.seasonalConfig,
          eventStartDate,
          eventEndDate,
          eventName: eventName || 'Special Event'
        }
      },
      xp: {
        ...EVENT_CONFIG.xp,
        eventConfig: {
          ...EVENT_CONFIG.xp?.eventConfig,
          eventStartDate,
          eventEndDate,
          eventName: eventName || 'Special Event'
        }
      }
    };
    
    return this.createService(config);
  }

  /**
   * Create service for testing with mock dependencies
   */
  static createTestService(overrides: {
    streakCalculator?: StreakCalculatorStrategy;
    multiplierStrategy?: MultiplierStrategy;
    xpCalculator?: XPCalculatorStrategy;
    xpUpdater?: XPUpdaterStrategy;
  } = {}): DailyCheckinService {
    return new DailyCheckinService(
      new AttestationService(),
      overrides.streakCalculator || createStreakCalculator(),
      overrides.multiplierStrategy || createTieredMultiplier(),
      overrides.xpCalculator || createStandardXPCalculator(),
      overrides.xpUpdater || createMockXPUpdater()
    );
  }

  // Private factory methods for individual strategies

  private static createStreakCalculator(
    config?: CheckinServiceConfig['streak']
  ): StreakCalculatorStrategy {
    if (!config) {
      return createStreakCalculator();
    }

    switch (config.strategy) {
      case 'enhanced':
        return createEnhancedStreakCalculator(config.config);
      case 'timezone-aware': {
        const baseConfig: Partial<StreakConfig> = config.config ?? {};
        const { timezone, weekStartsOn, maxStreakGap } = baseConfig;

        return createTimezoneAwareStreakCalculator({
          maxStreakGap: maxStreakGap ?? 24,
          timezone,
          weekStartsOn,
          userTimezone: config.userTimezone
        });
      }
      default:
        return createStreakCalculator(config.config);
    }
  }

  private static createMultiplierStrategy(
    config?: CheckinServiceConfig['multiplier']
  ): MultiplierStrategy {
    if (!config) {
      return createTieredMultiplier();
    }

    switch (config.strategy) {
      case 'preset':
        return MULTIPLIER_PRESETS[config.preset || 'balanced'];
      case 'linear':
        return createLinearMultiplier(
          config.linearConfig?.baseMultiplier,
          config.linearConfig?.incrementPerWeek,
          config.linearConfig?.maxMultiplier,
          config.linearConfig?.incrementInterval
        );
      case 'exponential':
        return createExponentialMultiplier(
          config.exponentialConfig?.baseMultiplier,
          config.exponentialConfig?.exponentBase,
          config.exponentialConfig?.maxMultiplier,
          config.exponentialConfig?.intervalDays
        );
      case 'seasonal':
        return createSeasonalMultiplier(
          config.seasonalConfig?.baseStrategy || createTieredMultiplier(),
          config.seasonalConfig?.seasonalMultiplier || 1.5,
          config.seasonalConfig?.eventStartDate,
          config.seasonalConfig?.eventEndDate,
          config.seasonalConfig?.eventName
        );
      default:
        return createTieredMultiplier(config.customTiers);
    }
  }

  private static createXPCalculator(
    config?: CheckinServiceConfig['xp']
  ): XPCalculatorStrategy {
    if (!config) {
      return createStandardXPCalculator();
    }

    switch (config.strategy) {
      case 'preset':
        return XP_PRESETS[config.preset || 'standard'];
      case 'progressive':
        return createProgressiveXPCalculator(
          config.config,
          config.progressiveConfig?.progressionRate
        );
      case 'tiered':
        return createTieredXPCalculator(
          config.config,
          config.tieredConfig?.customTiers
        );
      case 'event':
        return createEventXPCalculator(
          config.eventConfig?.baseCalculator || createStandardXPCalculator(),
          config.eventConfig?.eventMultiplier || 2.0,
          config.eventConfig?.eventStartDate,
          config.eventConfig?.eventEndDate,
          config.eventConfig?.eventName
        );
      case 'contextual':
        return createContextualXPCalculator(
          config.contextualConfig?.baseCalculator || createStandardXPCalculator(),
          config.contextualConfig?.contextMultipliers
        );
      default:
        return createStandardXPCalculator(config.config);
    }
  }

  private static createXPUpdater(
    config?: CheckinServiceConfig['updater']
  ): XPUpdaterStrategy {
    if (!config) {
      return createSupabaseXPUpdater();
    }

    switch (config.strategy) {
      case 'batch':
        return createBatchXPUpdater(
          config.batchConfig?.batchSize,
          config.batchConfig?.autoFlushMs
        );
      case 'cached':
        return createCachedXPUpdater(config.cacheConfig?.cacheTimeoutMs);
      case 'mock':
        return createMockXPUpdater();
      default:
        return createSupabaseXPUpdater();
    }
  }
}

// ================================
// Configuration Validation
// ================================

export const validateCheckinConfig = (
  config: CheckinServiceConfig
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Validate streak configuration
  if (config.streak?.config?.maxStreakGap && config.streak.config.maxStreakGap <= 0) {
    errors.push('maxStreakGap must be positive');
  }

  // Validate multiplier configuration
  if (config.multiplier?.preset && !MULTIPLIER_PRESETS[config.multiplier.preset]) {
    errors.push(`Invalid multiplier preset: ${config.multiplier.preset}`);
  }

  // Validate XP configuration
  if (config.xp?.preset && !XP_PRESETS[config.xp.preset]) {
    errors.push(`Invalid XP preset: ${config.xp.preset}`);
  }

  if (config.xp?.config?.baseXP && config.xp.config.baseXP <= 0) {
    errors.push('baseXP must be positive');
  }

  if (config.xp?.config?.minimumXP && config.xp.config.minimumXP <= 0) {
    errors.push('minimumXP must be positive');
  }

  // Validate updater configuration
  if (config.updater?.batchConfig?.batchSize && config.updater.batchConfig.batchSize <= 0) {
    errors.push('batchSize must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ================================
// Convenience Functions
// ================================

/**
 * Create a service with dependency injection
 */
export const createDailyCheckinService = (
  dependencies?: Partial<CheckinServiceDependencies>
): DailyCheckinService => {
  return new DailyCheckinService(
    dependencies?.attestationService || new AttestationService(),
    dependencies?.streakCalculator || createStreakCalculator(),
    dependencies?.multiplierStrategy || createTieredMultiplier(),
    dependencies?.xpCalculator || createStandardXPCalculator(),
    dependencies?.xpUpdater || createSupabaseXPUpdater()
  );
};

/**
 * Create a service for development/testing
 */
export const createTestCheckinService = (overrides: {
  streakCalculator?: StreakCalculatorStrategy;
  multiplierStrategy?: MultiplierStrategy;
  xpCalculator?: XPCalculatorStrategy;
  xpUpdater?: XPUpdaterStrategy;
} = {}): DailyCheckinService => {
  return CheckinServiceFactory.createTestService(overrides);
};

// ================================
// Environment-based Configuration
// ================================

export const getEnvironmentConfig = (): CheckinServiceConfig => {
  const env = process.env.NODE_ENV;
  const isProduction = env === 'production';
  const isDevelopment = env === 'development';
  const isTest = env === 'test';

  if (isTest) {
    return {
      ...DEFAULT_CHECKIN_CONFIG,
      updater: { strategy: 'mock' }
    };
  }

  if (isDevelopment) {
    return {
      ...DEFAULT_CHECKIN_CONFIG,
      updater: { 
        strategy: 'cached',
        cacheConfig: { cacheTimeoutMs: 10000 }
      }
    };
  }

  if (isProduction) {
    return {
      ...DEFAULT_CHECKIN_CONFIG,
      updater: { strategy: 'supabase' }
    };
  }

  return DEFAULT_CHECKIN_CONFIG;
};

// ================================
// Exports
// ================================

// Default service instance (lazy-loaded)
let defaultServiceInstance: DailyCheckinService | null = null;

export const getDefaultCheckinService = (): DailyCheckinService => {
  if (!defaultServiceInstance) {
    defaultServiceInstance = CheckinServiceFactory.createService(getEnvironmentConfig());
  }
  return defaultServiceInstance;
};

// Reset default service (useful for testing)
export const resetDefaultCheckinService = (): void => {
  defaultServiceInstance = null;
};
