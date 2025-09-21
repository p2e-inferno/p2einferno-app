/**
 * Multiplier strategy implementations for streak-based rewards
 * Provides multiple strategies that can be easily swapped or extended
 */

import { MultiplierStrategy, MultiplierTier } from '../core/types';

// ================================
// Tiered Multiplier Strategy
// ================================

export class TieredMultiplierStrategy implements MultiplierStrategy {
  private readonly tiers: MultiplierTier[];

  constructor(customTiers?: MultiplierTier[]) {
    this.tiers = customTiers || this.getDefaultTiers();
  }

  private getDefaultTiers(): MultiplierTier[] {
    return [
      { 
        minStreak: 0, 
        maxStreak: 6, 
        multiplier: 1.0, 
        name: 'Beginner',
        description: 'Just getting started',
        icon: '🌱',
        color: '#22c55e'
      },
      { 
        minStreak: 7, 
        maxStreak: 29, 
        multiplier: 1.5, 
        name: 'Consistent',
        description: 'Building a habit',
        icon: '🔥',
        color: '#f97316'
      },
      { 
        minStreak: 30, 
        maxStreak: 99, 
        multiplier: 2.0, 
        name: 'Dedicated',
        description: 'Serious commitment',
        icon: '⚡',
        color: '#3b82f6'
      },
      { 
        minStreak: 100, 
        maxStreak: 364, 
        multiplier: 2.5, 
        name: 'Master',
        description: 'Exceptional dedication',
        icon: '💎',
        color: '#8b5cf6'
      },
      { 
        minStreak: 365, 
        maxStreak: null, 
        multiplier: 3.0, 
        name: 'Legend',
        description: 'Ultimate achievement',
        icon: '👑',
        color: '#eab308'
      }
    ];
  }

  calculateMultiplier(streak: number): number {
    const tier = this.getCurrentTier(streak);
    return tier?.multiplier || 1.0;
  }

  getMultiplierTiers(): MultiplierTier[] {
    return [...this.tiers];
  }

  getCurrentTier(streak: number): MultiplierTier | null {
    return this.tiers.find(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    ) || null;
  }

  getNextTier(streak: number): MultiplierTier | null {
    const currentIndex = this.tiers.findIndex(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    );
    
    return currentIndex >= 0 && currentIndex < this.tiers.length - 1
      ? this.tiers[currentIndex + 1] ?? null
      : null;
  }

  getProgressToNextTier(streak: number): number {
    const currentTier = this.getCurrentTier(streak);
    const nextTier = this.getNextTier(streak);
    
    if (!currentTier || !nextTier) {
      return 1.0; // At max tier or no progression available
    }

    const tierRange = nextTier.minStreak - currentTier.minStreak;
    const progressInTier = streak - currentTier.minStreak;
    
    return Math.min(progressInTier / tierRange, 1.0);
  }

  /**
   * Get tier by index (useful for UI display)
   */
  getTierByIndex(index: number): MultiplierTier | null {
    return this.tiers[index] || null;
  }

  /**
   * Get tier count
   */
  getTierCount(): number {
    return this.tiers.length;
  }
}

// ================================
// Linear Multiplier Strategy
// ================================

export class LinearMultiplierStrategy implements MultiplierStrategy {

  constructor(
    private baseMultiplier: number = 1.0,
    private incrementPerWeek: number = 0.1,
    private maxMultiplier: number = 3.0,
    private incrementInterval: number = 7 // Days between increments
  ) {}

  calculateMultiplier(streak: number): number {
    const intervals = Math.floor(streak / this.incrementInterval);
    const multiplier = this.baseMultiplier + intervals * this.incrementPerWeek;
    const clampedMin = Math.max(multiplier, this.baseMultiplier);
    return Math.min(clampedMin, this.maxMultiplier);
  }

  getMultiplierTiers(): MultiplierTier[] {
    const tiers: MultiplierTier[] = [];
    let currentStreak = 0;
    let tierIndex = 0;
    
    while (currentStreak < 365 && this.calculateMultiplier(currentStreak) < this.maxMultiplier) {
      const nextStreak = currentStreak + this.incrementInterval;
      const multiplier = this.calculateMultiplier(currentStreak);
      
      tiers.push({
        minStreak: currentStreak,
        maxStreak: nextStreak - 1,
        multiplier,
        name: `Level ${tierIndex + 1}`,
        description: `${this.incrementInterval * tierIndex}-${this.incrementInterval * (tierIndex + 1) - 1} days`,
        icon: this.getLinearTierIcon(tierIndex),
        color: this.getLinearTierColor(tierIndex)
      });
      
      currentStreak = nextStreak;
      tierIndex++;
    }
    
    // Add final tier for max multiplier
    if (tiers.length > 0) {
      tiers.push({
        minStreak: currentStreak,
        maxStreak: null,
        multiplier: this.maxMultiplier,
        name: `Max Level`,
        description: `${currentStreak}+ days`,
        icon: '🌟',
        color: '#ffd700'
      });
    }
    
    return tiers;
  }

  getCurrentTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    return tiers.find(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    ) || null;
  }

  getNextTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    const currentIndex = tiers.findIndex(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    );
    
    return currentIndex >= 0 && currentIndex < tiers.length - 1
      ? tiers[currentIndex + 1] ?? null
      : null;
  }

  getProgressToNextTier(streak: number): number {
    const currentTier = this.getCurrentTier(streak);
    const nextTier = this.getNextTier(streak);
    
    if (!currentTier || !nextTier) {
      return 1.0;
    }

    const tierRange = nextTier.minStreak - currentTier.minStreak;
    const progressInTier = streak - currentTier.minStreak;
    
    return Math.min(progressInTier / tierRange, 1.0);
  }

  private getLinearTierIcon(tierIndex: number): string {
    const icons = ['🌱', '🌿', '🔥', '⚡', '💎', '⭐', '🌟'];
    const index = Math.min(Math.max(tierIndex, 0), icons.length - 1);
    return icons[index] ?? icons[icons.length - 1] ?? '🌟';
  }

  private getLinearTierColor(tierIndex: number): string {
    const colors = [
      '#22c55e', '#16a34a', '#f97316', '#ea580c', 
      '#3b82f6', '#2563eb', '#8b5cf6', '#7c3aed'
    ];
    const index = Math.min(Math.max(tierIndex, 0), colors.length - 1);
    return colors[index] ?? colors[colors.length - 1] ?? '#22c55e';
  }
}

// ================================
// Exponential Multiplier Strategy
// ================================

export class ExponentialMultiplierStrategy implements MultiplierStrategy {

  constructor(
    private baseMultiplier: number = 1.0,
    private exponentBase: number = 1.05, // 5% increase per interval
    private maxMultiplier: number = 5.0,
    private intervalDays: number = 7
  ) {}

  calculateMultiplier(streak: number): number {
    const intervals = Math.floor(streak / this.intervalDays);
    const multiplier = this.baseMultiplier * Math.pow(this.exponentBase, intervals);
    return Math.min(multiplier, this.maxMultiplier);
  }

  getMultiplierTiers(): MultiplierTier[] {
    const tiers: MultiplierTier[] = [];
    let currentStreak = 0;
    let tierIndex = 0;
    
    while (currentStreak < 365 && this.calculateMultiplier(currentStreak) < this.maxMultiplier) {
      const nextStreak = currentStreak + this.intervalDays;
      const multiplier = this.calculateMultiplier(currentStreak);
      
      tiers.push({
        minStreak: currentStreak,
        maxStreak: nextStreak - 1,
        multiplier: Number(multiplier.toFixed(2)),
        name: `Exponential ${tierIndex + 1}`,
        description: `${currentStreak}-${nextStreak - 1} days`,
        icon: this.getExponentialTierIcon(multiplier),
        color: this.getExponentialTierColor(multiplier)
      });
      
      currentStreak = nextStreak;
      tierIndex++;
      
      // Safety check to prevent infinite loops
      if (tierIndex > 50) break;
    }
    
    // Add final tier
    if (tiers.length > 0) {
      tiers.push({
        minStreak: currentStreak,
        maxStreak: null,
        multiplier: this.maxMultiplier,
        name: 'Ultimate',
        description: `${currentStreak}+ days`,
        icon: '🚀',
        color: '#ff6b6b'
      });
    }
    
    return tiers;
  }

  getCurrentTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    return tiers.find(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    ) || null;
  }

  getNextTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    const currentIndex = tiers.findIndex(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    );
    
    return currentIndex >= 0 && currentIndex < tiers.length - 1
      ? tiers[currentIndex + 1] ?? null
      : null;
  }

  getProgressToNextTier(streak: number): number {
    const currentTier = this.getCurrentTier(streak);
    const nextTier = this.getNextTier(streak);
    
    if (!currentTier || !nextTier) {
      return 1.0;
    }

    const tierRange = nextTier.minStreak - currentTier.minStreak;
    const progressInTier = streak - currentTier.minStreak;
    
    return Math.min(progressInTier / tierRange, 1.0);
  }

  private getExponentialTierIcon(multiplier: number): string {
    if (multiplier < 1.5) return '🌱';
    if (multiplier < 2.0) return '🔥';
    if (multiplier < 3.0) return '⚡';
    if (multiplier < 4.0) return '💎';
    return '🚀';
  }

  private getExponentialTierColor(multiplier: number): string {
    const intensity = Math.min(multiplier / this.maxMultiplier, 1.0);
    const red = Math.floor(255 * intensity);
    const green = Math.floor(255 * (1 - intensity * 0.7));
    const blue = Math.floor(100 + 155 * (1 - intensity));
    
    return `rgb(${red}, ${green}, ${blue})`;
  }
}

// ================================
// Seasonal/Event Multiplier Strategy
// ================================

export class SeasonalMultiplierStrategy implements MultiplierStrategy {

  constructor(
    private baseStrategy: MultiplierStrategy,
    private seasonalMultiplier: number = 1.5,
    private eventStartDate?: Date,
    private eventEndDate?: Date,
    private eventName: string = 'Special Event'
  ) {}

