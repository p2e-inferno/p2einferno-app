/**
 * Unit tests for UniswapSwapTab and VendorSwap tab navigation.
 */

import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import UniswapSwapTab from "@/components/vendor/UniswapSwapTab";

// --- Mocks ---

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mutable state for useUniswapSwap mock (tests can override before rendering)
let mockQuote: any = null;
let mockIsQuoting = false;
let mockError: string | null = null;
let mockBalance: bigint | null = null;

const mockGetQuote = jest.fn();
const mockBuildSwapSteps = jest.fn();
const mockFetchBalance = jest.fn();

jest.mock("@/hooks/vendor/useUniswapSwap", () => ({
  useUniswapSwap: () => ({
    quote: mockQuote,
    isQuoting: mockIsQuoting,
    error: mockError,
    balance: mockBalance,
    getQuote: mockGetQuote,
    buildSwapSteps: mockBuildSwapSteps,
    fetchBalance: mockFetchBalance,
    isSupported: true,
    feeBips: 25,
  }),
}));

// Stepper mock functions (trackable across tests)
const mockStepperStart = jest.fn();
const mockStepperRetry = jest.fn();
const mockStepperCancel = jest.fn();
const mockStepperWaitForSteps = jest.fn().mockResolvedValue(undefined);
const mockStepsVersion = { current: 0 };

jest.mock("@/hooks/useTransactionStepper", () => ({
  useTransactionStepper: (steps: any[]) => ({
    state: {
      steps: steps.map((s: any) => ({
        title: s.title,
        description: s.description,
        status: "pending",
      })),
      activeStepIndex: -1,
      isRunning: false,
      canClose: true,
    },
    start: mockStepperStart,
    retryStep: mockStepperRetry,
    skipStep: jest.fn(),
    waitForSteps: mockStepperWaitForSteps,
    cancel: mockStepperCancel,
    stepsVersion: mockStepsVersion,
  }),
}));

