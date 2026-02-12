/**
 * Unit tests for useTokenApproval hook
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useTokenApproval } from "@/hooks/useTokenApproval";

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockUsePrivyWriteWallet = jest.fn();
jest.mock("@/hooks/unlock/usePrivyWriteWallet", () => ({
  usePrivyWriteWallet: () => mockUsePrivyWriteWallet(),
}));

const mockCreateViemFromPrivyWallet = jest.fn();
jest.mock("@/lib/blockchain/providers/privy-viem", () => ({
  createViemFromPrivyWallet: (...args: any[]) =>
    mockCreateViemFromPrivyWallet(...args),
}));

describe("useTokenApproval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns an error when wallet is not connected", async () => {
    mockUsePrivyWriteWallet.mockReturnValue(null);

    const { result } = renderHook(() => useTokenApproval());

    const params = {
      tokenAddress: "0x0000000000000000000000000000000000000001" as const,
      spenderAddress: "0x0000000000000000000000000000000000000002" as const,
      amount: 1n,
    };

    let res: any;
    await act(async () => {
      res = await result.current.approveIfNeeded(params);
    });

    expect(res).toEqual({ success: false, error: "Wallet not connected" });
    expect(mockCreateViemFromPrivyWallet).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.error).toBe("Wallet not connected");
      expect(result.current.isApproving).toBe(false);
    });
  });

  it("returns an error when wallet does not support approvals", async () => {
    mockUsePrivyWriteWallet.mockReturnValue({ address: "0xabc" });

    const { result } = renderHook(() => useTokenApproval());

    const params = {
      tokenAddress: "0x0000000000000000000000000000000000000001" as const,
      spenderAddress: "0x0000000000000000000000000000000000000002" as const,
      amount: 1n,
    };

    let res: any;
    await act(async () => {
      res = await result.current.approveIfNeeded(params);
    });

    expect(res).toEqual({
      success: false,
      error: "Wallet does not support token approvals",
    });
    expect(mockCreateViemFromPrivyWallet).not.toHaveBeenCalled();
  });

  it("falls back to approve(0) then approve(amount) when direct approve fails with non-zero allowance", async () => {
    mockUsePrivyWriteWallet.mockReturnValue({
      address: "0x00000000000000000000000000000000000000aa",
      getEthereumProvider: jest.fn(),
      switchChain: jest.fn(),
    });

    const publicClient = {
      readContract: jest.fn().mockResolvedValue(1n),
      waitForTransactionReceipt: jest
        .fn()
        .mockResolvedValue({ status: "success" }),
    };

    const walletClient = {
      account: "0x00000000000000000000000000000000000000aa",
      chain: { id: 8453 },
      writeContract: jest
        .fn()
        // direct approve(amount) fails
        .mockRejectedValueOnce(new Error("approve failed"))
        // approve(0) succeeds
        .mockResolvedValueOnce(
          "0x00000000000000000000000000000000000000000000000000000000000000b0",
        )
        // approve(amount) succeeds
        .mockResolvedValueOnce(
          "0x00000000000000000000000000000000000000000000000000000000000000b1",
        ),
    };

    mockCreateViemFromPrivyWallet.mockResolvedValue({
      walletClient,
      publicClient,
    });

    const { result } = renderHook(() => useTokenApproval());

    const params = {
      tokenAddress: "0x0000000000000000000000000000000000000001" as const,
      spenderAddress: "0x0000000000000000000000000000000000000002" as const,
      amount: 10n,
    };

    let res: any;
    await act(async () => {
      res = await result.current.approveIfNeeded(params);
    });

    expect(res).toEqual({
      success: true,
      transactionHash:
        "0x00000000000000000000000000000000000000000000000000000000000000b1",
    });

    expect(publicClient.readContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(3);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  });
});