  calculateMultiplier(streak: number): number {
    const baseMultiplier = this.baseStrategy.calculateMultiplier(streak);
    
    if (this.isEventActive()) {
      return baseMultiplier * this.seasonalMultiplier;
    }
    
    return baseMultiplier;
  }

  getMultiplierTiers(): MultiplierTier[] {
    const baseTiers = this.baseStrategy.getMultiplierTiers();
    
    if (this.isEventActive()) {
      return baseTiers.map(tier => ({
        ...tier,
        multiplier: tier.multiplier * this.seasonalMultiplier,
        name: `${this.eventName} ${tier.name}`,
        description: `${tier.description} (${this.eventName} Bonus!)`,
        color: this.adjustColorForEvent(tier.color || '#3b82f6')
      }));
    }
    
    return baseTiers;
  }

  getCurrentTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    return tiers.find(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    ) || null;
  }

  getNextTier(streak: number): MultiplierTier | null {
    const tiers = this.getMultiplierTiers();
    const currentIndex = tiers.findIndex(tier => 
      streak >= tier.minStreak && 
      (tier.maxStreak === null || streak <= tier.maxStreak)
    );
    
    return currentIndex >= 0 && currentIndex < tiers.length - 1
      ? tiers[currentIndex + 1] ?? null
      : null;
  }

  getProgressToNextTier(streak: number): number {
    return this.baseStrategy.getProgressToNextTier(streak);
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

  private adjustColorForEvent(baseColor: string): string {
    // Add golden tint for events
    return baseColor.replace('#', '#ff');
  }

  /**
   * Get event information
   */
  getEventInfo() {
    return {
      name: this.eventName,
      isActive: this.isEventActive(),
      multiplier: this.seasonalMultiplier,
      startDate: this.eventStartDate,
      endDate: this.eventEndDate
    };
  }
}

// ================================
// Factory Functions
// ================================

export const createTieredMultiplier = (customTiers?: MultiplierTier[]): MultiplierStrategy => {
  return new TieredMultiplierStrategy(customTiers);
};

export const createLinearMultiplier = (
  baseMultiplier?: number,
  incrementPerWeek?: number,
  maxMultiplier?: number,
  incrementInterval?: number
): MultiplierStrategy => {
  return new LinearMultiplierStrategy(
    baseMultiplier, 
    incrementPerWeek, 
    maxMultiplier, 
    incrementInterval
  );
};

export const createExponentialMultiplier = (
  baseMultiplier?: number,
  exponentBase?: number,
  maxMultiplier?: number,
  intervalDays?: number
): MultiplierStrategy => {
  return new ExponentialMultiplierStrategy(
    baseMultiplier, 
    exponentBase, 
    maxMultiplier, 
    intervalDays
  );
};

export const createSeasonalMultiplier = (
  baseStrategy: MultiplierStrategy,
  seasonalMultiplier: number,
  eventStartDate?: Date,
  eventEndDate?: Date,
  eventName?: string
): MultiplierStrategy => {
  return new SeasonalMultiplierStrategy(
    baseStrategy,
    seasonalMultiplier,
    eventStartDate,
    eventEndDate,
    eventName
  );
};

// ================================
// Predefined Configurations
// ================================

export const MULTIPLIER_PRESETS = {
  // Conservative growth for new users
  conservative: createTieredMultiplier([
    { minStreak: 0, maxStreak: 13, multiplier: 1.0, name: 'Starter', icon: '🌱', color: '#22c55e' },
    { minStreak: 14, maxStreak: 49, multiplier: 1.3, name: 'Regular', icon: '🔥', color: '#f97316' },
    { minStreak: 50, maxStreak: 149, multiplier: 1.6, name: 'Committed', icon: '⚡', color: '#3b82f6' },
    { minStreak: 150, maxStreak: null, multiplier: 2.0, name: 'Master', icon: '💎', color: '#8b5cf6' }
  ]),

  // Aggressive growth for gamification
  aggressive: createLinearMultiplier(1.0, 0.15, 4.0, 5),

  // Exponential for power users
  exponential: createExponentialMultiplier(1.0, 1.07, 6.0, 10),

  // Balanced approach (default)
  balanced: createTieredMultiplier()
} as const;

// ================================
// Utility Functions
// ================================

export const getMultiplierColor = (multiplier: number): string => {
  if (multiplier < 1.5) return '#22c55e'; // Green
  if (multiplier < 2.0) return '#f97316'; // Orange  
  if (multiplier < 2.5) return '#3b82f6'; // Blue
  if (multiplier < 3.0) return '#8b5cf6'; // Purple
  return '#eab308'; // Gold
};

export const formatMultiplier = (multiplier: number): string => {
  return `${multiplier.toFixed(1)}x`;
};

export const getMultiplierDescription = (multiplier: number): string => {
  if (multiplier === 1.0) return 'Standard rewards';
  if (multiplier < 1.5) return 'Small bonus';
  if (multiplier < 2.0) return 'Good bonus';
  if (multiplier < 2.5) return 'Great bonus';
  if (multiplier < 3.0) return 'Excellent bonus';
  return 'Maximum bonus';
};
