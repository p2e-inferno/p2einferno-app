/**
 * XP calculation strategies for daily check-ins
 * Provides flexible and extensible XP calculation logic
 */

import { XPCalculatorStrategy, XPBreakdown, XPConfig } from "../core/types";

const STANDARD_DEFAULT_CONFIG: XPConfig = {
  baseXP: 10,
  weeklyBonus: 5,
  dailyBonus: 1,
  minimumXP: 5,
  maximumXP: 1000,
};

// ================================
// Standard XP Calculator
// ================================

export class StandardXPCalculator implements XPCalculatorStrategy {
  private config: XPConfig;

  constructor(config: Partial<XPConfig> = {}) {
    this.config = { ...STANDARD_DEFAULT_CONFIG, ...config } as XPConfig;
  }

  calculateBaseXP(): number {
    return this.config.baseXP;
  }

  calculateStreakBonus(streak: number): number {
    const weeklyCount = Math.max(0, Math.floor(streak / 7));
    const weeklyBonus = weeklyCount * this.config.weeklyBonus;
    const dailyBonus = Math.max(0, streak - 1) * this.config.dailyBonus; // No daily bonus for first day
    return weeklyBonus + dailyBonus;
  }

  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    const total = Math.floor((baseXP + bonus) * multiplier);
    const clamped = Math.max(
      this.config.minimumXP,
      this.config.maximumXP ? Math.min(total, this.config.maximumXP) : total,
    );
    return clamped;
  }

  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    const baseXP = this.calculateBaseXP();
    const streakBonus = this.calculateStreakBonus(streak);
    const totalXP = this.calculateTotalXP(baseXP, streakBonus, multiplier);

    const weeklyBonus = Math.floor(streak / 7) * this.config.weeklyBonus;
    const dailyBonus = Math.max(0, streak - 1) * this.config.dailyBonus;

    return {
      baseXP,
      streakBonus,
      multiplier,
      totalXP,
      breakdown: {
        weeklyBonus,
        dailyBonus,
        tierBonus: 0, // Standard calculator doesn't have tier bonuses
      },
    };
  }

  validateMinimumXP(calculatedXP: number): number {
    return Math.max(calculatedXP, this.config.minimumXP);
  }

  /**
   * Get configuration for transparency
   */
  getConfig(): XPConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<XPConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// ================================
// Progressive XP Calculator
// ================================

export class ProgressiveXPCalculator implements XPCalculatorStrategy {
  constructor(
    private config: XPConfig = {
      baseXP: 10,
      weeklyBonus: 5,
      dailyBonus: 2,
      minimumXP: 5,
      maximumXP: 2000,
    },
    private progressionRate: number = 0.05, // 5% increase per milestone
  ) {}

  calculateBaseXP(): number {
    return this.config.baseXP;
  }

  calculateStreakBonus(streak: number): number {
    // Progressive bonuses that increase with milestones
    const milestones = [7, 14, 30, 60, 100, 200, 365];
    let progressiveBonus = 0;

    milestones.forEach((milestone) => {
      if (streak >= milestone) {
        progressiveBonus += milestone * this.progressionRate;
      }
    });

    const weeklyBonus = Math.floor(streak / 7) * this.config.weeklyBonus;
    const dailyBonus = Math.max(0, streak - 1) * this.config.dailyBonus;

    return weeklyBonus + dailyBonus + progressiveBonus;
  }

  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    const total = Math.floor((baseXP + bonus) * multiplier);
    return Math.max(
      this.config.minimumXP,
      this.config.maximumXP ? Math.min(total, this.config.maximumXP) : total,
    );
  }

  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    const baseXP = this.calculateBaseXP();
    const streakBonus = this.calculateStreakBonus(streak);
    const totalXP = this.calculateTotalXP(baseXP, streakBonus, multiplier);

    // Calculate breakdown components
    const weeklyBonus = Math.floor(streak / 7) * this.config.weeklyBonus;
    const dailyBonus = Math.max(0, streak - 1) * this.config.dailyBonus;

    // Calculate milestone bonuses
    const milestones = [7, 14, 30, 60, 100, 200, 365];
    let milestoneBonus = 0;
    milestones.forEach((milestone) => {
      if (streak >= milestone) {
        milestoneBonus += milestone * this.progressionRate;
      }
    });

    return {
      baseXP,
      streakBonus,
      multiplier,
      totalXP,
      breakdown: {
        weeklyBonus,
        dailyBonus,
        tierBonus: milestoneBonus,
      },
    };
  }

  /**
   * Get next milestone information
   */
  getNextMilestone(
    streak: number,
  ): { milestone: number; bonus: number } | null {
    const milestones = [7, 14, 30, 60, 100, 200, 365];
    const nextMilestone = milestones.find((m) => m > streak);

    if (!nextMilestone) return null;

    return {
      milestone: nextMilestone,
      bonus: nextMilestone * this.progressionRate,
    };
  }
}

