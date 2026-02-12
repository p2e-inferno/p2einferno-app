import { renderHook, act } from "@testing-library/react";

process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS =
  process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS ??
  "0x00000000000000000000000000000000000000ff";

const mockUseReadContract = jest.fn();
jest.mock("wagmi", () => ({
  useReadContract: (args: any) => mockUseReadContract(args),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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

const mockUsePrivyWriteWallet = jest.fn();
jest.mock("@/hooks/unlock/usePrivyWriteWallet", () => ({
  usePrivyWriteWallet: () => mockUsePrivyWriteWallet(),
}));

const mockCreateViemFromPrivyWallet = jest.fn();
jest.mock("@/lib/blockchain/providers/privy-viem", () => ({
  createViemFromPrivyWallet: (...args: any[]) =>
    mockCreateViemFromPrivyWallet(...args),
}));

jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
  DG_TOKEN_VENDOR_ABI: [],
}));

describe("useDGLightUp", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseReadContract.mockImplementation(({ functionName }: any) => {
      if (functionName === "getTokenConfig") {
        return {
          data: {
            baseToken: "0x0000000000000000000000000000000000000001",
            swapToken: "0x0000000000000000000000000000000000000002",
            exchangeRate: 1n,
          },
          isLoading: false,
        };
      }

      if (functionName === "getUserState") {
        return {
          data: {
            stage: 1,
            points: 0n,
            fuel: 0n,
            lastStage3MaxSale: 0n,
            dailySoldAmount: 0n,
            dailyWindowStart: 0n,
          },
          isLoading: false,
        };
      }

      if (functionName === "getStageConfig") {
        return {
          data: {
            burnAmount: 10n,
            upgradePointsThreshold: 0n,
            upgradeFuelThreshold: 0n,
            fuelRate: 0n,
            pointsAwarded: 0n,
            qualifyingBuyThreshold: 0n,
            maxSellBps: 0n,
            dailyLimitMultiplier: 0n,
          },
          isLoading: false,
        };
      }

      return { data: undefined, isLoading: false };
    });
  });

  it("exposes burn config and stage", async () => {
    mockUsePrivyWriteWallet.mockReturnValue({
      address: "0x00000000000000000000000000000000000000aa",
      getEthereumProvider: jest.fn(),
      switchChain: jest.fn(),
    });

    const { useDGLightUp } = await import("@/hooks/vendor/useDGLightUp");
    const { result } = renderHook(() => useDGLightUp());

    expect(result.current.baseTokenAddress).toBe(
      "0x0000000000000000000000000000000000000001",
    );
    expect(result.current.burnAmount).toBe(10n);
    expect(result.current.currentStage).toBe(1);
    expect(typeof result.current.executeLightUpTx).toBe("function");
  });

  it("executeLightUpTx returns TxResult with waitForConfirmation", async () => {
    mockUsePrivyWriteWallet.mockReturnValue({
      address: "0x00000000000000000000000000000000000000aa",
      getEthereumProvider: jest.fn(),
      switchChain: jest.fn(),
    });

    const publicClient = {
      waitForTransactionReceipt: jest
        .fn()
        .mockResolvedValue({ status: "success" }),
    };
    const walletClient = {
      account: "0x00000000000000000000000000000000000000aa",
      chain: { name: "Base" },
      writeContract: jest
        .fn()
        .mockResolvedValue(
          "0x00000000000000000000000000000000000000000000000000000000000000b1",
        ),
    };
    mockCreateViemFromPrivyWallet.mockResolvedValue({
      walletClient,
      publicClient,
    });

    const { useDGLightUp } = await import("@/hooks/vendor/useDGLightUp");
    const { result } = renderHook(() => useDGLightUp());

    let tx: any;
    await act(async () => {
      tx = await result.current.executeLightUpTx();
    });

    expect(tx.transactionHash).toBe(
      "0x00000000000000000000000000000000000000000000000000000000000000b1",
    );
    expect(typeof tx.waitForConfirmation).toBe("function");

    await act(async () => {
      await tx.waitForConfirmation();
    });

    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
  });
});
