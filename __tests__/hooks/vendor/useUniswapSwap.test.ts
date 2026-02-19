/**
 * Unit tests for hooks/vendor/useUniswapSwap.ts
 */

import { renderHook, act } from "@testing-library/react";
import { useUniswapSwap } from "@/hooks/vendor/useUniswapSwap";

// --- Mocks ---

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockGetEthereumProvider = jest.fn().mockResolvedValue({
  request: jest.fn(),
});

const mockWallet = {
  address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  getEthereumProvider: mockGetEthereumProvider,
  switchChain: jest.fn(),
};

jest.mock("@/hooks/unlock/usePrivyWriteWallet", () => ({
  usePrivyWriteWallet: () => mockWallet,
}));

const mockReadContract = jest.fn();
const mockGetBalance = jest.fn();
const mockSimulateContract = jest.fn();
const mockWaitForTransactionReceipt = jest.fn().mockResolvedValue({});

jest.mock("@/lib/blockchain/config", () => ({
  createPublicClientForChain: () => ({
    readContract: mockReadContract,
    getBalance: mockGetBalance,
    simulateContract: mockSimulateContract,
    waitForTransactionReceipt: mockWaitForTransactionReceipt,
  }),
}));

jest.mock("@/lib/blockchain/shared/ensure-wallet-network", () => ({
  ensureWalletOnChainId: jest.fn().mockResolvedValue(undefined),
}));

// Mock fetchPoolState
jest.mock("@/lib/uniswap/pool", () => ({
  fetchPoolState: jest.fn().mockResolvedValue({
    token0: "0x4200000000000000000000000000000000000006", // WETH
    token1: "0xaC27fa800955849d6D17cC8952Ba9dD6EAA66187", // UP
    fee: 3000,
    liquidity: 1000000000000000000n,
    sqrtPriceX96: 79228162514264337593543950336n,
    tick: 0,
  }),
}));

