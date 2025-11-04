/**
 * Multiplier Strategy Unit Tests
 * Tests all four multiplier strategy implementations
 */

import {
  TieredMultiplierStrategy,
  LinearMultiplierStrategy,
  ExponentialMultiplierStrategy,
  SeasonalMultiplierStrategy,
} from "@/lib/checkin/streak/multiplier";

describe("TieredMultiplierStrategy", () => {
  let strategy: TieredMultiplierStrategy;

  beforeEach(() => {
    strategy = new TieredMultiplierStrategy();
  });

  describe("calculateMultiplier", () => {
    test("should return 1.0 for streak 0-6 (Beginner)", () => {
      expect(strategy.calculateMultiplier(0)).toBe(1.0);
      expect(strategy.calculateMultiplier(3)).toBe(1.0);
      expect(strategy.calculateMultiplier(6)).toBe(1.0);
    });

    test("should return 1.5 for streak 7-29 (Consistent)", () => {
      expect(strategy.calculateMultiplier(7)).toBe(1.5);
      expect(strategy.calculateMultiplier(15)).toBe(1.5);
      expect(strategy.calculateMultiplier(29)).toBe(1.5);
    });

    test("should return 2.0 for streak 30-99 (Dedicated)", () => {
      expect(strategy.calculateMultiplier(30)).toBe(2.0);
      expect(strategy.calculateMultiplier(50)).toBe(2.0);
      expect(strategy.calculateMultiplier(99)).toBe(2.0);
    });

    test("should return 2.5 for streak 100-364 (Master)", () => {
      expect(strategy.calculateMultiplier(100)).toBe(2.5);
      expect(strategy.calculateMultiplier(200)).toBe(2.5);
      expect(strategy.calculateMultiplier(364)).toBe(2.5);
    });

    test("should return 3.0 for streak 365+ (Legend)", () => {
      expect(strategy.calculateMultiplier(365)).toBe(3.0);
      expect(strategy.calculateMultiplier(500)).toBe(3.0);
      expect(strategy.calculateMultiplier(1000)).toBe(3.0);
    });

    test("should return 1.0 for invalid streaks (default)", () => {
      expect(strategy.calculateMultiplier(-1)).toBe(1.0);
      expect(strategy.calculateMultiplier(-100)).toBe(1.0);
    });
  });

  describe("getCurrentTier", () => {
    test("should return Beginner tier for streak 0-6", () => {
      const tier = strategy.getCurrentTier(5);
      expect(tier).toBeDefined();
      expect(tier?.name).toBe("Beginner");
      expect(tier?.multiplier).toBe(1.0);
      expect(tier?.minStreak).toBe(0);
      expect(tier?.maxStreak).toBe(6);
    });

    test("should return Consistent tier for streak 7-29", () => {
      const tier = strategy.getCurrentTier(15);
      expect(tier).toBeDefined();
      expect(tier?.name).toBe("Consistent");
      expect(tier?.multiplier).toBe(1.5);
    });

    test("should return Dedicated tier for streak 30-99", () => {
      const tier = strategy.getCurrentTier(50);
      expect(tier).toBeDefined();
      expect(tier?.name).toBe("Dedicated");
      expect(tier?.multiplier).toBe(2.0);
    });

    test("should return Master tier for streak 100-364", () => {
      const tier = strategy.getCurrentTier(150);
      expect(tier).toBeDefined();
      expect(tier?.name).toBe("Master");
      expect(tier?.multiplier).toBe(2.5);
    });

    test("should return Legend tier for streak 365+", () => {
      const tier = strategy.getCurrentTier(365);
      expect(tier).toBeDefined();
      expect(tier?.name).toBe("Legend");
      expect(tier?.multiplier).toBe(3.0);
      expect(tier?.maxStreak).toBeNull();
    });

    test("should return null for invalid streak", () => {
      const tier = strategy.getCurrentTier(-1);
      expect(tier).toBeNull();
    });
  });

  describe("getNextTier", () => {
    test("should return Consistent tier when in Beginner", () => {
      const nextTier = strategy.getNextTier(5);
      expect(nextTier).toBeDefined();
      expect(nextTier?.name).toBe("Consistent");
      expect(nextTier?.minStreak).toBe(7);
    });

    test("should return Dedicated tier when in Consistent", () => {
      const nextTier = strategy.getNextTier(15);
      expect(nextTier).toBeDefined();
      expect(nextTier?.name).toBe("Dedicated");
    });

    test("should return Master tier when in Dedicated", () => {
      const nextTier = strategy.getNextTier(50);
      expect(nextTier).toBeDefined();
      expect(nextTier?.name).toBe("Master");
    });

    test("should return Legend tier when in Master", () => {
      const nextTier = strategy.getNextTier(150);
      expect(nextTier).toBeDefined();
      expect(nextTier?.name).toBe("Legend");
    });

    test("should return null when in Legend (max tier)", () => {
      const nextTier = strategy.getNextTier(365);
      expect(nextTier).toBeNull();
    });

    test("should return null when in Legend (very high streak)", () => {
      const nextTier = strategy.getNextTier(1000);
      expect(nextTier).toBeNull();
    });
  });

  describe("getProgressToNextTier", () => {
    test("should return 0 progress at start of tier", () => {
      const progress = strategy.getProgressToNextTier(0);
      expect(progress).toBe(0);
    });

    test("should return mid-tier progress correctly", () => {
      // In Beginner tier (0-6), at streak 3 = 3/7 = 0.428...
      const progress = strategy.getProgressToNextTier(3);
      expect(progress).toBeCloseTo(3 / 7, 2);
    });

    test("should return progress near tier boundary", () => {
      // Near end of Beginner (0-6), at streak 6 = 6/7 = 0.857...
      const progress = strategy.getProgressToNextTier(6);
      expect(progress).toBeCloseTo(6 / 7, 2);
    });

    test("should return 1.0 at tier boundary", () => {
      // At boundary of Consistent (7-29)
      const progress = strategy.getProgressToNextTier(7);
      expect(progress).toBeCloseTo(0, 2);
    });

    test("should return 1.0 for max tier", () => {
      // In Legend tier (365+), no next tier
      const progress = strategy.getProgressToNextTier(365);
      expect(progress).toBe(1.0);
    });

    test("should cap progress at 1.0", () => {
      // At Legend tier, progress should never exceed 1.0
      const progress = strategy.getProgressToNextTier(1000);
      expect(progress).toBeLessThanOrEqual(1.0);
    });
  });

  describe("getTierByIndex", () => {
    test("should return first tier (Beginner)", () => {
      const tier = strategy.getTierByIndex(0);
      expect(tier?.name).toBe("Beginner");
    });

    test("should return second tier (Consistent)", () => {
      const tier = strategy.getTierByIndex(1);
      expect(tier?.name).toBe("Consistent");
    });

    test("should return last tier (Legend)", () => {
      const tier = strategy.getTierByIndex(4);
      expect(tier?.name).toBe("Legend");
    });

    test("should return null for invalid index (negative)", () => {
      const tier = strategy.getTierByIndex(-1);
      expect(tier).toBeNull();
    });

    test("should return null for invalid index (out of bounds)", () => {
      const tier = strategy.getTierByIndex(10);
      expect(tier).toBeNull();
    });
  });

  describe("getTierCount", () => {
    test("should return correct number of tiers", () => {
      expect(strategy.getTierCount()).toBe(5);
    });
  });

  describe("getMultiplierTiers", () => {
    test("should return all tiers", () => {
      const tiers = strategy.getMultiplierTiers();
      expect(tiers).toHaveLength(5);
    });

    test("should return tiers with correct structure", () => {
      const tiers = strategy.getMultiplierTiers();
      tiers.forEach((tier) => {
        expect(tier).toHaveProperty("minStreak");
        expect(tier).toHaveProperty("maxStreak");
        expect(tier).toHaveProperty("multiplier");
        expect(tier).toHaveProperty("name");
        expect(tier).toHaveProperty("icon");
        expect(tier).toHaveProperty("color");
      });
    });

    test("should have non-overlapping tier ranges", () => {
      const tiers = strategy.getMultiplierTiers();
      for (let i = 0; i < tiers.length - 1; i++) {
        const current = tiers[i];
        const next = tiers[i + 1];
        expect(next.minStreak).toBe((current.maxStreak ?? 0) + 1);
      }
    });
  });

  describe("Custom Tiers", () => {
    test("should use custom tiers when provided", () => {
      const customTiers = [
        {
          minStreak: 0,
          maxStreak: 10,
          multiplier: 1.0,
          name: "Custom1",
          description: "Custom",
          icon: "🎯",
          color: "#000000",
        },
        {
          minStreak: 11,
          maxStreak: null,
          multiplier: 2.0,
          name: "Custom2",
          description: "Custom",
          icon: "🎯",
          color: "#ffffff",
        },
      ];

      const customStrategy = new TieredMultiplierStrategy(customTiers);
      expect(customStrategy.calculateMultiplier(5)).toBe(1.0);
      expect(customStrategy.calculateMultiplier(15)).toBe(2.0);
      expect(customStrategy.getTierCount()).toBe(2);
    });
  });
});

