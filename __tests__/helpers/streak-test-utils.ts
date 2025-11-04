/**
 * Streak Testing Utilities
 * Shared helpers for mocking time, creating test data, and common test scenarios
 */

import { StreakInfo, StreakStatus } from "@/lib/checkin/core/types";

/**
 * Create a mock StreakInfo object with sensible defaults
 */
export function createMockStreakInfo(overrides: Partial<StreakInfo> = {}): StreakInfo {
  return {
    currentStreak: 5,
    lastCheckinDate: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    longestStreak: 5,
    isActive: true,
    ...overrides,
  };
}

/**
 * Time offset helpers - create dates relative to now
 */
export const timeOffsets = {
  hoursAgo: (hours: number): Date =>
    new Date(Date.now() - hours * 60 * 60 * 1000),

  minutesAgo: (minutes: number): Date =>
    new Date(Date.now() - minutes * 60 * 1000),

  secondsAgo: (seconds: number): Date =>
    new Date(Date.now() - seconds * 1000),

  daysAgo: (days: number): Date =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000),
};

/**
 * Set mock system time using Date constructor mocking
 * Use this for explicit time control in tests
 *
 * @example
 * setMockTime(new Date("2024-01-15T10:00:00Z"));
 * // Now all Date operations use the mocked time
 * resetMockTime();
 */
export function setMockTime(mockDate: Date): void {
  const mockTime = mockDate.getTime();
  jest.spyOn(global, "Date").mockImplementation(() => mockDate as any);
  (global.Date as any).now = () => mockTime;
  (global.Date as any).parse = Date.parse;
  (global.Date as any).UTC = Date.UTC;
}

/**
 * Reset to real system time
 */
export function resetMockTime(): void {
  jest.restoreAllMocks();
}

/**
 * Create common time-based test scenarios for streak status
 * Useful for running same test logic with different times
 */
export interface TimeScenario {
  name: string;
  lastCheckinHoursAgo: number;
  expectedStatus: StreakStatus;
  description: string;
}

export const COMMON_TIME_SCENARIOS: TimeScenario[] = [
  {
    name: "recent_checkin",
    lastCheckinHoursAgo: 2,
    expectedStatus: "active",
    description: "Checkin 2 hours ago - active streak",
  },
  {
    name: "mid_day",
    lastCheckinHoursAgo: 12,
    expectedStatus: "active",
    description: "Checkin 12 hours ago - still active",
  },
  {
    name: "at_risk_threshold",
    lastCheckinHoursAgo: 21,
    expectedStatus: "at_risk",
    description: "Checkin 21 hours ago - less than 3 hours until break",
  },
  {
    name: "at_risk_late",
    lastCheckinHoursAgo: 23,
    expectedStatus: "at_risk",
    description: "Checkin 23 hours ago - very close to break",
  },
  {
    name: "broken_just_over",
    lastCheckinHoursAgo: 24.1,
    expectedStatus: "broken",
    description: "Checkin 24+ hours ago - streak broken",
  },
  {
    name: "broken_long_ago",
    lastCheckinHoursAgo: 48,
    expectedStatus: "broken",
    description: "Checkin 2 days ago - definitely broken",
  },
];

/**
 * Create a streak info with specific time offset
 * Useful for testing status transitions
 */
export function createStreakInfoWithTimeOffset(
  hoursAgo: number,
  streak: number = 5,
): StreakInfo {
  return createMockStreakInfo({
    currentStreak: streak,
    lastCheckinDate: timeOffsets.hoursAgo(hoursAgo),
    longestStreak: streak,
    isActive: streak > 0,
  });
}

/**
 * Mock Supabase RPC call for streak calculation
 */
export function mockSupabaseGetStreakRpc(streakValue: number): any {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(),
      })),
    })),
    rpc: jest.fn((name: string, params: any) => {
      if (name === "get_user_checkin_streak") {
        return Promise.resolve({ data: streakValue, error: null });
      }
      return Promise.resolve({ data: null, error: new Error("Unknown RPC") });
    }),
  };
}

/**
 * Mock Supabase response for user profile lookup
 */
