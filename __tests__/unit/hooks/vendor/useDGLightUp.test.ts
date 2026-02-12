/**
 * TDD Tests for useDGLightUp Hook
 *
 * These tests define the expected API for the DG light up hook.
 * Tests will FAIL until hooks/vendor/useDGLightUp.ts is implemented.
 */

import { renderHook, act } from "@testing-library/react";

process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS =
  process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS ??
  "0x00000000000000000000000000000000000000ff";

// Mock wagmi hooks
const mockWriteContract = jest.fn();
const mockUseReadContract = jest.fn();

const mockUseWriteContract = jest.fn(() => ({
  writeContract: mockWriteContract,
  data: undefined as any,
  isPending: false,
}));

const mockUseWaitForTransactionReceipt = jest.fn(() => ({
  isLoading: false,
  isSuccess: false,
}));

jest.mock("wagmi", () => ({
  useReadContract: () => mockUseReadContract(),
  useWriteContract: () => mockUseWriteContract(),
  useWaitForTransactionReceipt: () => mockUseWaitForTransactionReceipt(),
}));

const mockApproveIfNeeded = jest.fn();
jest.mock("@/hooks/useTokenApproval", () => ({
  useTokenApproval: () => ({
    approveIfNeeded: mockApproveIfNeeded,
    isApproving: false,
    error: null,
  }),
}));

jest.mock("@privy-io/react-auth", () => ({
  useUser: () => ({ user: {} }),
}));

jest.mock("@/hooks/useDetectConnectedWalletAddress", () => ({
  useDetectConnectedWalletAddress: () => ({
    walletAddress: "0x00000000000000000000000000000000000000aa",
  }),
}));

// Mock the ABI
jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
  DG_TOKEN_VENDOR_ABI: [],
}));

describe("useDGLightUp", () => {
  let useDGLightUp: any;

  beforeAll(async () => {
    try {
      const mod = await import("@/hooks/vendor/useDGLightUp");
      useDGLightUp = mod.useDGLightUp;
    } catch {
      // Expected to fail until implemented
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockApproveIfNeeded.mockResolvedValue({ success: true });
    mockUseReadContract.mockImplementation(() => ({
      data: undefined,
    }));
  });

  describe("Hook Export", () => {
    it("should export useDGLightUp function", () => {
      expect(useDGLightUp).toBeDefined();
      expect(typeof useDGLightUp).toBe("function");
    });
  });

  describe("Return Values", () => {
    it("should return lightUp function", () => {
      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.lightUp).toBeDefined();
      expect(typeof result.current.lightUp).toBe("function");
    });

    it("should return isPending state", () => {
      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isPending).toBeDefined();
      expect(typeof result.current.isPending).toBe("boolean");
    });

    it("should return isApproving state", () => {
      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isApproving).toBeDefined();
      expect(typeof result.current.isApproving).toBe("boolean");
    });

    it("should return isSuccess state", () => {
      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isSuccess).toBeDefined();
      expect(typeof result.current.isSuccess).toBe("boolean");
    });

    it("should return hash", () => {
      const { result } = renderHook(() => useDGLightUp());

      expect("hash" in result.current).toBe(true);
    });
  });

  describe("lightUp", () => {
    it("should call approveIfNeeded then writeContract with lightUp function", async () => {
      mockUseReadContract.mockImplementation(() => ({
        data: {
          baseToken: "0x0000000000000000000000000000000000000001",
        },
      }));
      // getUserState
      mockUseReadContract
        .mockImplementationOnce(() => ({
          data: {
            baseToken: "0x0000000000000000000000000000000000000001",
          },
        }))
        .mockImplementationOnce(() => ({
          data: {
            stage: 1,
          },
        }))
        .mockImplementationOnce(() => ({
          data: {
            burnAmount: 10n,
          },
        }));

      const { result } = renderHook(() => useDGLightUp());

      await act(async () => {
        await result.current.lightUp();
      });

      expect(mockApproveIfNeeded).toHaveBeenCalledWith({
        tokenAddress: "0x0000000000000000000000000000000000000001",
        spenderAddress: process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS,
        amount: 10n,
      });
      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "lightUp",
        }),
      );
    });

    it("should not require any arguments", async () => {
      mockUseReadContract
        .mockImplementationOnce(() => ({
          data: {
            baseToken: "0x0000000000000000000000000000000000000001",
          },
        }))
        .mockImplementationOnce(() => ({
          data: {
            stage: 1,
          },
        }))
        .mockImplementationOnce(() => ({
          data: {
            burnAmount: 10n,
          },
        }));

      const { result } = renderHook(() => useDGLightUp());

      await act(async () => {
        await result.current.lightUp();
      });

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.not.objectContaining({
          args: expect.anything(),
        }),
      );
    });
  });

  describe("isPending State", () => {
    it("should be false initially", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: false,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isPending).toBe(false);
    });

    it("should be true when transaction is pending", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: true,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isPending).toBe(true);
    });
  });

  describe("isSuccess State", () => {
    it("should be false initially", () => {
      mockUseWaitForTransactionReceipt.mockReturnValue({
        isLoading: false,
        isSuccess: false,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isSuccess).toBe(false);
    });

    it("should be true when transaction is confirmed", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: "0x123abc" as `0x${string}`,
        isPending: false,
      });
      mockUseWaitForTransactionReceipt.mockReturnValue({
        isLoading: false,
        isSuccess: true,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.isSuccess).toBe(true);
    });
  });

  describe("Transaction Hash", () => {
    it("should return null hash when no transaction", () => {
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: false,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.hash).toBeNull();
    });

    it("should return hash when transaction is sent", () => {
      const txHash = "0xabc123def456" as `0x${string}`;
      mockUseWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: txHash,
        isPending: false,
      });

      const { result } = renderHook(() => useDGLightUp());

      expect(result.current.hash).toBe(txHash);
    });
  });
});
