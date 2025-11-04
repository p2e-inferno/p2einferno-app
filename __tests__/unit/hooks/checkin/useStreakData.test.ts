/**
 * useStreakData Hook Unit Tests
 * Tests the React hook for managing streak data without time-passing
 */

// Mock EAS SDK before any imports that depend on it
jest.mock("@ethereum-attestation-service/eas-sdk", () => ({
  EAS: jest.fn(),
  SchemaEncoder: jest.fn(),
}));

// Mock before importing the hook
jest.mock("@/lib/checkin");
jest.mock("@/hooks/checkin/useVisibilityAwarePoll", () => ({
  useVisibilityAwarePoll: jest.fn(),
}));

import { renderHook, waitFor } from "@testing-library/react";
import {
  createMockStreakInfo,
  timeOffsets,
  resetAllMocks,
  createStreakInfoWithTimeOffset,
  COMMON_TIME_SCENARIOS,
} from "__tests__/helpers/streak-test-utils";
import { useStreakData } from "@/hooks/checkin/useStreakData";
import { getDefaultCheckinService } from "@/lib/checkin";

describe("useStreakData Hook", () => {
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getStreakInfo: jest.fn(),
      getCurrentTier: jest.fn().mockReturnValue(null),
      getNextTier: jest.fn().mockReturnValue(null),
      getProgressToNextTier: jest.fn().mockReturnValue(0),
      getCurrentMultiplier: jest.fn().mockReturnValue(1.0),
    };

    (getDefaultCheckinService as jest.Mock).mockReturnValue(mockService);
    resetAllMocks();
  });

  describe("Initial Load", () => {
    test("should fetch streak data on mount with user address", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      renderHook(() => useStreakData("0x123", { autoRefresh: false }));

      await waitFor(() => {
        expect(mockService.getStreakInfo).toHaveBeenCalledWith("0x123");
      });
    });

    test("should set loading state initially", () => {
      mockService.getStreakInfo.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve(createMockStreakInfo({ currentStreak: 5 })),
              100,
            ),
          ),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    test("should clear loading state after fetch completes", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    test("should not fetch when user address is not provided", async () => {
      const { result } = renderHook(() =>
        useStreakData("", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(mockService.getStreakInfo).not.toHaveBeenCalled();
      });
    });
  });

  describe("Streak Data Display", () => {
    test("should display active streak when currentStreak > 0", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 7, isActive: true }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.streakInfo?.currentStreak).toBe(7);
        expect(result.current.streakInfo?.isActive).toBe(true);
      });
    });

    test("should display inactive streak when currentStreak is 0", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0, isActive: false }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.streakInfo?.currentStreak).toBe(0);
        expect(result.current.streakInfo?.isActive).toBe(false);
      });
    });

    test("should update streak info when refetch is called", async () => {
      const initialInfo = createMockStreakInfo({ currentStreak: 5 });
      const updatedInfo = createMockStreakInfo({ currentStreak: 6 });

      mockService.getStreakInfo
        .mockResolvedValueOnce(initialInfo)
        .mockResolvedValueOnce(updatedInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.streakInfo?.currentStreak).toBe(5);
      });

      // Call refetch
      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.streakInfo?.currentStreak).toBe(6);
      });
    });
  });

  describe("Status Calculation", () => {
    test("should return 'active' when streak exists and last checkin is recent", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(2, 5); // 2 hours ago
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe("active");
      });
    });

    test("should return 'at_risk' when streak is close to expiring", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(21, 5); // 21 hours ago
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe("at_risk");
      });
    });

    test("should return 'broken' when streak has expired", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(25, 5); // 25 hours ago
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe("broken");
      });
    });

    test("should return 'new' when no streak exists", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0, isActive: false }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.status).toBe("new");
      });
    });

    // Parametrized tests for all time scenarios
    COMMON_TIME_SCENARIOS.forEach(
      ({ name, lastCheckinHoursAgo, expectedStatus, description }) => {
        test(`[${name}] status should be '${expectedStatus}' - ${description}`, async () => {
          const streakInfo = createStreakInfoWithTimeOffset(
            lastCheckinHoursAgo,
            5,
          );
          mockService.getStreakInfo.mockResolvedValue(streakInfo);

          const { result } = renderHook(() =>
            useStreakData("0x123", { autoRefresh: false }),
          );

          await waitFor(() => {
            expect(result.current.status).toBe(expectedStatus);
          });
        });
      },
    );
  });

  describe("Tier Information", () => {
    test("should get current tier from service", async () => {
      const mockTier = { name: "Bronze", multiplier: 1.0, minStreak: 0 };
      mockService.getCurrentTier.mockReturnValue(mockTier);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.currentTier).toEqual(mockTier);
      });
    });

    test("should get next tier from service", async () => {
      const mockTier = { name: "Silver", multiplier: 1.2, minStreak: 7 };
      mockService.getNextTier.mockReturnValue(mockTier);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.nextTier).toEqual(mockTier);
      });
    });

    test("should return null when no tier exists", async () => {
      mockService.getCurrentTier.mockReturnValue(null);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.currentTier).toBeNull();
      });
    });
  });

  describe("Progress to Next Tier", () => {
    test("should calculate progress correctly", async () => {
      mockService.getProgressToNextTier.mockReturnValue(0.6); // 60%
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.progress).toBe(0.6);
      });
    });

    test("should return 0 when at start", async () => {
      mockService.getProgressToNextTier.mockReturnValue(0);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.progress).toBe(0);
      });
    });

    test("should return 1 when tier complete", async () => {
      mockService.getProgressToNextTier.mockReturnValue(1.0);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 30 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.progress).toBe(1.0);
      });
    });
  });

  describe("Multiplier", () => {
    test("should get current multiplier from service", async () => {
      mockService.getCurrentMultiplier.mockReturnValue(1.5);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.multiplier).toBe(1.5);
      });
    });

    test("should default to 1.0 when not provided", async () => {
      mockService.getCurrentMultiplier.mockReturnValue(1.0);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 0 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.multiplier).toBe(1.0);
      });
    });
  });

  describe("Time Until Expiration", () => {
    test("should calculate time remaining until streak expires", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(22, 5); // 22 hours ago
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.timeUntilExpiration).toBeGreaterThan(0);
        // Should be roughly 2 hours remaining
        const expectedMs = 2 * 60 * 60 * 1000;
        expect(result.current.timeUntilExpiration).toBeLessThanOrEqual(
          expectedMs,
        );
      });
    });

    test("should return null when streak is inactive", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({
          currentStreak: 0,
          lastCheckinDate: null,
          isActive: false,
        }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.timeUntilExpiration).toBeNull();
      });
    });

    test("should return 0 when already expired", async () => {
      const streakInfo = createStreakInfoWithTimeOffset(25, 5); // 25 hours ago
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.timeUntilExpiration).toBe(0);
      });
    });
  });

  describe("Error Handling", () => {
    test("should set error when fetch fails", async () => {
      const errorMessage = "Failed to fetch streak data";
      mockService.getStreakInfo.mockRejectedValue(new Error(errorMessage));

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.error).toBe(errorMessage);
      });
    });

    test("should call onError callback when error occurs", async () => {
      const onError = jest.fn();
      const errorMessage = "Test error";
      mockService.getStreakInfo.mockRejectedValue(new Error(errorMessage));

      renderHook(() =>
        useStreakData("0x123", {
          autoRefresh: false,
          onError,
        }),
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(errorMessage);
      });
    });

    test("should clear error on successful refetch", async () => {
      mockService.getStreakInfo
        .mockRejectedValueOnce(new Error("Initial error"))
        .mockResolvedValueOnce(createMockStreakInfo({ currentStreak: 5 }));

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.error).toBe("Initial error");
      });

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.error).toBeNull();
        expect(result.current.streakInfo?.currentStreak).toBe(5);
      });
    });
  });

  describe("Memoization", () => {
    test("should memoize currentTier and not recalculate unnecessarily", async () => {
      const mockTier = { name: "Bronze", multiplier: 1.0, minStreak: 0 };
      mockService.getCurrentTier.mockReturnValue(mockTier);
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result, rerender } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.currentTier).toEqual(mockTier);
      });

      const firstTierRef = result.current.currentTier;

      rerender();

      // Should still be the same reference (memoized)
      expect(result.current.currentTier).toBe(firstTierRef);
    });

    test("should recalculate when streak info changes", async () => {
      const initialInfo = createMockStreakInfo({ currentStreak: 5 });
      const updatedInfo = createMockStreakInfo({ currentStreak: 6 });

      mockService.getStreakInfo
        .mockResolvedValueOnce(initialInfo)
        .mockResolvedValueOnce(updatedInfo);
      mockService.getCurrentMultiplier
        .mockReturnValueOnce(1.0)
        .mockReturnValueOnce(1.1);

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.multiplier).toBe(1.0);
      });

      const firstMultiplier = result.current.multiplier;

      await result.current.refetch();

      await waitFor(() => {
        expect(result.current.multiplier).toBe(1.1);
        expect(result.current.multiplier).not.toBe(firstMultiplier);
      });
    });
  });

  describe("Auto-Refresh", () => {
    test("should call useVisibilityAwarePoll when autoRefresh is enabled", async () => {
      const { useVisibilityAwarePoll } = require("@/hooks/checkin/useVisibilityAwarePoll");
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      renderHook(() =>
        useStreakData("0x123", {
          autoRefresh: true,
          refreshInterval: 60000,
        }),
      );

      await waitFor(() => {
        expect(useVisibilityAwarePoll).toHaveBeenCalled();
      });
    });

    test("should pass enabled: false to useVisibilityAwarePoll when autoRefresh is disabled", async () => {
      const { useVisibilityAwarePoll } = require("@/hooks/checkin/useVisibilityAwarePoll");
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      renderHook(() =>
        useStreakData("0x123", {
          autoRefresh: false,
        }),
      );

      await waitFor(() => {
        // Should be called with enabled: false
        expect(useVisibilityAwarePoll).toHaveBeenCalledWith(
          expect.any(Function),
          expect.any(Number),
          expect.objectContaining({ enabled: false }),
        );
      });
    });

    test("should pass correct interval to useVisibilityAwarePoll", async () => {
      const { useVisibilityAwarePoll } = require("@/hooks/checkin/useVisibilityAwarePoll");
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      renderHook(() =>
        useStreakData("0x123", {
          autoRefresh: true,
          refreshInterval: 45000,
        }),
      );

      await waitFor(() => {
        expect(useVisibilityAwarePoll).toHaveBeenCalledWith(
          expect.any(Function),
          45000,
          expect.any(Object),
        );
      });
    });
  });

  describe("Callbacks", () => {
    test("should call onStreakUpdate when streak data changes", async () => {
      const onStreakUpdate = jest.fn();
      const streakInfo = createMockStreakInfo({ currentStreak: 5 });
      mockService.getStreakInfo.mockResolvedValue(streakInfo);

      renderHook(() =>
        useStreakData("0x123", {
          autoRefresh: false,
          onStreakUpdate,
        }),
      );

      await waitFor(() => {
        expect(onStreakUpdate).toHaveBeenCalledWith(streakInfo);
      });
    });

    test("should not call onStreakUpdate if not provided", async () => {
      mockService.getStreakInfo.mockResolvedValue(
        createMockStreakInfo({ currentStreak: 5 }),
      );

      const { result } = renderHook(() =>
        useStreakData("0x123", { autoRefresh: false }),
      );

      await waitFor(() => {
        expect(result.current.streakInfo?.currentStreak).toBe(5);
      });

      // Should not throw
      expect(result.current.error).toBeNull();
    });
  });

  describe("User Address Changes", () => {
    test("should refetch when user address changes", async () => {
      const initialInfo = createMockStreakInfo({ currentStreak: 5 });
      const updatedInfo = createMockStreakInfo({ currentStreak: 10 });

      mockService.getStreakInfo
        .mockResolvedValueOnce(initialInfo)
        .mockResolvedValueOnce(updatedInfo);

      const { rerender } = renderHook(
        ({ userAddress }) =>
          useStreakData(userAddress, { autoRefresh: false }),
        { initialProps: { userAddress: "0x123" } },
      );

      await waitFor(() => {
        expect(mockService.getStreakInfo).toHaveBeenCalledWith("0x123");
      });

      rerender({ userAddress: "0x456" });

      await waitFor(() => {
        expect(mockService.getStreakInfo).toHaveBeenCalledWith("0x456");
      });
    });
  });
});
