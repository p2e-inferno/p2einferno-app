"use client";

/**
 * UniswapSwapTab — Swap tab content rendered inside VendorSwap's tabbed layout.
 *
 * Stepper integration follows the same pattern as admin forms (BootcampForm, CohortForm):
 *   - stepperWaitForSteps(count, afterVersion) before stepperStart()
 *   - decisionResolverRef for retry/cancel in the modal
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useUniswapSwap } from "@/hooks/vendor/useUniswapSwap";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";
import type { SwapPair, SwapDirection } from "@/lib/uniswap/types";
import { DEFAULT_SLIPPAGE_BPS } from "@/lib/uniswap/constants";
import { PercentPresets } from "@/components/vendor/PercentPresets";
import toast from "react-hot-toast";

const PAIR_OPTIONS: { value: SwapPair; label: string }[] = [
  { value: "ETH_UP", label: "ETH / UP" },
  { value: "ETH_USDC", label: "ETH / USDC" },
  { value: "UP_USDC", label: "UP / USDC" },
];

function getDirectionLabels(pair: SwapPair): { aToB: string; bToA: string } {
  switch (pair) {
    case "ETH_UP":
      return { aToB: "Buy UP", bToA: "Sell UP" };
    case "ETH_USDC":
      return { aToB: "Buy USDC", bToA: "Sell USDC" };
    case "UP_USDC":
      return { aToB: "UP \u2192 USDC", bToA: "USDC \u2192 UP" };
  }
}

function getInputSymbol(pair: SwapPair, direction: SwapDirection): string {
  if (pair === "UP_USDC") return direction === "A_TO_B" ? "UP" : "USDC";
  return direction === "A_TO_B" ? "ETH" : pair === "ETH_UP" ? "UP" : "USDC";
}

function getOutputSymbol(pair: SwapPair, direction: SwapDirection): string {
  if (pair === "UP_USDC") return direction === "A_TO_B" ? "USDC" : "UP";
  return direction === "A_TO_B" ? (pair === "ETH_UP" ? "UP" : "USDC") : "ETH";
}

function getInputDecimals(pair: SwapPair, direction: SwapDirection): number {
  const symbol = getInputSymbol(pair, direction);
  return symbol === "USDC" ? 6 : 18;
}

function getOutputDecimals(pair: SwapPair, direction: SwapDirection): number {
  const symbol = getOutputSymbol(pair, direction);
  return symbol === "USDC" ? 6 : 18;
}

function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 18) return formatEther(amount);
  return formatUnits(amount, decimals);
}

function parseTokenAmount(value: string, decimals: number): bigint | null {
  try {
    if (!value || value.trim() === "") return null;
    if (decimals === 18) return parseEther(value);
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

export default function UniswapSwapTab() {
  const [pair, setPair] = useState<SwapPair>("ETH_UP");
  const [direction, setDirection] = useState<SwapDirection>("A_TO_B");
  const [amount, setAmount] = useState("");
  const {
    quote,
    isQuoting,
    error,
    balance,
    buildSwapSteps,
    getQuote,
    fetchBalance,
    feeBips,
  } = useUniswapSwap();

  // --- Stepper state ---
  const [swapSteps, setSwapSteps] = useState<DeploymentStep[]>([]);
  const [isStepperOpen, setIsStepperOpen] = useState(false);

  const stepsForStepper = useMemo(() => swapSteps, [swapSteps]);

  const {
    state: stepperState,
    start: stepperStart,
    retryStep: stepperRetry,
    waitForSteps: stepperWaitForSteps,
    cancel: stepperCancel,
    stepsVersion: stepperVersion,
  } = useTransactionStepper(stepsForStepper);

  // Decision ref: bridges async handleSwap <-> modal button clicks
  const decisionResolverRef = useRef<
    ((decision: "retry" | "cancel") => void) | null
  >(null);

  const handleStepperRetry = useCallback(() => {
    if (decisionResolverRef.current) {
      decisionResolverRef.current("retry");
      decisionResolverRef.current = null;
    }
  }, []);

  const handleStepperCancel = useCallback(() => {
    if (decisionResolverRef.current) {
      decisionResolverRef.current("cancel");
      decisionResolverRef.current = null;
      return;
    }
    stepperCancel();
    setIsStepperOpen(false);
  }, [stepperCancel]);

  const handleStepperClose = useCallback(() => {
    if (!stepperState.canClose) return;
    if (decisionResolverRef.current) {
      decisionResolverRef.current("cancel");
      decisionResolverRef.current = null;
      return;
    }
    setIsStepperOpen(false);
  }, [stepperState.canClose]);

  const applyPercent = useCallback(
    (percent: number) => {
      if (balance === null) return;
      const selected = (balance * BigInt(percent)) / 100n;
      setAmount(formatTokenAmount(selected, getInputDecimals(pair, direction)));
    },
    [balance, pair, direction],
  );

  // --- Derived state ---
  const inputDecimals = getInputDecimals(pair, direction);
  const outputDecimals = getOutputDecimals(pair, direction);
  const parsedAmount = parseTokenAmount(amount, inputDecimals);

  const isOverBalance =
    parsedAmount !== null && balance !== null ? parsedAmount > balance : false;

  const highImpact = quote !== null && quote.priceImpact > 1;
  const blockedImpact =
    quote !== null && pair !== "UP_USDC" && quote.priceImpact > 5;

  // --- Debounced quote fetching (500ms) + auto-refresh (15s) ---
  useEffect(() => {
    if (!parsedAmount || parsedAmount <= 0n) return;
    const timeout = setTimeout(() => {
      getQuote(pair, direction, parsedAmount);
    }, 500);
    return () => clearTimeout(timeout);
  }, [amount, pair, direction, getQuote, parsedAmount]);

  useEffect(() => {
    if (!parsedAmount || parsedAmount <= 0n) return;
    const interval = setInterval(() => {
      getQuote(pair, direction, parsedAmount);
    }, 15_000);
    return () => clearInterval(interval);
  }, [amount, pair, direction, getQuote, parsedAmount]);

  // Fetch balance on pair/direction change
  useEffect(() => {
    fetchBalance(pair, direction);
  }, [pair, direction, fetchBalance]);

  // --- Swap button state ---
  const getButtonState = (): { label: string; disabled: boolean } => {
    if (!parsedAmount || parsedAmount <= 0n)
      return { label: "Enter amount", disabled: true };
    if (isQuoting) return { label: "Fetching quote...", disabled: true };
    if (isOverBalance) return { label: "Insufficient balance", disabled: true };
    if (blockedImpact)
      return { label: "Price impact too high", disabled: true };
    if (error) return { label: "Swap", disabled: true };
    return { label: "Swap", disabled: false };
  };

  const buttonState = getButtonState();

  // --- Main swap handler ---
  const handleSwap = async () => {
    if (!parsedAmount || !quote) return;

    try {
      // Calculate amountOutMin (pre-fee) with slippage
      const amountOutMin =
        (quote.amountOut * BigInt(10_000 - DEFAULT_SLIPPAGE_BPS)) / 10_000n;

      // 1. Build steps
      const steps = await buildSwapSteps(
        pair,
        direction,
        parsedAmount,
        amountOutMin,
      );

      // 2. Snapshot stepper version before setting new steps
      const versionBefore = stepperVersion.current;
      setSwapSteps(steps);
      setIsStepperOpen(true);

      // 3. Wait for stepper to install these exact steps
      await stepperWaitForSteps(steps.length, versionBefore);

      // 4. Run all steps sequentially
      try {
        await stepperStart();
      } catch {
        // A step failed — suspend until user clicks Retry or Cancel
        while (true) {
          const decision = await new Promise<"retry" | "cancel">((resolve) => {
            decisionResolverRef.current = resolve;
          });
          decisionResolverRef.current = null;

          if (decision === "cancel") {
            stepperCancel();
            setIsStepperOpen(false);
            return;
          }

          // decision === 'retry'
          try {
            await stepperRetry();
            break;
          } catch {
            continue;
          }
        }
      }

      // 5. All steps succeeded — keep modal open so user sees the green ✓ states.
      //    The modal's "Done" button (onClose) will dismiss it.
      fetchBalance(pair, direction);
      toast.success("Swap complete!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Swap failed");
    }
  };

  const directionLabels = getDirectionLabels(pair);
  const inputSymbol = getInputSymbol(pair, direction);
  const outputSymbol = getOutputSymbol(pair, direction);

  return (
    <div className="space-y-4">
      {/* Pair selector pills */}
      <div className="flex gap-1 rounded-lg bg-slate-800/80 p-1">
        {PAIR_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setPair(opt.value);
              setDirection("A_TO_B");
              setAmount("");
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              pair === opt.value
                ? "bg-white/10 text-white shadow-sm"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Direction toggle */}
      <div className="inline-flex rounded-full bg-slate-800/80 p-1 text-xs">
        <button
          type="button"
          onClick={() => {
            setDirection("A_TO_B");
            setAmount("");
          }}
          className={`px-3 py-1 rounded-full ${
            direction === "A_TO_B"
              ? "bg-emerald-500 text-black"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {directionLabels.aToB}
        </button>
        <button
          type="button"
          onClick={() => {
            setDirection("B_TO_A");
            setAmount("");
          }}
          className={`px-3 py-1 rounded-full ${
            direction === "B_TO_A"
              ? "bg-slate-700 text-white"
              : "text-slate-300 hover:text-white"
          }`}
        >
          {directionLabels.bToA}
        </button>
      </div>

      {/* Amount Input */}
      <div className="space-y-2 rounded-2xl bg-slate-800/70 p-4">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Pay ({inputSymbol})</span>
          <span className="text-slate-400">
            Balance:{" "}
            {balance !== null
              ? formatTokenAmount(balance, inputDecimals)
              : "--"}{" "}
            {inputSymbol}
          </span>
        </div>
        <Input
          type="text"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          className="border-none bg-transparent text-2xl font-medium text-white placeholder:text-slate-500 focus-visible:ring-0"
        />
        <PercentPresets onSelect={applyPercent} disabled={balance === null} />
        {isOverBalance && (
          <p className="text-xs text-red-400">Insufficient balance.</p>
        )}
        {parsedAmount === null && amount.trim().length > 0 && (
          <p className="text-xs text-red-400">Enter a valid amount.</p>
        )}
      </div>

      {/* Quote display */}
      {quote && parsedAmount !== null && parsedAmount > 0n && (
        <div className="space-y-1 rounded-xl bg-slate-800/80 px-3 py-2 text-xs text-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">You will receive</span>
            <span className="font-mono">
              {formatTokenAmount(quote.userReceives, outputDecimals)}{" "}
              {outputSymbol}
            </span>
          </div>
          {highImpact && (
            <div className="flex items-center justify-between text-amber-400">
              <span>Price impact</span>
              <span className="font-mono">{quote.priceImpact.toFixed(2)}%</span>
            </div>
          )}
          {blockedImpact && (
            <p className="text-red-400">
              Price impact too high ({quote.priceImpact.toFixed(1)}%). Consider
              a smaller amount.
            </p>
          )}
        </div>
      )}

      {/* Error display */}
      {error && !isQuoting && <p className="text-xs text-red-400">{error}</p>}

      {/* Swap button */}
      <Button
        onClick={handleSwap}
        disabled={buttonState.disabled}
        className="w-full rounded-xl bg-emerald-500 font-semibold text-black hover:bg-emerald-600"
      >
        {buttonState.label}
      </Button>

      {/* Fee disclosure */}
      <p className="text-center text-[10px] text-slate-500">
        {feeBips / 100}% swap fee applied
      </p>

      <TransactionStepperModal
        open={isStepperOpen}
        title="Swap in Progress"
        description="Sign each transaction as prompted by your wallet"
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={handleStepperRetry}
        onSkip={() => {}}
        onCancel={handleStepperCancel}
        onClose={handleStepperClose}
      />
    </div>
  );
}