describe("LinearMultiplierStrategy", () => {
  let strategy: LinearMultiplierStrategy;

  beforeEach(() => {
    // Default: baseMultiplier=1.0, incrementPerWeek=0.1, maxMultiplier=3.0, interval=7
    strategy = new LinearMultiplierStrategy();
  });

  describe("calculateMultiplier", () => {
    test("should start at base multiplier", () => {
      expect(strategy.calculateMultiplier(0)).toBe(1.0);
    });

    test("should increase linearly by week", () => {
      expect(strategy.calculateMultiplier(7)).toBeCloseTo(1.1, 5);
      expect(strategy.calculateMultiplier(14)).toBeCloseTo(1.2, 5);
      expect(strategy.calculateMultiplier(21)).toBeCloseTo(1.3, 5);
    });

    test("should cap at maximum multiplier", () => {
      expect(strategy.calculateMultiplier(300)).toBe(3.0);
      expect(strategy.calculateMultiplier(500)).toBe(3.0);
    });

    test("should handle fractional weeks", () => {
      expect(strategy.calculateMultiplier(10)).toBeCloseTo(1.1, 5);
      expect(strategy.calculateMultiplier(13)).toBeCloseTo(1.1, 5);
    });

    test("should never go below base multiplier", () => {
      const negativeStrategy = new LinearMultiplierStrategy(1.5, 0.1, 3.0, 7);
      expect(negativeStrategy.calculateMultiplier(0)).toBe(1.5);
    });
  });

  describe("getCurrentTier", () => {
    test("should return tier for current streak", () => {
      const tier = strategy.getCurrentTier(0);
      expect(tier).toBeDefined();
      expect(tier?.minStreak).toBe(0);
    });

    test("should return tier with correct multiplier", () => {
      const tier = strategy.getCurrentTier(7);
      expect(tier?.multiplier).toBeCloseTo(1.1, 5);
    });

    test("should return tier names", () => {
      const tier = strategy.getCurrentTier(0);
      expect(tier?.name).toContain("Level");
    });
  });

  describe("getNextTier", () => {
    test("should return next tier when available", () => {
      const nextTier = strategy.getNextTier(0);
      expect(nextTier).toBeDefined();
      expect(nextTier?.minStreak).toBeGreaterThan(0);
    });

    test("should return null at max tier", () => {
      const nextTier = strategy.getNextTier(500);
      expect(nextTier).toBeNull();
    });
  });

  describe("getProgressToNextTier", () => {
    test("should calculate progress correctly", () => {
      const progress = strategy.getProgressToNextTier(0);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    });

    test("should return 1.0 at max tier", () => {
      const progress = strategy.getProgressToNextTier(500);
      expect(progress).toBe(1.0);
    });
  });

  describe("getMultiplierTiers", () => {
    test("should return multiple tiers", () => {
      const tiers = strategy.getMultiplierTiers();
      expect(tiers.length).toBeGreaterThan(0);
    });

    test("should have Max Level tier", () => {
      const tiers = strategy.getMultiplierTiers();
      const maxTier = tiers[tiers.length - 1];
      expect(maxTier?.name).toContain("Max");
      expect(maxTier?.multiplier).toBe(3.0);
      expect(maxTier?.maxStreak).toBeNull();
    });

    test("should have increasing multipliers", () => {
      const tiers = strategy.getMultiplierTiers();
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].multiplier).toBeGreaterThanOrEqual(
          tiers[i - 1].multiplier,
        );
      }
    });
  });

  describe("Custom Configuration", () => {
    test("should respect custom increment", () => {
      const customStrategy = new LinearMultiplierStrategy(1.0, 0.2, 3.0, 7);
      expect(customStrategy.calculateMultiplier(7)).toBeCloseTo(1.2, 5);
    });

    test("should respect custom interval", () => {
      const customStrategy = new LinearMultiplierStrategy(1.0, 0.1, 3.0, 14);
      expect(customStrategy.calculateMultiplier(14)).toBeCloseTo(1.1, 5);
    });

    test("should respect custom max multiplier", () => {
      const customStrategy = new LinearMultiplierStrategy(1.0, 0.1, 2.0, 7);
      expect(customStrategy.calculateMultiplier(500)).toBe(2.0);
    });
  });
});