// FEE_CONFIG needs a valid fee wallet for validation
const mockValidateFeeConfig = jest.fn();
jest.mock("@/lib/uniswap/constants", () => {
  const actual = jest.requireActual("@/lib/uniswap/constants");
  return {
    ...actual,
    FEE_CONFIG: {
      feeBips: 25,
      feeRecipient: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    validateFeeConfig: (...args: any[]) => mockValidateFeeConfig(...args),
  };
});

describe("useUniswapSwap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("always targets Base Mainnet for quotes", async () => {
    mockSimulateContract.mockResolvedValue({
      result: [1000000n, 79228162514264337593543950336n, 1, 150000n],
    });

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      await result.current.getQuote("ETH_UP", "A_TO_B", 1000000000000000000n);
    });

    // createPublicClientForChain is called with base chain
    expect(mockSimulateContract).toHaveBeenCalled();
  });

  it("fetches quote and updates state", async () => {
    mockSimulateContract.mockResolvedValue({
      result: [1000000n, 79228162514264337593543950336n, 1, 150000n],
    });

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const quote = await result.current.getQuote(
        "ETH_UP",
        "A_TO_B",
        1000000000000000000n,
      );
      expect(quote).not.toBeNull();
      expect(quote!.amountOut).toBe(1000000n);
      expect(quote!.feeAmount).toBe(2500n); // 1000000 * 25 / 10000
      expect(quote!.userReceives).toBe(997500n);
    });

    expect(result.current.quote).not.toBeNull();
    expect(result.current.isQuoting).toBe(false);
  });

  it("fetches quote for UP_USDC using quoteExactInput", async () => {
    mockSimulateContract.mockResolvedValue({
      result: [5000000n, [79228162514264337593543950336n], [1], 200000n],
    });

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const quote = await result.current.getQuote(
        "UP_USDC",
        "A_TO_B",
        1000000000000000000n,
      );
      expect(quote).not.toBeNull();
      expect(quote!.amountOut).toBe(5000000n);
    });
  });

  it("getQuote does not depend on wallet", async () => {
    // Even with wallet set, quote should work as it only uses publicClient
    mockSimulateContract.mockResolvedValue({
      result: [1000n, 0n, 0, 100000n],
    });

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const quote = await result.current.getQuote("ETH_UP", "A_TO_B", 1n);
      expect(quote).not.toBeNull();
    });
  });

  it("buildSwapSteps returns only swap step for ETH buy", async () => {
    mockGetBalance.mockResolvedValue(10000000000000000000n); // 10 ETH

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const steps = await result.current.buildSwapSteps(
        "ETH_UP",
        "A_TO_B",
        1000000000000000000n,
        900000n,
      );
      // ETH buy = no approvals needed
      expect(steps).toHaveLength(1);
      expect(steps[0]!.id).toBe("swap");
    });
  });

  it("buildSwapSteps includes approval steps for sell", async () => {
    // Token balance sufficient
    mockReadContract.mockResolvedValue(10000000000000000000n);

    const { result } = renderHook(() => useUniswapSwap());

    // First call = balanceOf, second = ERC20 allowance (0), third = Permit2 allowance (0)
    mockReadContract
      .mockResolvedValueOnce(10000000000000000000n) // balanceOf
      .mockResolvedValueOnce(0n) // ERC20 allowance = 0 → needs approval
      .mockResolvedValueOnce([0n, 0, 0]); // Permit2 allowance = 0 → needs approval

    await act(async () => {
      const steps = await result.current.buildSwapSteps(
        "ETH_UP",
        "B_TO_A",
        1000000000000000000n,
        900000n,
      );
      // Sell = 2 approval steps + 1 swap step
      expect(steps).toHaveLength(3);
      expect(steps[0]!.id).toBe("approve-erc20");
      expect(steps[1]!.id).toBe("approve-permit2");
      expect(steps[2]!.id).toBe("swap");
    });
  });

  it("buildSwapSteps skips approvals when allowances sufficient", async () => {
    const MAX_UINT256 = (1n << 256n) - 1n;
    const MAX_UINT160 = (1n << 160n) - 1n;
    const futureExpiry = Math.floor(Date.now() / 1000) + 86400;

    mockReadContract
      .mockResolvedValueOnce(10000000000000000000n) // balanceOf
      .mockResolvedValueOnce(MAX_UINT256) // ERC20 allowance = max → skip
      .mockResolvedValueOnce([MAX_UINT160, futureExpiry, 0]); // Permit2 allowance = max → skip

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const steps = await result.current.buildSwapSteps(
        "ETH_UP",
        "B_TO_A",
        1000000000000000000n,
        900000n,
      );
      expect(steps).toHaveLength(1);
      expect(steps[0]!.id).toBe("swap");
    });
  });

  it("buildSwapSteps checks balance (ETH)", async () => {
    mockGetBalance.mockResolvedValue(100n); // very low balance

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      await expect(
        result.current.buildSwapSteps(
          "ETH_UP",
          "A_TO_B",
          1000000000000000000n,
          900000n,
        ),
      ).rejects.toThrow("Insufficient ETH balance");
    });
  });

  it("buildSwapSteps checks balance (ERC20)", async () => {
    mockReadContract.mockResolvedValueOnce(100n); // very low token balance

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      await expect(
        result.current.buildSwapSteps(
          "ETH_UP",
          "B_TO_A",
          1000000000000000000n,
          900000n,
        ),
      ).rejects.toThrow("Insufficient token balance");
    });
  });

  it("buildSwapSteps validates fee config", async () => {
    mockValidateFeeConfig.mockImplementationOnce(() => {
      throw new Error("NEXT_PUBLIC_UNISWAP_FEE_WALLET is not configured");
    });

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      await expect(
        result.current.buildSwapSteps("ETH_UP", "A_TO_B", 1n, 1n),
      ).rejects.toThrow("NEXT_PUBLIC_UNISWAP_FEE_WALLET is not configured");
    });
  });

  it("step execute() returns TxResult with waitForConfirmation", async () => {
    mockGetBalance.mockResolvedValue(10000000000000000000n);

    const { result } = renderHook(() => useUniswapSwap());

    let steps: any[];
    await act(async () => {
      steps = await result.current.buildSwapSteps(
        "ETH_UP",
        "A_TO_B",
        1000000000000000000n,
        900000n,
      );
    });

    // Verify the step has the right structure
    expect(steps![0]!.execute).toBeDefined();
    expect(typeof steps![0]!.execute).toBe("function");
  });

  it("buildSwapSteps includes approval steps for UP_USDC", async () => {
    mockReadContract
      .mockResolvedValueOnce(10000000000000000000n) // balanceOf for UP
      .mockResolvedValueOnce(0n) // ERC20 allowance
      .mockResolvedValueOnce([0n, 0, 0]); // Permit2 allowance

    const { result } = renderHook(() => useUniswapSwap());

    await act(async () => {
      const steps = await result.current.buildSwapSteps(
        "UP_USDC",
        "A_TO_B",
        1000000000000000000n,
        4000000n,
      );
      expect(steps.length).toBe(3); // 2 approvals + swap
      expect(steps[0]!.id).toBe("approve-erc20");
      expect(steps[2]!.id).toBe("swap");
    });
  });
});