export function mockSupabaseUserProfileLookup(
  profileId: string | null = "profile-123",
): any {
  return {
    from: jest.fn((table: string) => {
      if (table === "user_profiles") {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              limit: jest.fn(() => ({
                then: jest.fn((resolve) =>
                  resolve({
                    data: profileId ? [{ id: profileId }] : [],
                    error: null,
                  }),
                ),
              })),
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({})),
        from: jest.fn(() => ({})),
      };
    }),
    rpc: jest.fn(),
  };
}

/**
 * Calculate hours until streak breaks from last checkin
 * Mimics the logic in the calculator
 */
export function getHoursUntilBreak(lastCheckinDate: Date): number {
  const now = new Date();
  const timeSinceLastCheckin = now.getTime() - lastCheckinDate.getTime();
  return 24 - timeSinceLastCheckin / (1000 * 60 * 60);
}

/**
 * Determine streak status based on time since last checkin
 * Matches the calculator logic for testing
 */
export function getExpectedStreakStatus(
  currentStreak: number,
  lastCheckinDate: Date | null,
): StreakStatus {
  if (currentStreak === 0) return "new";
  if (!lastCheckinDate) return "new";

  const hoursUntilBreak = getHoursUntilBreak(lastCheckinDate);

  if (hoursUntilBreak <= 0) return "broken";
  if (hoursUntilBreak <= 3) return "at_risk";
  return "active";
}

/**
 * Create mock checkin activity record
 */
export function createMockCheckinActivity(
  overrides: Partial<{
    id: string;
    user_profile_id: string;
    activity_type: string;
    created_at: string;
  }> = {},
) {
  return {
    id: "activity-123",
    user_profile_id: "profile-123",
    activity_type: "daily_checkin",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock user profile record
 */
export function createMockUserProfile(
  overrides: Partial<{
    id: string;
    wallet_address: string;
    display_name: string;
  }> = {},
) {
  return {
    id: "profile-123",
    wallet_address: "0x1234567890123456789012345678901234567890",
    display_name: "Test User",
    ...overrides,
  };
}

/**
 * Mock callback for useVisibilityAwarePoll
 */
export function createMockCallback(): jest.Mock {
  return jest.fn().mockResolvedValue(undefined);
}

/**
 * Assert streak status matches expected value
 * Provides helpful error messages
 */
export function assertStreakStatus(
  actual: StreakStatus,
  expected: StreakStatus,
  context: string = "",
): void {
  expect(actual).toBe(expected);
  if (actual !== expected) {
    console.error(`[${context}] Expected "${expected}", got "${actual}"`);
  }
}

/**
 * Helper for testing exact time boundaries
 * Returns true if current time is within tolerance of target time
 */
export function isNearTime(
  actual: number,
  target: number,
  toleranceMs: number = 1000,
): boolean {
  return Math.abs(actual - target) <= toleranceMs;
}

/**
 * Reset all Jest mocks comprehensively
 */
export function resetAllMocks(): void {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetMockTime();
}

/**
 * Helper to advance time using fake timers
 * Requires jest.useFakeTimers() to be called first
 */
export function advanceTimeBy(options: {
  hours?: number;
  minutes?: number;
  seconds?: number;
}): void {
  let milliseconds = 0;

  if (options.hours) {
    milliseconds += options.hours * 60 * 60 * 1000;
  }
  if (options.minutes) {
    milliseconds += options.minutes * 60 * 1000;
  }
  if (options.seconds) {
    milliseconds += options.seconds * 1000;
  }

  jest.advanceTimersByTime(milliseconds);
}

/**
 * Export all helpers as a namespace for convenient importing
 */
export const streakTestUtils = {
  createMockStreakInfo,
  timeOffsets,
  setMockTime,
  resetMockTime,
  COMMON_TIME_SCENARIOS,
  createStreakInfoWithTimeOffset,
  mockSupabaseGetStreakRpc,
  mockSupabaseUserProfileLookup,
  getHoursUntilBreak,
  getExpectedStreakStatus,
  createMockCheckinActivity,
  createMockUserProfile,
  createMockCallback,
  assertStreakStatus,
  isNearTime,
  resetAllMocks,
  advanceTimeBy,
};