jest.mock("@/components/admin/TransactionStepperModal", () => ({
  TransactionStepperModal: ({
    open,
    steps,
    onRetry,
    onCancel,
    onClose,
  }: {
    open: boolean;
    steps: any[];
    onRetry: () => void;
    onCancel: () => void;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="stepper-modal">
        {steps?.map((s: any, i: number) => (
          <div key={i} data-testid={`step-${i}`}>
            {s.title}
          </div>
        ))}
        <button data-testid="retry-btn" onClick={onRetry}>
          Retry
        </button>
        <button data-testid="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button data-testid="close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

const mockToast = jest.requireMock("react-hot-toast").default;
const mockToastSuccess: jest.Mock = mockToast.success;

// Helper to reset mutable mock state to defaults
function resetMockState() {
  mockQuote = null;
  mockIsQuoting = false;
  mockError = null;
  mockBalance = null;
}

// ---------------------------------------------------------------------------
// Basic rendering tests
// ---------------------------------------------------------------------------

describe("UniswapSwapTab", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
  });

  it("renders pair selector", () => {
    render(<UniswapSwapTab />);
    expect(screen.getByText("ETH / UP")).toBeInTheDocument();
    expect(screen.getByText("ETH / USDC")).toBeInTheDocument();
    expect(screen.getByText("UP / USDC")).toBeInTheDocument();
  });

  it("renders pair-aware direction toggle", () => {
    render(<UniswapSwapTab />);
    // Default pair ETH_UP
    expect(screen.getByText("Buy UP")).toBeInTheDocument();
    expect(screen.getByText("Sell UP")).toBeInTheDocument();
  });

  it("renders UP->USDC/USDC->UP for UP/USDC pair", () => {
    render(<UniswapSwapTab />);
    fireEvent.click(screen.getByText("UP / USDC"));
    // Direction buttons use unicode arrow
    expect(screen.getByText("UP \u2192 USDC")).toBeInTheDocument();
    expect(screen.getByText("USDC \u2192 UP")).toBeInTheDocument();
  });

  it("disables swap button when no amount", () => {
    render(<UniswapSwapTab />);
    const button = screen.getByRole("button", { name: "Enter amount" });
    expect(button).toBeDisabled();
  });

  it("renders fee disclosure", () => {
    render(<UniswapSwapTab />);
    expect(screen.getByText("0.25% swap fee applied")).toBeInTheDocument();
  });

  it("renders amount input", () => {
    render(<UniswapSwapTab />);
    const input = screen.getByPlaceholderText("0.0");
    expect(input).toBeInTheDocument();
  });

  it("shows invalid amount error", () => {
    render(<UniswapSwapTab />);
    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByText("Enter a valid amount.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Quote display and price impact tests
// ---------------------------------------------------------------------------

describe("UniswapSwapTab — quote display and price impact", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
  });

  it("shows post-fee amount after quote", () => {
    // UP has 18 decimals — 997500000000000000 wei = 0.9975
    mockQuote = {
      amountOut: 1000000000000000000n,
      feeAmount: 2500000000000000n,
      userReceives: 997500000000000000n,
      priceImpact: 0.1,
      gasEstimate: 150000n,
    };

    render(<UniswapSwapTab />);
    // Need a valid amount in the input for the quote section to render
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });

    expect(screen.getByText("You will receive")).toBeInTheDocument();
    expect(screen.getByText(/0\.9975/)).toBeInTheDocument();
  });

  it("shows price impact warning when > 1%", () => {
    mockQuote = {
      amountOut: 1000000000000000000n,
      feeAmount: 2500000000000000n,
      userReceives: 997500000000000000n,
      priceImpact: 2.5,
      gasEstimate: 150000n,
    };

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });

    expect(screen.getByText("Price impact")).toBeInTheDocument();
    expect(screen.getByText("2.50%")).toBeInTheDocument();
  });

  it("blocks swap when price impact > 5% (single-hop)", () => {
    mockQuote = {
      amountOut: 1000000000000000000n,
      feeAmount: 2500000000000000n,
      userReceives: 997500000000000000n,
      priceImpact: 7.5,
      gasEstimate: 150000n,
    };

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });

    const button = screen.getByRole("button", {
      name: "Price impact too high",
    });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/Price impact too high \(7\.5%\)/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Stepper integration tests
// ---------------------------------------------------------------------------

describe("UniswapSwapTab — stepper integration", () => {
  const swapStep = {
    id: "swap",
    title: "Execute Swap",
    description: "Send swap transaction to the Universal Router",
    execute: jest.fn(),
  };

  const approveErc20Step = {
    id: "approve-erc20",
    title: "Approve token for Permit2",
    description: "One-time ERC20 approval",
    execute: jest.fn(),
  };

  const approvePermit2Step = {
    id: "approve-permit2",
    title: "Approve Universal Router via Permit2",
    description: "One-time Permit2 allowance",
    execute: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
    // Set a valid quote so the swap button is enabled
    mockQuote = {
      amountOut: 1000000n,
      feeAmount: 250n,
      userReceives: 999750n,
      priceImpact: 0.1,
      gasEstimate: 150000n,
    };
    mockStepsVersion.current = 0;
    mockStepperWaitForSteps.mockResolvedValue(undefined);
  });

  it("opens stepper modal on swap click", async () => {
    mockBuildSwapSteps.mockResolvedValue([swapStep]);
    // Hang stepperStart so modal stays open for inspection
    mockStepperStart.mockReturnValue(new Promise(() => {}));

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });
    expect(mockBuildSwapSteps).toHaveBeenCalled();
  });

  it("stepper modal shows only swap step for ETH buy", async () => {
    mockBuildSwapSteps.mockResolvedValue([swapStep]);
    mockStepperStart.mockReturnValue(new Promise(() => {}));

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });

    // Only one step rendered
    expect(screen.getByTestId("step-0")).toHaveTextContent("Execute Swap");
    expect(screen.queryByTestId("step-1")).not.toBeInTheDocument();
  });

  it("stepper modal shows approval + swap steps for sell", async () => {
    mockBuildSwapSteps.mockResolvedValue([
      approveErc20Step,
      approvePermit2Step,
      swapStep,
    ]);
    mockStepperStart.mockReturnValue(new Promise(() => {}));

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });

    expect(screen.getByTestId("step-0")).toHaveTextContent(
      "Approve token for Permit2",
    );
    expect(screen.getByTestId("step-1")).toHaveTextContent(
      "Approve Universal Router via Permit2",
    );
    expect(screen.getByTestId("step-2")).toHaveTextContent("Execute Swap");
  });

  it("retry works after wallet rejection", async () => {
    mockBuildSwapSteps.mockResolvedValue([swapStep]);
    mockStepperStart.mockRejectedValueOnce(new Error("user rejected"));
    mockStepperRetry.mockResolvedValueOnce(undefined);

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    // Wait for modal to open (stepperStart rejects → enters catch → awaits decision)
    await waitFor(() => {
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });

    // Click retry — resolves decisionResolverRef with "retry"
    await act(async () => {
      fireEvent.click(screen.getByTestId("retry-btn"));
    });

    // After retry succeeds, modal stays open (user sees success state) and toast fires
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Swap complete!");
    });
    expect(mockStepperRetry).toHaveBeenCalledTimes(1);
    // Modal is still visible — user clicks "Done" to dismiss
    expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId("close-btn"));
    });
    await waitFor(() => {
      expect(screen.queryByTestId("stepper-modal")).not.toBeInTheDocument();
    });
  });

  it("cancel closes modal cleanly", async () => {
    mockBuildSwapSteps.mockResolvedValue([swapStep]);
    mockStepperStart.mockRejectedValueOnce(new Error("user rejected"));

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(screen.getByTestId("stepper-modal")).toBeInTheDocument();
    });

    // Click cancel — resolves decisionResolverRef with "cancel"
    await act(async () => {
      fireEvent.click(screen.getByTestId("cancel-btn"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("stepper-modal")).not.toBeInTheDocument();
    });
    expect(mockStepperCancel).toHaveBeenCalled();
    // No success toast — user cancelled
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it("consecutive same-count swaps use fresh version snapshots", async () => {
    mockBuildSwapSteps.mockResolvedValue([swapStep]);
    mockStepperStart.mockResolvedValue(undefined);
    mockStepsVersion.current = 0;

    render(<UniswapSwapTab />);
    fireEvent.change(screen.getByPlaceholderText("0.0"), {
      target: { value: "1" },
    });

    // First swap — component snapshots version 0 before setting steps
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledTimes(1);
    });

    // Verify first call passed the version snapshot (0)
    expect(mockStepperWaitForSteps).toHaveBeenCalledWith(1, 0);

    // Simulate stepper incrementing version (as the real hook does on step install)
    mockStepsVersion.current = 1;

    // Second swap — same step count (1), but version should be fresh (1)
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledTimes(2);
    });

    // Verify second call used the updated version snapshot (1), not stale (0)
    expect(mockStepperWaitForSteps).toHaveBeenCalledTimes(2);
    expect(mockStepperWaitForSteps).toHaveBeenNthCalledWith(2, 1, 1);
  });
});

