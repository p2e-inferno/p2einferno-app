import { renderHook, act } from "@testing-library/react";
import { useUpdateMaxKeysPerAddress } from "@/hooks/unlock/useUpdateMaxKeysPerAddress";
import type { Address } from "viem";

// Mock dependencies
jest.mock("@/hooks/unlock/usePrivyWriteWallet");
jest.mock("@/lib/blockchain/providers/privy-viem");
jest.mock("@/lib/blockchain/helpers/max-keys-security");

describe("useUpdateMaxKeysPerAddress", () => {
  const mockLockAddress =
    "0x1234567890abcdef1234567890abcdef12345678" as Address;
  const mockWallet = {
    address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address,
  };
  const mockWalletClient = {
    writeContract: jest.fn(),
    account: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address,
    chain: { id: 8453 },
  };
  const mockPublicClient = {
    readContract: jest.fn(),
    estimateContractGas: jest.fn(),
    waitForTransactionReceipt: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    const { usePrivyWriteWallet } = require("@/hooks/unlock/usePrivyWriteWallet");
    usePrivyWriteWallet.mockReturnValue(mockWallet);

    const { createViemFromPrivyWallet } = require("@/lib/blockchain/providers/privy-viem");
    createViemFromPrivyWallet.mockResolvedValue({
      walletClient: mockWalletClient,
      publicClient: mockPublicClient,
    });

    // Default: user is a lock manager
    mockPublicClient.readContract.mockImplementation((args: any) => {
      if (args.functionName === "isLockManager") {
        return Promise.resolve(true);
      }
      return Promise.resolve(0n);
    });

    const { getLockConfigForUpdate } = require("@/lib/blockchain/helpers/max-keys-security");
    getLockConfigForUpdate.mockResolvedValue([1000n, 100n, 0n]);
  });

  describe("wallet validation", () => {
    it("returns error when wallet is null", async () => {
      const { usePrivyWriteWallet } = require("@/hooks/unlock/usePrivyWriteWallet");
      usePrivyWriteWallet.mockReturnValue(null);

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response).toEqual({
        success: false,
        error: "Wallet not connected",
      });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("successful update", () => {
    it("successfully updates maxKeysPerAddress to 0", async () => {
      mockWalletClient.writeContract.mockResolvedValue("0xtxhash");
      mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response).toEqual({
        success: true,
        transactionHash: "0xtxhash",
      });
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.error).toBeNull();
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
        address: mockLockAddress,
        abi: expect.any(Array),
        functionName: "updateLockConfig",
        args: [1000n, 100n, 0n],
        gas: 120000n, // 20% padding
      });
    });

    it("applies 20% gas padding", async () => {
      mockWalletClient.writeContract.mockResolvedValue("0xtxhash");
      mockPublicClient.estimateContractGas.mockResolvedValue(50000n);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          gas: 60000n, // 50000 * 1.2
        }),
      );
    });
  });

  describe("permission checks", () => {
    it("returns error when user is not lock manager", async () => {
      // Override readContract to return false for isLockManager
      mockPublicClient.readContract.mockImplementation((args: any) => {
        if (args.functionName === "isLockManager") {
          return Promise.resolve(false);
        }
        return Promise.resolve(0n);
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response).toEqual({
        success: false,
        error: expect.stringContaining("must be a lock manager"),
      });
    });
  });

  describe("error handling", () => {
    it("handles gas estimation failure", async () => {
      mockPublicClient.estimateContractGas.mockRejectedValue(
        new Error("Gas estimation failed"),
      );

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("Gas estimation failed");
    });

    it("handles transaction revert", async () => {
      mockWalletClient.writeContract.mockResolvedValue("0xtxhash");
      mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "reverted",
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("Transaction failed with status");
    });

    it("handles RPC failure on config read", async () => {
      const { getLockConfigForUpdate } = require("@/lib/blockchain/helpers/max-keys-security");
      getLockConfigForUpdate.mockRejectedValue(
        new Error("RPC read failed"),
      );

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("RPC read failed");
    });

    it("handles RPC failure on write", async () => {
      mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
      mockWalletClient.writeContract.mockRejectedValue(
        new Error("RPC write failed"),
      );

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("RPC write failed");
    });

    it("handles RPC failure on receipt", async () => {
      mockWalletClient.writeContract.mockResolvedValue("0xtxhash");
      mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
      mockPublicClient.waitForTransactionReceipt.mockRejectedValue(
        new Error("Receipt fetch failed"),
      );

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const response = await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain("Receipt fetch failed");
    });
  });

  describe("state transitions", () => {
    it("sets isLoading to true during execution", async () => {
      mockWalletClient.writeContract.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve("0xtxhash"), 100),
          ),
      );
      mockPublicClient.estimateContractGas.mockResolvedValue(100000n);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      const promise = act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      await promise;

      // Should be done loading
      expect(result.current.isLoading).toBe(false);
    });

    it("resets error on new call", async () => {
      mockPublicClient.estimateContractGas
        .mockRejectedValueOnce(new Error("First error"))
        .mockResolvedValueOnce(100000n);
      mockWalletClient.writeContract.mockResolvedValue("0xtxhash");
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
        status: "success",
      });

      const { result } = renderHook(() => useUpdateMaxKeysPerAddress());

      // First call fails
      await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );
      expect(result.current.error).toContain("First error");

      // Second call succeeds
      await act(() =>
        result.current.updateMaxKeysPerAddress({ lockAddress: mockLockAddress }),
      );
      expect(result.current.error).toBeNull();
    });
  });
});