// ================================
// Tiered XP Calculator
// ================================

export interface XPTier {
  minStreak: number;
  maxStreak: number | null;
  baseXPMultiplier: number;
  bonusXPMultiplier: number;
  name: string;
}

export class TieredXPCalculator implements XPCalculatorStrategy {
  private readonly tiers: XPTier[];

  constructor(
    private config: XPConfig = {
      baseXP: 10,
      weeklyBonus: 5,
      dailyBonus: 1,
      minimumXP: 5,
      maximumXP: 1500,
    },
    customTiers?: XPTier[],
  ) {
    this.tiers = customTiers || this.getDefaultTiers();
  }

  private getDefaultTiers(): XPTier[] {
    return [
      {
        minStreak: 0,
        maxStreak: 6,
        baseXPMultiplier: 1.0,
        bonusXPMultiplier: 1.0,
        name: "Newcomer",
      },
      {
        minStreak: 7,
        maxStreak: 29,
        baseXPMultiplier: 1.2,
        bonusXPMultiplier: 1.3,
        name: "Regular",
      },
      {
        minStreak: 30,
        maxStreak: 99,
        baseXPMultiplier: 1.5,
        bonusXPMultiplier: 1.6,
        name: "Dedicated",
      },
      {
        minStreak: 100,
        maxStreak: null,
        baseXPMultiplier: 2.0,
        bonusXPMultiplier: 2.0,
        name: "Master",
      },
    ];
  }

  calculateBaseXP(): number {
    return this.config.baseXP;
  }

  calculateStreakBonus(streak: number): number {
    const weeklyBonus = Math.floor(streak / 7) * this.config.weeklyBonus;
    const dailyBonus = Math.max(0, streak - 1) * this.config.dailyBonus;
    return weeklyBonus + dailyBonus;
  }

  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    const total = Math.floor((baseXP + bonus) * multiplier);
    return Math.max(
      this.config.minimumXP,
      this.config.maximumXP ? Math.min(total, this.config.maximumXP) : total,
    );
  }

  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    const tier = this.getCurrentTier(streak);

    const baseXP = this.calculateBaseXP() * tier.baseXPMultiplier;
    const rawBonus = this.calculateStreakBonus(streak);
    const streakBonus = rawBonus * tier.bonusXPMultiplier;
    const totalXP = this.calculateTotalXP(baseXP, streakBonus, multiplier);

    const weeklyBonus =
      Math.floor(streak / 7) * this.config.weeklyBonus * tier.bonusXPMultiplier;
    const dailyBonus =
      Math.max(0, streak - 1) * this.config.dailyBonus * tier.bonusXPMultiplier;
    const tierBonus = baseXP - this.config.baseXP + (streakBonus - rawBonus);

    return {
      baseXP,
      streakBonus,
      multiplier,
      totalXP,
      breakdown: {
        weeklyBonus,
        dailyBonus,
        tierBonus,
      },
    };
  }

  private getCurrentTier(streak: number): XPTier {
    const fallbackTier: XPTier = this.tiers[0] || {
      minStreak: 0,
      maxStreak: null,
      baseXPMultiplier: 1,
      bonusXPMultiplier: 1,
      name: "Default",
    };

    return (
      this.tiers.find(
        (tier) =>
          streak >= tier.minStreak &&
          (tier.maxStreak === null || streak <= tier.maxStreak),
      ) ?? fallbackTier
    );
  }

  /**
   * Get tier information for UI
   */
  getTierInfo(streak: number): XPTier {
    return this.getCurrentTier(streak);
  }

  /**
   * Get all tiers
   */
  getAllTiers(): XPTier[] {
    return [...this.tiers];
  }
}

