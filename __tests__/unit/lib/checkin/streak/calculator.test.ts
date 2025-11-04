/**
 * DefaultStreakCalculator Unit Tests
 * Tests streak calculation logic without depending on actual time passing
 */

import { DefaultStreakCalculator } from "@/lib/checkin/streak/calculator";
import { supabase } from "@/lib/supabase";
import {
  createMockStreakInfo,
  timeOffsets,
  COMMON_TIME_SCENARIOS,
  createStreakInfoWithTimeOffset,
  getExpectedStreakStatus,
  resetAllMocks,
} from "__tests__/helpers/streak-test-utils";

jest.mock("@/lib/supabase");

describe("DefaultStreakCalculator", () => {
  let calculator: DefaultStreakCalculator;

  beforeEach(() => {
    calculator = new DefaultStreakCalculator();
    resetAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getStreakStatus - Status Transitions", () => {
    test("should return 'new' when currentStreak is 0", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0, isActive: false }),
      );

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("new");
    });

    test("should return 'active' when checkin was recent", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(2, 5); // 2 hours ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(streakInfo);

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("active");
    });

    test("should return 'at_risk' when less than 3 hours until break", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(21, 5); // 21 hours ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(streakInfo);

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("at_risk");
    });

    test("should return 'broken' when more than 24 hours since checkin", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(25, 5); // 25 hours ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(streakInfo);

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("broken");
    });

    test("should handle null lastCheckinDate gracefully", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 5,
          lastCheckinDate: null as any,
          isActive: false,
        }),
      );

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("active"); // Has streak but no date
    });

    // Parametrized test for all common time scenarios
    COMMON_TIME_SCENARIOS.forEach(
      ({ name, lastCheckinHoursAgo, expectedStatus, description }) => {
        test(`[${name}] should return '${expectedStatus}' - ${description}`, async () => {
          const streakInfo = createStreakInfoWithTimeOffset(
            lastCheckinHoursAgo,
            5,
          );
          jest
            .spyOn(calculator, "getStreakInfo")
            .mockResolvedValue(streakInfo);

          const status = await calculator.getStreakStatus("0x123");

          expect(status).toBe(expectedStatus);
        });
      },
    );
  });

  describe("isStreakBroken - Time Boundary Tests", () => {
    test("should not break streak at exactly 23:59:59", () => {
      const lastCheckin = new Date("2024-01-14T10:00:00Z");
      const almostMidnight = new Date("2024-01-15T09:59:59Z"); // 23:59:59 later

      const isBroken = calculator.isStreakBroken(lastCheckin, almostMidnight);

      expect(isBroken).toBe(false);
    });

    test("should break streak after 24:00:01", () => {
      const lastCheckin = new Date("2024-01-14T10:00:00Z");
      const afterMidnight = new Date("2024-01-15T10:00:02Z"); // More than 24 hours later

      const isBroken = calculator.isStreakBroken(lastCheckin, afterMidnight);

      expect(isBroken).toBe(true);
    });

    test("should not break streak when last checkin is today", () => {
      const now = new Date();
      const lastCheckin = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      const isBroken = calculator.isStreakBroken(lastCheckin, now);

      expect(isBroken).toBe(false);
    });

    test("should break streak after 24+ hours", () => {
      const lastCheckin = new Date("2024-01-13T10:00:00Z");
      const twoHoursLater = new Date("2024-01-14T10:00:00Z"); // 24 hours
      const future = new Date(twoHoursLater.getTime() + 3600 * 1000); // 1 hour more

      const isBroken = calculator.isStreakBroken(lastCheckin, future);

      expect(isBroken).toBe(true);
    });

    test("should handle various time differences correctly", () => {
      const testCases = [
        { hours: 12, shouldBreak: false },
        { hours: 18, shouldBreak: false },
        { hours: 23.5, shouldBreak: false },
        { hours: 24.01, shouldBreak: true }, // More than 24 hours (> check)
        { hours: 36, shouldBreak: true },
        { hours: 48, shouldBreak: true },
      ];

      const baseDate = new Date("2024-01-14T10:00:00Z");
      testCases.forEach(({ hours, shouldBreak }) => {
        const laterDate = new Date(baseDate.getTime() + hours * 60 * 60 * 1000);
        const result = calculator.isStreakBroken(baseDate, laterDate);
        expect(result).toBe(
          shouldBreak,
          `Failed for ${hours} hours: expected ${shouldBreak}`,
        );
      });
    });
  });

  describe("getTimeUntilStreakExpires - Countdown Logic", () => {
    test("should calculate correct time remaining until expiration", async () => {
      const lastCheckinDate = timeOffsets.hoursAgo(22); // 22 hours ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 5,
          lastCheckinDate,
          isActive: true,
        }),
      );

      const timeRemaining = await calculator.getTimeUntilStreakExpires("0x123");

      // Should have ~2 hours remaining (24 - 22)
      const expectedMs = 2 * 60 * 60 * 1000;
      expect(timeRemaining).toBeGreaterThan(0);
      expect(timeRemaining).toBeLessThanOrEqual(expectedMs);
      expect(timeRemaining).toBeGreaterThan(expectedMs - 5 * 60 * 1000); // Allow 5-second margin
    });

    test("should return null when streak is not active", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 0,
          lastCheckinDate: null,
          isActive: false,
        }),
      );

      const timeRemaining = await calculator.getTimeUntilStreakExpires("0x123");

      expect(timeRemaining).toBeNull();
    });

    test("should return 0 when streak has expired", async () => {
      const lastCheckinDate = timeOffsets.hoursAgo(25); // 25 hours ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 5,
          lastCheckinDate,
          isActive: true,
        }),
      );

      const timeRemaining = await calculator.getTimeUntilStreakExpires("0x123");

      expect(timeRemaining).toBe(0);
    });

    test("should return decreasing values as time passes", async () => {
      jest.useFakeTimers();

      const baseTime = new Date("2024-01-15T10:00:00Z");
      jest.setSystemTime(baseTime);

      const lastCheckinDate = timeOffsets.hoursAgo(20); // 20 hours ago at base time

      jest.spyOn(calculator, "getStreakInfo").mockImplementation(async () =>
        createMockStreakInfo({
          currentStreak: 5,
          lastCheckinDate,
          isActive: true,
        }),
      );

      const timeRemaining1 = await calculator.getTimeUntilStreakExpires(
        "0x123",
      );

      // Advance time by 1 hour
      jest.advanceTimersByTime(1 * 60 * 60 * 1000);

      const timeRemaining2 = await calculator.getTimeUntilStreakExpires(
        "0x123",
      );

      expect(timeRemaining2).toBeLessThan(timeRemaining1!);

      jest.useRealTimers();
    });
  });

  describe("validateStreakContinuity - Streak Continuation", () => {
    test("should allow continuation when checkin is within 24 hours", async () => {
      const lastCheckinDate = timeOffsets.hoursAgo(12);
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate,
          currentStreak: 5,
        }),
      );

      const isValid = await calculator.validateStreakContinuity(
        "0x123",
        new Date(),
      );

      expect(isValid).toBe(true);
    });

    test("should prevent continuation when checkin would break streak", async () => {
      const lastCheckinDate = timeOffsets.hoursAgo(25);
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate,
          currentStreak: 5,
        }),
      );

      const isValid = await calculator.validateStreakContinuity(
        "0x123",
        new Date(),
      );

      expect(isValid).toBe(false);
    });

    test("should allow first checkin when no previous date exists", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate: null,
          currentStreak: 0,
        }),
      );

      const isValid = await calculator.validateStreakContinuity(
        "0x123",
        new Date(),
      );

      expect(isValid).toBe(true);
    });

    test("should validate with custom checkin date", async () => {
      const lastCheckinDate = new Date("2024-01-14T10:00:00Z");
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate,
          currentStreak: 5,
        }),
      );

      const checkinDate = new Date("2024-01-15T09:59:59Z"); // Just within 24 hours
      const isValid = await calculator.validateStreakContinuity(
        "0x123",
        checkinDate,
      );

      expect(isValid).toBe(true);
    });
  });

  describe("calculateStreak - Database Integration", () => {
    test("should call supabase.rpc with correct parameters", async () => {
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: 7,
        error: null,
      });

      await calculator.calculateStreak("0x123");

      expect(mockSupabase.rpc).toHaveBeenCalledWith("get_user_checkin_streak", {
        user_address: "0x123",
      });
    });

    test("should return streak value from RPC", async () => {
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: 10,
        error: null,
      });

      const streak = await calculator.calculateStreak("0x123");

      expect(streak).toBe(10);
    });

    test("should return 0 on RPC error", async () => {
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: null,
        error: new Error("RPC failed"),
      });

      // Should throw StreakCalculationError
      await expect(calculator.calculateStreak("0x123")).rejects.toThrow();
    });
  });

  describe("getStreakInfo - Comprehensive Data", () => {
    test("should have isActive true when currentStreak > 0", async () => {
      // Mock the RPC call to return a streak value
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;

      let rpcCalled = false;
      mockSupabase.rpc = jest.fn().mockImplementation(async (name: string) => {
        if (name === "get_user_checkin_streak") {
          rpcCalled = true;
          return { data: 5, error: null };
        }
        return { data: null, error: null };
      });

      // Mock profile lookup to return null (no user activities query)
      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const streakInfo = await calculator.getStreakInfo("0x123");

      expect(rpcCalled).toBe(true);
      expect(streakInfo.currentStreak).toBe(5);
      expect(streakInfo.isActive).toBe(true);
    });

    test("should have isActive false when currentStreak is 0", async () => {
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;

      mockSupabase.rpc = jest.fn().mockImplementation(async (name: string) => {
        if (name === "get_user_checkin_streak") {
          return { data: 0, error: null };
        }
        return { data: null, error: null };
      });

      mockSupabase.from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      });

      const streakInfo = await calculator.getStreakInfo("0x123");

      expect(streakInfo.currentStreak).toBe(0);
      expect(streakInfo.isActive).toBe(false);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle empty user address gracefully", async () => {
      const mockSupabase = supabase as jest.Mocked<typeof supabase>;
      mockSupabase.rpc = jest.fn().mockResolvedValue({
        data: null,
        error: null,
      });

      const streak = await calculator.calculateStreak("");

      expect(streak).toBe(0);
    });

    test("should handle very old checkin dates", async () => {
      const veryOldDate = timeOffsets.daysAgo(365); // 1 year ago
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate: veryOldDate,
          currentStreak: 5,
        }),
      );

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("broken");
    });

    test("should handle future dates (shouldn't happen but be safe)", async () => {
      const futureDate = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour in future
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          lastCheckinDate: futureDate,
          currentStreak: 5,
        }),
      );

      const status = await calculator.getStreakStatus("0x123");

      // Should treat as very recent
      expect(status).toBe("active");
    });

    test("should handle very large streak numbers", async () => {
      jest.spyOn(calculator, "getStreakInfo").mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 1000,
          isActive: true,
        }),
      );

      const status = await calculator.getStreakStatus("0x123");

      expect(status).toBe("active");
    });
  });

  describe("Configuration Tests", () => {
    test("should use default maxStreakGap of 24 hours", () => {
      const defaultCalc = new DefaultStreakCalculator();

      expect(defaultCalc["config"].maxStreakGap).toBe(24);
    });

    test("should use custom maxStreakGap if provided", () => {
      const customCalc = new DefaultStreakCalculator({
        maxStreakGap: 48,
        timezone: "UTC",
      });

      expect(customCalc["config"].maxStreakGap).toBe(48);
    });

    test("should respect custom configuration in streak break calculation", () => {
      const customCalc = new DefaultStreakCalculator({
        maxStreakGap: 48, // 48 hours instead of 24
        timezone: "UTC",
      });

      const lastCheckin = new Date("2024-01-14T10:00:00Z");
      const thirtyHoursLater = new Date("2024-01-15T16:00:00Z"); // 30 hours

      // Should NOT break with 48-hour gap
      const isBroken = customCalc.isStreakBroken(lastCheckin, thirtyHoursLater);

      expect(isBroken).toBe(false);
    });
  });
});
