/**
 * Unit Tests for useWithdrawalLimits Hook
 *
 * Tests the hook that fetches withdrawal limits from the API
 * and falls back to defaults on error.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useWithdrawalLimits } from "@/hooks/useWithdrawalLimits";

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
    getLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("useWithdrawalLimits", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should start in loading state with default limits", () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true, limits: { minAmount: 5000, maxAmount: 200000 } }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.minAmount).toBe(3000); // Default
        expect(result.current.maxAmount).toBe(100000); // Default
    });

    it("should fetch and update limits from API", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
                Promise.resolve({
                    success: true,
                    limits: { minAmount: 5000, maxAmount: 200000 },
                }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.minAmount).toBe(5000);
        expect(result.current.maxAmount).toBe(200000);
        expect(result.current.error).toBeNull();
    });

    it("should call the correct API endpoint", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
                Promise.resolve({
                    success: true,
                    limits: { minAmount: 3000, maxAmount: 100000 },
                }),
        });

        renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith("/api/config/withdrawal-limits");
        });
    });

    it("should use default limits on API error", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ success: false, error: "Server error" }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.minAmount).toBe(3000);
        expect(result.current.maxAmount).toBe(100000);
        expect(result.current.error).toBe("Server error");
    });

    it("should use default limits on network failure", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.minAmount).toBe(3000);
        expect(result.current.maxAmount).toBe(100000);
        expect(result.current.error).toBe("Network error");
    });

    it("should handle non-success response with error message", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
                Promise.resolve({ success: false, error: "Configuration not found" }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe("Configuration not found");
        // Should still use defaults
        expect(result.current.minAmount).toBe(3000);
    });

    it("should handle response without error message", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: () => Promise.resolve({ success: false }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe("Failed to fetch limits");
    });

    it("should have no error on successful fetch", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () =>
                Promise.resolve({
                    success: true,
                    limits: { minAmount: 1000, maxAmount: 50000 },
                }),
        });

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBeNull();
    });

    it("should handle non-Error exceptions", async () => {
        mockFetch.mockRejectedValueOnce("String error");

        const { result } = renderHook(() => useWithdrawalLimits());

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe("Failed to load limits");
    });
});