// ================================
// Event/Seasonal XP Calculator
// ================================

export class EventXPCalculator implements XPCalculatorStrategy {
  constructor(
    private baseCalculator: XPCalculatorStrategy,
    private eventMultiplier: number = 2.0,
    private eventStartDate?: Date,
    private eventEndDate?: Date,
    private eventName: string = "Special Event",
  ) {}

  calculateBaseXP(): number {
    return this.baseCalculator.calculateBaseXP();
  }

  calculateStreakBonus(streak: number): number {
    return this.baseCalculator.calculateStreakBonus(streak);
  }

  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    const finalMultiplier = this.isEventActive()
      ? multiplier * this.eventMultiplier
      : multiplier;

    return this.baseCalculator.calculateTotalXP(baseXP, bonus, finalMultiplier);
  }

  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    const isActive = this.isEventActive();
    const finalMultiplier = isActive
      ? multiplier * this.eventMultiplier
      : multiplier;

    const breakdown = this.baseCalculator.calculateXPBreakdown?.(
      streak,
      finalMultiplier,
    ) || {
      baseXP: this.calculateBaseXP(),
      streakBonus: this.calculateStreakBonus(streak),
      multiplier: finalMultiplier,
      totalXP: this.calculateTotalXP(
        this.calculateBaseXP(),
        this.calculateStreakBonus(streak),
        multiplier,
      ),
    };

    // Add event information to breakdown
    if (isActive && breakdown.breakdown) {
      breakdown.breakdown.eventBonus =
        breakdown.totalXP - breakdown.totalXP / this.eventMultiplier;
    }

    return breakdown;
  }

  validateMinimumXP(calculatedXP: number): number {
    return (
      this.baseCalculator.validateMinimumXP?.(calculatedXP) || calculatedXP
    );
  }

  private isEventActive(): boolean {
    const now = new Date();

    if (this.eventStartDate && now < this.eventStartDate) {
      return false;
    }

    if (this.eventEndDate && now > this.eventEndDate) {
      return false;
    }

    return true;
  }

  /**
   * Get event information
   */
  getEventInfo() {
    return {
      name: this.eventName,
      isActive: this.isEventActive(),
      multiplier: this.eventMultiplier,
      startDate: this.eventStartDate,
      endDate: this.eventEndDate,
    };
  }
}

// ================================
// Contextual XP Calculator
// ================================

export class ContextualXPCalculator implements XPCalculatorStrategy {
  constructor(
    private baseCalculator: XPCalculatorStrategy,
    private contextMultipliers: Map<string, number> = new Map(),
  ) {}

  calculateBaseXP(): number {
    return this.baseCalculator.calculateBaseXP();
  }

  calculateStreakBonus(streak: number): number {
    return this.baseCalculator.calculateStreakBonus(streak);
  }

  calculateTotalXP(baseXP: number, bonus: number, multiplier: number): number {
    return this.baseCalculator.calculateTotalXP(baseXP, bonus, multiplier);
  }

  calculateXPBreakdown(streak: number, multiplier: number): XPBreakdown {
    return (
      this.baseCalculator.calculateXPBreakdown?.(streak, multiplier) || {
        baseXP: this.calculateBaseXP(),
        streakBonus: this.calculateStreakBonus(streak),
        multiplier,
        totalXP: this.calculateTotalXP(
          this.calculateBaseXP(),
          this.calculateStreakBonus(streak),
          multiplier,
        ),
      }
    );
  }

  /**
   * Calculate XP with context (e.g., weekend, holiday, user birthday)
   */
  calculateXPWithContext(
    streak: number,
    multiplier: number,
    contexts: string[] = [],
  ): XPBreakdown {
    let contextMultiplier = 1.0;

    contexts.forEach((context) => {
      const contextBonus = this.contextMultipliers.get(context) || 1.0;
      contextMultiplier *= contextBonus;
    });

    const finalMultiplier = multiplier * contextMultiplier;
    const breakdown = this.calculateXPBreakdown(streak, finalMultiplier);

    if (contextMultiplier > 1.0 && breakdown.breakdown) {
      breakdown.breakdown.contextBonus =
        breakdown.totalXP - breakdown.totalXP / contextMultiplier;
    }

    return breakdown;
  }

