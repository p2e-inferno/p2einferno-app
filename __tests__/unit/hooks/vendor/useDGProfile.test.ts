/**
 * TDD Tests for useDGProfile Hook
 *
 * These tests define the expected API for the DG profile hook.
 * Tests will FAIL until hooks/vendor/useDGProfile.ts is implemented.
 */

import { renderHook, act } from "@testing-library/react";

// Mock wagmi hooks and Privy-related hooks used in the implementation
const mockWriteContract = jest.fn();
const mockRefetchState = jest.fn();

const mockUseWriteContract = jest.fn(() => ({
  writeContract: mockWriteContract,
  data: null,
  isPending: false,
}));

const mockUseReadContract = jest.fn((_config?: any) => ({
  data: undefined,
  refetch: mockRefetchState,
}));

const mockUseUser = jest.fn(() => ({ user: null }));
const mockUseDetectConnectedWalletAddress = jest.fn(() => ({
  walletAddress: "0x1234567890123456789012345678901234567890",
}));

jest.mock("wagmi", () => ({
  useWriteContract: () => mockUseWriteContract(),
  useReadContract: (config: any) => mockUseReadContract(config),
}));

jest.mock("@privy-io/react-auth", () => ({
  useUser: () => mockUseUser(),
}));

jest.mock("@/hooks/useDetectConnectedWalletAddress", () => ({
  useDetectConnectedWalletAddress: () => mockUseDetectConnectedWalletAddress(),
}));

// Mock the ABI
jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
  DG_TOKEN_VENDOR_ABI: [],
}));

describe("useDGProfile", () => {
  let useDGProfile: any;
  let USER_STAGE_LABELS: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/hooks/vendor/useDGProfile");
      useDGProfile = mod.useDGProfile;
      USER_STAGE_LABELS = mod.USER_STAGE_LABELS;
    } catch {
      // Expected to fail until implemented
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Hook Export", () => {
    it("should export useDGProfile function", () => {
      expect(useDGProfile).toBeDefined();
      expect(typeof useDGProfile).toBe("function");
    });
  });

  describe("Return Values", () => {
    it("should return userState object", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 0,
          points: 1000n,
          fuel: 500n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState).toBeDefined();
    });

    it("should return upgradeStage function", () => {
      const { result } = renderHook(() => useDGProfile());

      expect(result.current.upgradeStage).toBeDefined();
      expect(typeof result.current.upgradeStage).toBe("function");
    });

    it("should return refetchState function", () => {
      const { result } = renderHook(() => useDGProfile());

      expect(result.current.refetchState).toBeDefined();
      expect(typeof result.current.refetchState).toBe("function");
    });

    it("should return isPending state", () => {
      const { result } = renderHook(() => useDGProfile());

      expect(result.current.isPending).toBeDefined();
      expect(typeof result.current.isPending).toBe("boolean");
    });

    it("should return hash", () => {
      const { result } = renderHook(() => useDGProfile());

      expect("hash" in result.current).toBe(true);
    });
  });

  describe("userState Mapping", () => {
    it("should map tuple result to object with stage", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 2,
          points: 1000n,
          fuel: 500n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState?.stage).toBe(2);
    });

    it("should map tuple result to object with points", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 0,
          points: 1500n,
          fuel: 500n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState?.points).toBe(1500n);
    });

    it("should map tuple result to object with fuel", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 0,
          points: 1000n,
          fuel: 750n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState?.fuel).toBe(750n);
    });

    it("should map tuple result to object with dailySoldAmount", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 0,
          points: 0n,
          fuel: 0n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 1000n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState?.dailySoldAmount).toBe(1000n);
    });

    it("should return undefined userState when no data", () => {
      mockUseReadContract.mockReturnValue({
        data: undefined,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.userState).toBeUndefined();
    });
  });

  describe("Stage Labels", () => {
    it("should map numeric stage to human-readable label", () => {
      mockUseReadContract.mockReturnValue({
        data: {
          stage: 1,
          points: 0n,
          fuel: 0n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        } as any,
        refetch: mockRefetchState,
      });

      const { result } = renderHook(() => useDGProfile());

      expect(result.current.stageLabel).toBe(USER_STAGE_LABELS[1]);
    });
  });

  describe("upgradeStage", () => {
    it("should call writeContract with upgradeStage function", () => {
      const { result } = renderHook(() => useDGProfile());

      act(() => {
        result.current.upgradeStage();
      });

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "upgradeStage",
        }),
      );
    });
  });

  describe("Wallet Requirement", () => {
    it("should not fetch userState when walletAddress is undefined", () => {
      mockUseDetectConnectedWalletAddress.mockReturnValue({
        walletAddress: undefined as any,
      });

      renderHook(() => useDGProfile());

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it("should fetch userState when walletAddress is available", () => {
      mockUseDetectConnectedWalletAddress.mockReturnValue({
        walletAddress: "0x1234567890123456789012345678901234567890",
      });

      renderHook(() => useDGProfile());

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ enabled: true }),
        }),
      );
    });
  });
});
