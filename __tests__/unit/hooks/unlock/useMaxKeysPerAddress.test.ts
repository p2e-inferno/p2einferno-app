import { renderHook, act } from "@testing-library/react";
import { useMaxKeysPerAddress } from "@/hooks/unlock/useMaxKeysPerAddress";
import type { Address } from "viem";

// Mock viem client creation
jest.mock("@/lib/blockchain/config", () => ({
  createPublicClientUnified: jest.fn(),
}));

describe("useMaxKeysPerAddress", () => {
  const mockLockAddress =
    "0x1234567890abcdef1234567890abcdef12345678" as Address;
  let mockReadContract: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadContract = jest.fn();
    const { createPublicClientUnified } = require("@/lib/blockchain/config");
    createPublicClientUnified.mockReturnValue({
      readContract: mockReadContract,
    });
  });

  describe("enabled flag", () => {
    it("returns null when enabled=false", async () => {
      const { result } = renderHook(() =>
        useMaxKeysPerAddress({ enabled: false }),
      );

      const value =
        await result.current.checkMaxKeysPerAddress(mockLockAddress);
      expect(value).toBeNull();
      expect(result.current.error).toBeNull();
      expect(mockReadContract).not.toHaveBeenCalled();
    });

    it("can be re-enabled dynamically", async () => {
      mockReadContract.mockResolvedValue(0n);
      const { result, rerender } = renderHook(
        ({ enabled }) => useMaxKeysPerAddress({ enabled }),
        { initialProps: { enabled: false } },
      );

      let value = await result.current.checkMaxKeysPerAddress(mockLockAddress);
      expect(value).toBeNull();

      rerender({ enabled: true });
      value = await act(() =>
        result.current.checkMaxKeysPerAddress(mockLockAddress),
      );
      expect(value).toBe(0n);
    });
  });

  describe("successful reads", () => {
    it("returns 0n for secure lock", async () => {
      mockReadContract.mockResolvedValue(0n);
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress(mockLockAddress),
      );

      expect(value).toBe(0n);
      expect(result.current.error).toBeNull();
      expect(mockReadContract).toHaveBeenCalledWith({
        address: mockLockAddress,
        abi: expect.any(Array),
        functionName: "maxKeysPerAddress",
      });
    });

    it("returns 1n for insecure lock", async () => {
      mockReadContract.mockResolvedValue(1n);
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress(mockLockAddress),
      );

      expect(value).toBe(1n);
      expect(result.current.error).toBeNull();
    });

    it("returns large bigint for high maxKeysPerAddress", async () => {
      mockReadContract.mockResolvedValue(100n);
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress(mockLockAddress),
      );

      expect(value).toBe(100n);
    });
  });

  describe("error handling", () => {
    it("sets error for invalid address", async () => {
      mockReadContract.mockRejectedValue(new Error("Invalid address"));
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress("invalid" as Address),
      );

      expect(value).toBeNull();
      expect(result.current.error).toContain("Invalid address");
    });

    it("sets error for network failure", async () => {
      mockReadContract.mockRejectedValue(new Error("Network error"));
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress(mockLockAddress),
      );

      expect(value).toBeNull();
      expect(result.current.error).toBe("Network error");
    });

    it("clears error state on successful call after error", async () => {
      mockReadContract
        .mockRejectedValueOnce(new Error("First error"))
        .mockResolvedValueOnce(0n);

      const { result } = renderHook(() => useMaxKeysPerAddress());

      // First call fails
      await act(() => result.current.checkMaxKeysPerAddress(mockLockAddress));
      expect(result.current.error).toBe("First error");

      // Second call succeeds
      await act(() => result.current.checkMaxKeysPerAddress(mockLockAddress));
      expect(result.current.error).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles zero address", async () => {
      mockReadContract.mockResolvedValue(0n);
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const value = await act(() =>
        result.current.checkMaxKeysPerAddress(
          "0x0000000000000000000000000000000000000000" as Address,
        ),
      );

      expect(value).toBe(0n);
    });

    it("handles multiple concurrent calls", async () => {
      mockReadContract.mockResolvedValue(0n);
      const { result } = renderHook(() => useMaxKeysPerAddress());

      const [v1, v2, v3] = await act(() =>
        Promise.all([
          result.current.checkMaxKeysPerAddress(
            "0x1111111111111111111111111111111111111111" as Address,
          ),
          result.current.checkMaxKeysPerAddress(
            "0x2222222222222222222222222222222222222222" as Address,
          ),
          result.current.checkMaxKeysPerAddress(
            "0x3333333333333333333333333333333333333333" as Address,
          ),
        ]),
      );

      expect(v1).toBe(0n);
      expect(v2).toBe(0n);
      expect(v3).toBe(0n);
      expect(mockReadContract).toHaveBeenCalledTimes(3);
    });
  });
});
