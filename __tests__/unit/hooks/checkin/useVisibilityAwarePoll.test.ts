/**
 * useVisibilityAwarePoll Hook Unit Tests
 * Tests polling behavior with visibility awareness
 */

import { renderHook } from "@testing-library/react";
import { useVisibilityAwarePoll } from "@/hooks/checkin/useVisibilityAwarePoll";
import {
  createMockCallback,
  resetAllMocks,
} from "__tests__/helpers/streak-test-utils";

describe("useVisibilityAwarePoll Hook", () => {
  let mockCallback: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    mockCallback = createMockCallback();
    resetAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe("Basic Polling", () => {
    beforeEach(() => {
      // Ensure document is not hidden before each test
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test("should start polling when enabled", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 5000, { enabled: true }),
      );

      // Advance timer to first interval
      jest.advanceTimersByTime(5000);

      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    test("should not start polling when disabled", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 5000, { enabled: false }),
      );

      jest.advanceTimersByTime(10000);

      expect(mockCallback).not.toHaveBeenCalled();
    });

    test("should call callback at specified interval", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 3000, { enabled: true }),
      );

      // First call at 3 seconds
      jest.advanceTimersByTime(3000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second call at 6 seconds
      jest.advanceTimersByTime(3000);
      expect(mockCallback).toHaveBeenCalledTimes(2);

      // Third call at 9 seconds
      jest.advanceTimersByTime(3000);
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });

    test("should call callback with no arguments", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      jest.advanceTimersByTime(1000);

      expect(mockCallback).toHaveBeenCalledWith();
    });
  });

  describe("Visibility Awareness", () => {
    beforeEach(() => {
      // Ensure document is not hidden
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test("should pause polling when page becomes hidden", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      // First poll
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Simulate page becoming hidden
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Advance time - should not call callback
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    test("should resume polling when page becomes visible again", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      // First poll
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Hide page
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Advance while hidden
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Show page again
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Should resume polling
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    test("should handle multiple visibility changes", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      // Poll 1
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Hide
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      jest.advanceTimersByTime(1000);

      // Show
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Poll 2
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("Cleanup", () => {
    test("should clear interval on unmount", () => {
      const { unmount } = renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      unmount();

      // Should not call callback after unmount
      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still 1
    });

    test("should remove visibility change listener on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(
        document,
        "removeEventListener",
      );

      const { unmount } = renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );

      removeEventListenerSpy.mockRestore();
    });

    test("should handle unmount while hidden", () => {
      const { unmount } = renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      // Hide page
      Object.defineProperty(document, "hidden", {
        value: true,
        writable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      // Should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("Dynamic Enable/Disable", () => {
    beforeEach(() => {
      // Ensure document is not hidden
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test("should respect enabled option changes", () => {
      const { rerender } = renderHook(
        ({ enabled }) =>
          useVisibilityAwarePoll(mockCallback, 1000, { enabled }),
        { initialProps: { enabled: true } },
      );

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Disable polling
      rerender({ enabled: false });

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1); // No new call

      // Re-enable polling
      rerender({ enabled: true });

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("Callback Execution", () => {
    beforeEach(() => {
      // Ensure document is not hidden
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test("should execute callback synchronously each interval", () => {
      const trackingCallback = jest.fn();

      renderHook(() =>
        useVisibilityAwarePoll(trackingCallback, 1000, { enabled: true }),
      );

      jest.advanceTimersByTime(1000);
      expect(trackingCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1000);
      expect(trackingCallback).toHaveBeenCalledTimes(2);
    });

    test("should handle async callback promises", () => {
      const asyncCallback = jest.fn(() => {
        return new Promise<void>((resolve) => setTimeout(resolve, 100));
      });

      renderHook(() =>
        useVisibilityAwarePoll(asyncCallback, 500, { enabled: true }),
      );

      jest.advanceTimersByTime(500);
      expect(asyncCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(500);
      expect(asyncCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("Different Intervals", () => {
    beforeEach(() => {
      // Ensure document is not hidden
      Object.defineProperty(document, "hidden", {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    test("should respect 1 second interval", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 1000, { enabled: true }),
      );

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1000);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    test("should respect 5 second interval", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 5000, { enabled: true }),
      );

      jest.advanceTimersByTime(2500);
      expect(mockCallback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2500); // Total 5000
      expect(mockCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000); // Total 10000
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    test("should respect 30 second interval", () => {
      renderHook(() =>
        useVisibilityAwarePoll(mockCallback, 30000, { enabled: true }),
      );

      jest.advanceTimersByTime(15000);
      expect(mockCallback).not.toHaveBeenCalled();

      jest.advanceTimersByTime(15000); // Total 30000
      expect(mockCallback).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30000); // Total 60000
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });
  });
});