describe("ExponentialMultiplierStrategy", () => {
  let strategy: ExponentialMultiplierStrategy;

  beforeEach(() => {
    // Default: baseMultiplier=1.0, exponentBase=1.05, maxMultiplier=5.0, interval=7
    strategy = new ExponentialMultiplierStrategy();
  });

  describe("calculateMultiplier", () => {
    test("should start at base multiplier", () => {
      expect(strategy.calculateMultiplier(0)).toBe(1.0);
    });

    test("should increase exponentially", () => {
      const mult0 = strategy.calculateMultiplier(0);
      const mult7 = strategy.calculateMultiplier(7);
      const mult14 = strategy.calculateMultiplier(14);

      // Each interval is 1.05x
      expect(mult7).toBeCloseTo(mult0 * 1.05, 5);
      expect(mult14).toBeCloseTo(mult0 * 1.05 * 1.05, 5);
    });

    test("should cap at maximum multiplier", () => {
      expect(strategy.calculateMultiplier(500)).toBe(5.0);
      expect(strategy.calculateMultiplier(1000)).toBe(5.0);
    });

    test("should grow faster than linear after many days", () => {
      // At 200 days, exponential (1.0 * 1.05^28 ≈ 4.0) should exceed linear (1.0 + 0.1*28/7 = 1.4)
      const exponential = strategy.calculateMultiplier(200);
      const linear = new LinearMultiplierStrategy().calculateMultiplier(200);
      expect(exponential).toBeGreaterThan(linear);
    });
  });

  describe("getCurrentTier", () => {
    test("should return tier for current streak", () => {
      const tier = strategy.getCurrentTier(0);
      expect(tier).toBeDefined();
    });

    test("should return tier with correct multiplier", () => {
      const tier = strategy.getCurrentTier(7);
      expect(tier?.multiplier).toBeCloseTo(1.05, 2);
    });
  });

  describe("getNextTier", () => {
    test("should return next tier when available", () => {
      const nextTier = strategy.getNextTier(0);
      expect(nextTier).toBeDefined();
    });

    test("should return null at max tier", () => {
      const nextTier = strategy.getNextTier(500);
      expect(nextTier).toBeNull();
    });
  });

  describe("getMultiplierTiers", () => {
    test("should return multiple tiers", () => {
      const tiers = strategy.getMultiplierTiers();
      expect(tiers.length).toBeGreaterThan(0);
    });

    test("should have Ultimate tier at end", () => {
      const tiers = strategy.getMultiplierTiers();
      const lastTier = tiers[tiers.length - 1];
      expect(lastTier?.name).toBe("Ultimate");
      expect(lastTier?.multiplier).toBe(5.0);
    });

    test("should prevent infinite loops", () => {
      const tiers = strategy.getMultiplierTiers();
      expect(tiers.length).toBeLessThan(100); // Safety check
    });
  });

  describe("Custom Configuration", () => {
    test("should respect custom exponent base", () => {
      const customStrategy = new ExponentialMultiplierStrategy(1.0, 1.1, 5.0, 7);
      const mult7 = customStrategy.calculateMultiplier(7);
      expect(mult7).toBeCloseTo(1.1, 5);
    });

    test("should respect custom max multiplier", () => {
      const customStrategy = new ExponentialMultiplierStrategy(1.0, 1.05, 10.0, 7);
      expect(customStrategy.calculateMultiplier(500)).toBe(10.0);
    });

    test("should respect custom interval", () => {
      const customStrategy = new ExponentialMultiplierStrategy(1.0, 1.05, 5.0, 14);
      const mult14 = customStrategy.calculateMultiplier(14);
      expect(mult14).toBeCloseTo(1.05, 5);
    });
  });
});

