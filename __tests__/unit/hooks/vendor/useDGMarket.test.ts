/**
 * TDD Tests for useDGMarket Hook
 *
 * These tests define the expected API for the DG market hook.
 * Tests will FAIL until hooks/vendor/useDGMarket.ts is implemented.
 */

import { renderHook, act } from "@testing-library/react";

// Mock token approval hook
const mockApproveIfNeeded = jest.fn(async () => ({ success: true }));
jest.mock("@/hooks/useTokenApproval", () => ({
  useTokenApproval: () => ({
    approveIfNeeded: mockApproveIfNeeded,
    isApproving: false,
    error: null,
  }),
}));

// Mock wagmi hooks
const mockWriteContract = jest.fn();
const mockUseWriteContract = jest.fn(() => ({
  writeContract: mockWriteContract,
  data: undefined as any,
  isPending: false,
}));

const mockUseWaitForTransactionReceipt = jest.fn(() => ({
  isLoading: false,
  isSuccess: false,
}));

const mockUseReadContract = jest.fn((_config?: any) => ({
  data: undefined,
}));

jest.mock("wagmi", () => ({
  useWriteContract: () => mockUseWriteContract(),
  useWaitForTransactionReceipt: () => mockUseWaitForTransactionReceipt(),
  useReadContract: (config: any) => mockUseReadContract(config),
}));

// Mock the ABI
jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
  DG_TOKEN_VENDOR_ABI: [],
}));

describe("useDGMarket", () => {
  let useDGMarket: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/hooks/vendor/useDGMarket");
      useDGMarket = mod.useDGMarket;
    } catch {
      // Expected to fail until implemented
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReadContract.mockImplementation((config: any) => {
      if (config?.functionName === "getTokenConfig") {
        return {
          data: {
            baseToken: "0x0000000000000000000000000000000000000001",
            swapToken: "0x0000000000000000000000000000000000000002",
          },
        };
      }
      if (config?.functionName === "getStageConstants") {
        return {
          data: {
            minBuyAmount: 1000n,
            minSellAmount: 5000n,
          },
        };
      }
      return { data: undefined };
    });
  });

  describe("Hook Export", () => {
    it("should export useDGMarket function", () => {
      expect(useDGMarket).toBeDefined();
      expect(typeof useDGMarket).toBe("function");
    });
  });

  describe("Return Values", () => {
    it("should return exchangeRate from contract", () => {
      mockUseReadContract.mockReturnValue({ data: 1000000n as any });

      const { result } = renderHook(() => useDGMarket());

      expect(result.current.exchangeRate).toBeDefined();
    });

    it("should return feeConfig from contract", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          maxFeeBps: 500n,
          minFeeBps: 10n,
          buyFeeBps: 100n,
          sellFeeBps: 200n,
          rateChangeCooldown: 0n,
          appChangeCooldown: 0n,
        } as any,
      });

      const { result } = renderHook(() => useDGMarket());

      expect(result.current.feeConfig).toBeDefined();
    });

    it("should return buyTokens function", () => {
      const { result } = renderHook(() => useDGMarket());

      expect(result.current.buyTokens).toBeDefined();
      expect(typeof result.current.buyTokens).toBe("function");
    });

    it("should return sellTokens function", () => {
      const { result } = renderHook(() => useDGMarket());

      expect(result.current.sellTokens).toBeDefined();
      expect(typeof result.current.sellTokens).toBe("function");
    });

    it("should return isPending state", () => {
      const { result } = renderHook(() => useDGMarket());

      expect(result.current.isPending).toBeDefined();
      expect(typeof result.current.isPending).toBe("boolean");
    });

    it("should return isSuccess state", () => {
      const { result } = renderHook(() => useDGMarket());

      expect(result.current.isSuccess).toBeDefined();
      expect(typeof result.current.isSuccess).toBe("boolean");
    });

    it("should return transaction hash", () => {
      const { result } = renderHook(() => useDGMarket());

      expect("hash" in result.current).toBe(true);
    });
  });

  describe("buyTokens", () => {
    it("should call writeContract with buyTokens function", async () => {
      const { result } = renderHook(() => useDGMarket());

      await act(async () => {
        await result.current.buyTokens(1000n);
      });

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "buyTokens",
          args: [1000n],
        }),
      );
    });

    it("should accept bigint amount", async () => {
      const { result } = renderHook(() => useDGMarket());

      await act(async () => {
        await result.current.buyTokens(5000000n);
      });

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [5000000n],
        }),
      );
    });
  });

  describe("Token + Stage Config", () => {
    it("should expose token and stage constants data when available", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          baseToken: "0x0000000000000000000000000000000000000001",
          swapToken: "0x0000000000000000000000000000000000000002",
          exchangeRate: 2n,
          maxSellCooldown: 0n,
          dailyWindow: 0n,
          minBuyAmount: 1000n,
          minSellAmount: 5000n,
        } as any,
      });

      const { result } = renderHook(() => useDGMarket());

      expect(result.current.baseTokenAddress).toBe(
        "0x0000000000000000000000000000000000000001",
      );
      expect(result.current.swapTokenAddress).toBe(
        "0x0000000000000000000000000000000000000002",
      );
      expect(result.current.minBuyAmount).toBe(1000n);
      expect(result.current.minSellAmount).toBe(5000n);
    });
  });

  describe("sellTokens", () => {
    it("should call writeContract with sellTokens function", async () => {
      const { result } = renderHook(() => useDGMarket());

      await act(async () => {
        await result.current.sellTokens(500n);
      });

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "sellTokens",
          args: [500n],
        }),
      );
    });
  });

  describe("isPending State", () => {
    it("should be true when write is pending", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: true,
      });

      const { result } = renderHook(() => useDGMarket());

      expect(result.current.isPending).toBe(true);
    });

    it("should be true when confirming transaction", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: "0x123" as `0x${string}`,
        isPending: false,
      });
      mockUseWaitForTransactionReceipt.mockReturnValue({
        isLoading: true,
        isSuccess: false,
      });

      const { result } = renderHook(() => useDGMarket());

      expect(result.current.isPending).toBe(true);
    });
  });
});