// ---------------------------------------------------------------------------
// VendorSwap tab navigation tests
// ---------------------------------------------------------------------------

jest.mock("@/hooks/vendor/useDGMarket", () => ({
  useDGMarket: () => ({
    buyTokens: jest.fn(),
    sellTokens: jest.fn(),
    isPending: false,
    isApproving: false,
    exchangeRate: undefined,
    feeConfig: undefined,
    minBuyAmount: undefined,
    minSellAmount: undefined,
    baseTokenAddress: undefined,
    swapTokenAddress: undefined,
  }),
}));

jest.mock("@/hooks/vendor/useDGTokenBalances", () => ({
  useDGTokenBalances: () => ({
    base: { symbol: "USDC", decimals: 6 },
    swap: { symbol: "DG", decimals: 18 },
  }),
}));

jest.mock("@/hooks/useGoodDollarVerification", () => ({
  useGoodDollarVerification: () => ({
    isLoading: false,
    data: { isWhitelisted: true },
  }),
}));

jest.mock("@/hooks/vendor/useDGVendorAccess", () => ({
  useDGVendorAccess: () => ({
    isKeyHolder: true,
    isPaused: false,
  }),
}));

describe("VendorSwap tab navigation", () => {
  // Dynamic import after mocks are set up
  let VendorSwap: any;

  beforeAll(async () => {
    const mod = await import("@/components/vendor/VendorSwap");
    VendorSwap = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
  });

  it("renders tab navigation", () => {
    render(<VendorSwap />);
    expect(screen.getByText("DG Market")).toBeInTheDocument();
    expect(screen.getByText("Uniswap")).toBeInTheDocument();
  });

  it("shows DG Market content by default", () => {
    render(<VendorSwap />);
    expect(screen.getByText("DG Token Market")).toBeInTheDocument();
  });

  it("switches to Uniswap tab", () => {
    render(<VendorSwap />);
    fireEvent.click(screen.getByText("Uniswap"));
    // Should show pair selector from UniswapSwapTab
    expect(screen.getByText("ETH / UP")).toBeInTheDocument();
    // DG Market content should be hidden
    expect(screen.queryByText("DG Token Market")).not.toBeInTheDocument();
  });

  it("switches back to DG Market tab", () => {
    render(<VendorSwap />);
    fireEvent.click(screen.getByText("Uniswap"));
    fireEvent.click(screen.getByText("DG Market"));
    expect(screen.getByText("DG Token Market")).toBeInTheDocument();
  });
});