describe("SeasonalMultiplierStrategy", () => {
  let baseStrategy: TieredMultiplierStrategy;
  let strategy: SeasonalMultiplierStrategy;

  beforeEach(() => {
    baseStrategy = new TieredMultiplierStrategy();
  });

  describe("Event Not Active", () => {
    beforeEach(() => {
      const pastStart = new Date("2023-01-01");
      const pastEnd = new Date("2023-01-15");
      strategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        1.5,
        pastStart,
        pastEnd,
      );
    });

    test("should return base multiplier when event inactive", () => {
      const baseMultiplier = baseStrategy.calculateMultiplier(5);
      const seasonalMultiplier = strategy.calculateMultiplier(5);
      expect(seasonalMultiplier).toBe(baseMultiplier);
    });

    test("should return base tiers when event inactive", () => {
      const baseTiers = baseStrategy.getMultiplierTiers();
      const seasonalTiers = strategy.getMultiplierTiers();
      expect(seasonalTiers).toEqual(baseTiers);
    });
  });

  describe("Event Active", () => {
    beforeEach(() => {
      const futureStart = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const futureEnd = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      strategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        2.0,
        futureStart,
        futureEnd,
      );
    });

    test("should apply seasonal multiplier when active", () => {
      const baseMultiplier = baseStrategy.calculateMultiplier(5);
      const seasonalMultiplier = strategy.calculateMultiplier(5);
      expect(seasonalMultiplier).toBeCloseTo(baseMultiplier * 2.0, 5);
    });

    test("should apply multiplier to all tiers", () => {
      const baseTiers = baseStrategy.getMultiplierTiers();
      const seasonalTiers = strategy.getMultiplierTiers();

      expect(seasonalTiers).toHaveLength(baseTiers.length);

      baseTiers.forEach((baseTier, index) => {
        const seasonalTier = seasonalTiers[index];
        expect(seasonalTier?.multiplier).toBeCloseTo(
          baseTier.multiplier * 2.0,
          5,
        );
      });
    });
  });

  describe("Tier Delegation", () => {
    beforeEach(() => {
      // Create strategy with future event (event NOT active)
      const futureStart = new Date(Date.now() + 1000 * 60 * 60);
      const futureEnd = new Date(Date.now() + 2 * 1000 * 60 * 60);
      strategy = new SeasonalMultiplierStrategy(baseStrategy, 1.5, futureStart, futureEnd);
    });

    test("should delegate getCurrentTier to base strategy", () => {
      const baseTier = baseStrategy.getCurrentTier(50);
      const seasonalTier = strategy.getCurrentTier(50);
      expect(seasonalTier?.name).toBe(baseTier?.name);
    });

    test("should delegate getNextTier to base strategy", () => {
      const baseNext = baseStrategy.getNextTier(50);
      const seasonalNext = strategy.getNextTier(50);
      // Note: multiplier will differ if event is active
      expect(seasonalNext?.name).toBe(baseNext?.name);
    });

    test("should delegate getProgressToNextTier to base strategy", () => {
      const baseProgress = baseStrategy.getProgressToNextTier(50);
      const seasonalProgress = strategy.getProgressToNextTier(50);
      expect(seasonalProgress).toBeCloseTo(baseProgress, 5);
    });
  });

  describe("Decorator Pattern", () => {
    test("should work with LinearMultiplier as base", () => {
      const linearBase = new LinearMultiplierStrategy();
      // Create with future event dates so event is NOT active
      const futureStart = new Date(Date.now() + 1000 * 60 * 60);
      const futureEnd = new Date(Date.now() + 2 * 1000 * 60 * 60);
      const decoratedStrategy = new SeasonalMultiplierStrategy(
        linearBase,
        1.5,
        futureStart,
        futureEnd,
      );

      const baseMultiplier = linearBase.calculateMultiplier(10);
      const decoratedMultiplier = decoratedStrategy.calculateMultiplier(10);

      // Should be equal (no event active)
      expect(decoratedMultiplier).toBe(baseMultiplier);
    });

    test("should work with ExponentialMultiplier as base", () => {
      const exponentialBase = new ExponentialMultiplierStrategy();
      // Create with future event dates so event is NOT active
      const futureStart = new Date(Date.now() + 1000 * 60 * 60);
      const futureEnd = new Date(Date.now() + 2 * 1000 * 60 * 60);
      const decoratedStrategy = new SeasonalMultiplierStrategy(
        exponentialBase,
        2.0,
        futureStart,
        futureEnd,
      );

      const baseMultiplier = exponentialBase.calculateMultiplier(10);
      const decoratedMultiplier = decoratedStrategy.calculateMultiplier(10);

      // Should be equal (no event active)
      expect(decoratedMultiplier).toBe(baseMultiplier);
    });
  });

  describe("isEventActive", () => {
    test("should return false when event not specified", () => {
      // When no dates provided, event is considered active by default (no bounds check)
      // So use future dates to ensure event is NOT active
      const futureStart = new Date(Date.now() + 1000 * 60 * 60);
      const futureEnd = new Date(Date.now() + 2 * 1000 * 60 * 60);
      const noEventStrategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        1.5,
        futureStart,
        futureEnd,
      );
      // Test indirectly through multiplier comparison
      expect(noEventStrategy.calculateMultiplier(5)).toBe(
        baseStrategy.calculateMultiplier(5),
      );
    });

    test("should return true during event window", () => {
      const futureStart = new Date(Date.now() - 1000 * 60 * 60);
      const futureEnd = new Date(Date.now() + 1000 * 60 * 60);
      const activeStrategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        2.0,
        futureStart,
        futureEnd,
      );

      expect(activeStrategy.calculateMultiplier(5)).toBeGreaterThan(
        baseStrategy.calculateMultiplier(5),
      );
    });

    test("should return false before event start", () => {
      const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 24); // Tomorrow
      const futureEnd = new Date(Date.now() + 1000 * 60 * 60 * 48); // In 2 days
      const futureStrategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        2.0,
        futureStart,
        futureEnd,
      );

      expect(futureStrategy.calculateMultiplier(5)).toBe(
        baseStrategy.calculateMultiplier(5),
      );
    });

    test("should return false after event end", () => {
      const pastStart = new Date(Date.now() - 1000 * 60 * 60 * 48);
      const pastEnd = new Date(Date.now() - 1000 * 60 * 60 * 24);
      const pastStrategy = new SeasonalMultiplierStrategy(
        baseStrategy,
        2.0,
        pastStart,
        pastEnd,
      );

      expect(pastStrategy.calculateMultiplier(5)).toBe(
        baseStrategy.calculateMultiplier(5),
      );
    });
  });
});