  /**
   * Add context multiplier
   */
  addContext(context: string, multiplier: number): void {
    this.contextMultipliers.set(context, multiplier);
  }

  /**
   * Remove context multiplier
   */
  removeContext(context: string): void {
    this.contextMultipliers.delete(context);
  }

  /**
   * Get active contexts
   */
  getActiveContexts(): string[] {
    return Array.from(this.contextMultipliers.keys());
  }
}

// ================================
// Factory Functions
// ================================

export const createStandardXPCalculator = (
  config?: Partial<XPConfig>,
): XPCalculatorStrategy => {
  return new StandardXPCalculator(config as XPConfig);
};

export const createProgressiveXPCalculator = (
  config?: Partial<XPConfig>,
  progressionRate?: number,
): XPCalculatorStrategy => {
  return new ProgressiveXPCalculator(config as XPConfig, progressionRate);
};

export const createTieredXPCalculator = (
  config?: Partial<XPConfig>,
  customTiers?: XPTier[],
): XPCalculatorStrategy => {
  return new TieredXPCalculator(config as XPConfig, customTiers);
};

export const createEventXPCalculator = (
  baseCalculator: XPCalculatorStrategy,
  eventMultiplier: number,
  eventStartDate?: Date,
  eventEndDate?: Date,
  eventName?: string,
): XPCalculatorStrategy => {
  return new EventXPCalculator(
    baseCalculator,
    eventMultiplier,
    eventStartDate,
    eventEndDate,
    eventName,
  );
};

export const createContextualXPCalculator = (
  baseCalculator: XPCalculatorStrategy,
  contextMultipliers?: Map<string, number>,
): ContextualXPCalculator => {
  return new ContextualXPCalculator(baseCalculator, contextMultipliers);
};

// ================================
// Predefined Configurations
// ================================

export const XP_PRESETS = {
  // Conservative XP for retention
  conservative: createStandardXPCalculator({
    baseXP: 5,
    weeklyBonus: 2,
    dailyBonus: 0.5,
    minimumXP: 3,
    maximumXP: 100,
  }),

  // Standard balanced XP
  standard: createStandardXPCalculator(),

  // Generous XP for engagement
  generous: createProgressiveXPCalculator({
    baseXP: 15,
    weeklyBonus: 10,
    dailyBonus: 2,
    minimumXP: 10,
    maximumXP: 500,
  }),

  // Tiered system for progression feeling
  tiered: createTieredXPCalculator(),

  // High-reward system for special periods
  premium: createTieredXPCalculator({
    baseXP: 20,
    weeklyBonus: 15,
    dailyBonus: 3,
    minimumXP: 15,
    maximumXP: 1000,
  }),
} as const;

// ================================
// Utility Functions
// ================================

export const formatXP = (xp: number): string => {
  if (xp >= 1000000) {
    return `${(xp / 1000000).toFixed(1)}M XP`;
  } else if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}K XP`;
  }
  return `${xp} XP`;
};

export const getXPColor = (xp: number): string => {
  if (xp < 10) return "#22c55e"; // Green
  if (xp < 25) return "#f97316"; // Orange
  if (xp < 50) return "#3b82f6"; // Blue
  if (xp < 100) return "#8b5cf6"; // Purple
  return "#eab308"; // Gold
};

export const calculateXPGrowth = (
  calculator: XPCalculatorStrategy,
  currentStreak: number,
  multiplier: number,
  days: number = 7,
): XPBreakdown[] => {
  const projections: XPBreakdown[] = [];

  for (let i = 0; i <= days; i++) {
    const futureStreak = currentStreak + i;
    const breakdown = calculator.calculateXPBreakdown?.(
      futureStreak,
      multiplier,
    ) || {
      baseXP: calculator.calculateBaseXP(),
      streakBonus: calculator.calculateStreakBonus(futureStreak),
      multiplier,
      totalXP: calculator.calculateTotalXP(
        calculator.calculateBaseXP(),
        calculator.calculateStreakBonus(futureStreak),
        multiplier,
      ),
    };

    projections.push(breakdown);
  }

  return projections;
};
