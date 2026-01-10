import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useUserAttestationStats,
  attestationQueryKeys,
} from "@/hooks/attestation/useAttestationQueries";
import * as attestationLib from "@/lib/attestation";
import { useWallets } from "@privy-io/react-auth";
import React from "react";

// Mock the lib
jest.mock("@/lib/attestation", () => ({
  getUserAttestationCount: jest.fn(),
  getUserDailyCheckinStreak: jest.fn(),
  hasUserAttestationBySchemaKey: jest.fn(),
}));

// Mock Privy
jest.mock("@privy-io/react-auth", () => ({
  useWallets: jest.fn(),
}));

// Helper to create a QueryClient for each test
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for tests
        gcTime: 0, // Don't keep data in cache during tests
        retryOnMount: false, // Don't retry when component mounts
      },
    },
  });

// Wrapper component to provide QueryClient
const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = "QueryClientWrapper";
  return Wrapper;
};

describe("useUserAttestationStats Hook (React Query)", () => {
  const mockAddress = "0x1234567890123456789012345678901234567890";

  beforeEach(() => {
    jest.clearAllMocks();
    (useWallets as jest.Mock).mockReturnValue({
      wallets: [{ address: mockAddress }],
    });
  });

  test("should fetch user stats using hasUserAttestationBySchemaKey", async () => {
    (attestationLib.getUserAttestationCount as jest.Mock).mockResolvedValue(10);
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockResolvedValue(
      5,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockResolvedValue(true);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUserAttestationStats(mockAddress), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(attestationLib.getUserAttestationCount).toHaveBeenCalledWith(
      mockAddress,
    );
    expect(attestationLib.getUserDailyCheckinStreak).toHaveBeenCalledWith(
      mockAddress,
    );
    expect(attestationLib.hasUserAttestationBySchemaKey).toHaveBeenCalledWith(
      mockAddress,
      "daily_checkin",
    );

    expect(result.current.stats).toEqual({
      totalCount: 10,
      dailyCheckinStreak: 5,
      hasCheckedInToday: true,
    });
  });

  test("should use address from wallet if userAddress is not provided", async () => {
    (attestationLib.getUserAttestationCount as jest.Mock).mockResolvedValue(0);
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockResolvedValue(
      0,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockResolvedValue(false);

    const queryClient = createTestQueryClient();
    renderHook(() => useUserAttestationStats(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(attestationLib.getUserAttestationCount).toHaveBeenCalledWith(
        mockAddress,
      );
    });
  });

  test("should handle errors gracefully and return default stats", async () => {
    const mockError = new Error("Fetch failed");
    (attestationLib.getUserAttestationCount as jest.Mock).mockRejectedValue(
      mockError,
    );
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockRejectedValue(
      mockError,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockRejectedValue(mockError);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUserAttestationStats(mockAddress), {
      wrapper: createWrapper(queryClient),
    });

    // The hook has retry: 2 with exponential backoff (1s + 2s = 3s total)
    // We need to wait longer than the default 1s timeout
    // See: https://tanstack.com/query/v5/docs/react/guides/testing
    await waitFor(
      () => expect(result.current.error).toBeTruthy(),
      { timeout: 5000 }, // Wait for retries to complete
    );

    // After error, loading should be false
    expect(result.current.isLoading).toBe(false);

    // Stats should be default values when error occurs
    expect(result.current.stats).toEqual({
      totalCount: 0,
      dailyCheckinStreak: 0,
      hasCheckedInToday: false,
    });

    // Error message should contain the original error
    expect(result.current.error).toContain("Fetch failed");
  });

  test("should return default stats when no address is provided", async () => {
    (useWallets as jest.Mock).mockReturnValue({ wallets: [] });

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUserAttestationStats(), {
      wrapper: createWrapper(queryClient),
    });

    // Query should be disabled when no address, so isLoading is false immediately
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.stats).toEqual({
      totalCount: 0,
      dailyCheckinStreak: 0,
      hasCheckedInToday: false,
    });

    // API calls should not be made when no address
    expect(attestationLib.getUserAttestationCount).not.toHaveBeenCalled();
  });

  test("should cache results and deduplicate requests", async () => {
    (attestationLib.getUserAttestationCount as jest.Mock).mockResolvedValue(10);
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockResolvedValue(
      5,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockResolvedValue(true);

    const queryClient = createTestQueryClient();
    const wrapper = createWrapper(queryClient);

    // Render hook twice with same address
    const { result: result1 } = renderHook(
      () => useUserAttestationStats(mockAddress),
      { wrapper },
    );
    const { result: result2 } = renderHook(
      () => useUserAttestationStats(mockAddress),
      { wrapper },
    );

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
      expect(result2.current.isLoading).toBe(false);
    });

    // API should only be called once due to deduplication
    expect(attestationLib.getUserAttestationCount).toHaveBeenCalledTimes(1);
    expect(attestationLib.getUserDailyCheckinStreak).toHaveBeenCalledTimes(1);
    expect(attestationLib.hasUserAttestationBySchemaKey).toHaveBeenCalledTimes(
      1,
    );

    // Both hooks should have the same data
    expect(result1.current.stats).toEqual(result2.current.stats);
  });

  test("should support manual refetch", async () => {
    (attestationLib.getUserAttestationCount as jest.Mock).mockResolvedValue(10);
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockResolvedValue(
      5,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockResolvedValue(true);

    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useUserAttestationStats(mockAddress), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mocks to track refetch call
    jest.clearAllMocks();
    (attestationLib.getUserAttestationCount as jest.Mock).mockResolvedValue(15);
    (attestationLib.getUserDailyCheckinStreak as jest.Mock).mockResolvedValue(
      6,
    );
    (
      attestationLib.hasUserAttestationBySchemaKey as jest.Mock
    ).mockResolvedValue(true);

    // Trigger refetch
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.stats.totalCount).toBe(15);
      expect(result.current.stats.dailyCheckinStreak).toBe(6);
    });
  });
});

describe("attestationQueryKeys", () => {
  test("should generate consistent query keys", () => {
    const address = "0x123";
    const schemaUid = "0xabc";

    // Keys should be consistent for same inputs
    expect(attestationQueryKeys.userStats(address)).toEqual(
      attestationQueryKeys.userStats(address),
    );

    // Keys should be different for different inputs
    expect(attestationQueryKeys.userStats(address)).not.toEqual(
      attestationQueryKeys.userStats("0x456"),
    );

    // Schema stats keys
    expect(attestationQueryKeys.schemaStats(schemaUid)).toEqual([
      "attestations",
      "stats",
      "schema",
      schemaUid,
    ]);
  });
});
