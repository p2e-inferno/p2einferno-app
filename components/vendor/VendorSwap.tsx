/**
 * VendorSwap Component
 *
 * UI for buying and selling DG tokens through the vendor contract.
 * Requires GoodDollar verification to access.
 */

import { useState } from "react";
import { useDGMarket } from "@/hooks/vendor/useDGMarket";
import { useDGTokenBalances } from "@/hooks/vendor/useDGTokenBalances";
import { useGoodDollarVerification } from "@/hooks/useGoodDollarVerification";
import { useDGVendorAccess } from "@/hooks/vendor/useDGVendorAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  estimateBuy,
  estimateSell,
  formatAmount,
  formatAmountForInput,
  parseAmount,
} from "@/lib/vendor/math";
import { PercentPresets } from "@/components/vendor/PercentPresets";
import UniswapSwapTab from "@/components/vendor/UniswapSwapTab";

type Mode = "buy" | "sell";
type BuyEstimate = ReturnType<typeof estimateBuy>;
type SellEstimate = ReturnType<typeof estimateSell>;

export default function VendorSwap() {
  const verificationQuery = useGoodDollarVerification();
  const isCheckingWhitelist = verificationQuery.isLoading;
  const isWhitelisted = verificationQuery.data?.isWhitelisted ?? false;
  const {
    buyTokens,
    sellTokens,
    isPending,
    isApproving,
    exchangeRate,
    feeConfig,
    minBuyAmount,
    minSellAmount,
    baseTokenAddress,
    swapTokenAddress,
  } = useDGMarket();
  const { base, swap } = useDGTokenBalances(baseTokenAddress, swapTokenAddress);
  const { isKeyHolder, isPaused } = useDGVendorAccess();

  const [activeTab, setActiveTab] = useState<"vendor" | "uniswap">("vendor");
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");

  // Gate access for non-verified users
  if (isCheckingWhitelist) {
    return (
      <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/80 to-slate-900/40 p-6 shadow-2xl shadow-black/40 animate-pulse space-y-4">
        <div className="h-6 w-1/2 rounded bg-slate-700/70" />
        <div className="h-10 rounded bg-slate-700/70" />
        <div className="flex gap-4">
          <div className="h-10 flex-1 rounded bg-slate-700/70" />
          <div className="h-10 flex-1 rounded bg-slate-700/70" />
        </div>
      </div>
    );
  }

  if (!isWhitelisted) {
    return (
      <div className="rounded-2xl border border-red-500/40 bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-6 text-center shadow-2xl shadow-black/40">
        <p className="text-sm font-semibold text-red-400">
          Verified users only
        </p>
        <p className="mt-2 text-xs text-gray-300">
          Complete GoodDollar verification to access the DG Token Market.
        </p>
      </div>
    );
  }

  const baseSymbol = base.symbol ?? "Base";
  const swapSymbol = swap.symbol ?? "DG";

  const inputTokenSymbol = mode === "buy" ? baseSymbol : swapSymbol;
  const outputTokenSymbol = mode === "buy" ? swapSymbol : baseSymbol;
  const inputDecimals =
    mode === "buy"
      ? (base.decimals ?? undefined)
      : (swap.decimals ?? undefined);
  const inputBalance = mode === "buy" ? base.balance : swap.balance;
  const outputDecimals =
    mode === "buy"
      ? (swap.decimals ?? undefined)
      : (base.decimals ?? undefined);

  const parsedAmount =
    inputDecimals !== undefined ? parseAmount(amount, inputDecimals) : null;

  const minAmount = mode === "buy" ? minBuyAmount : minSellAmount;
  const hasConfig =
    exchangeRate !== undefined &&
    feeConfig !== undefined &&
    minBuyAmount !== undefined &&
    minSellAmount !== undefined &&
    inputDecimals !== undefined &&
    outputDecimals !== undefined;

  const isBelowMin =
    hasConfig && parsedAmount !== null && minAmount !== undefined
      ? parsedAmount < minAmount
      : false;

  const isOverBalance =
    parsedAmount !== null && inputBalance !== undefined
      ? parsedAmount > inputBalance
      : false;

  const estimate: BuyEstimate | SellEstimate | null = (() => {
    if (
      !hasConfig ||
      parsedAmount === null ||
      exchangeRate === undefined ||
      !feeConfig
    ) {
      return null;
    }

    if (mode === "buy") {
      return estimateBuy(parsedAmount, feeConfig.buyFeeBps, exchangeRate);
    }
    return estimateSell(parsedAmount, feeConfig.sellFeeBps, exchangeRate);
  })();

  const sellOutBase =
    mode === "sell" && estimate !== null
      ? (estimate as SellEstimate).outBase
      : undefined;
  const isSellOutputZero = mode === "sell" && sellOutBase === 0n;
  const buyOutSwap =
    mode === "buy" && estimate !== null
      ? (estimate as BuyEstimate).outSwap
      : undefined;

  const minText =
    hasConfig && minAmount !== undefined && inputDecimals !== undefined
      ? `Minimum ${mode} amount is ${formatAmount(minAmount, inputDecimals)} ${inputTokenSymbol}.`
      : "";

  const balanceText =
    inputBalance !== undefined && inputDecimals !== undefined
      ? `${formatAmount(inputBalance, inputDecimals)} ${inputTokenSymbol}`
      : "--";

  const feeText =
    estimate && inputDecimals !== undefined
      ? `${formatAmount(estimate.fee, inputDecimals)} ${inputTokenSymbol}`
      : "";

  const formatRatio = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "--";
    return value >= 1
      ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : value.toPrecision(4);
  };

  const buyPerBase =
    exchangeRate !== undefined ? Number(exchangeRate) : undefined;
  const sellPerSwap =
    exchangeRate !== undefined && Number(exchangeRate) !== 0
      ? 1 / Number(exchangeRate)
      : undefined;

  const receiveText =
    outputDecimals !== undefined
      ? mode === "buy"
        ? buyOutSwap !== undefined
          ? `${formatAmount(buyOutSwap, outputDecimals)} ${outputTokenSymbol}`
          : ""
        : sellOutBase !== undefined
          ? `${formatAmount(sellOutBase, outputDecimals)} ${outputTokenSymbol}`
          : ""
      : "";

  const canSubmit =
    !isPending &&
    parsedAmount !== null &&
    hasConfig &&
    !isBelowMin &&
    !isSellOutputZero &&
    !isOverBalance &&
    isKeyHolder &&
    !isPaused;

  const applyPercent = (percent: number) => {
    if (inputBalance === undefined || inputDecimals === undefined) return;
    const numerator = BigInt(percent);
    const selected = (inputBalance * numerator) / 100n;
    setAmount(formatAmountForInput(selected, inputDecimals));
  };

  const handleSubmit = () => {
    if (!canSubmit || parsedAmount === null) return;
    if (mode === "buy") {
      buyTokens(parsedAmount);
      return;
    }
    sellTokens(parsedAmount);
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/90 to-slate-900/60 p-6 shadow-2xl shadow-black/40 space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/5">
        <button
          type="button"
          onClick={() => setActiveTab("vendor")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "vendor"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          DG Market
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("uniswap")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
            activeTab === "uniswap"
              ? "bg-white/10 text-white shadow-sm"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Uniswap
        </button>
      </div>

      {activeTab === "uniswap" ? (
        <UniswapSwapTab />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white tracking-wide">
              DG Token Market
            </h3>
          </div>

          {/* Exchange + fee meta, compact like a DEX */}
          {(exchangeRate !== undefined || feeConfig) && (
            <div className="space-y-1 rounded-xl bg-slate-800/80 px-3 py-2 text-xs text-slate-200">
              {exchangeRate !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Rate</span>
                  <div className="text-right font-mono">
                    <div>
                      1 {baseSymbol} ≈{" "}
                      {buyPerBase !== undefined
                        ? formatRatio(buyPerBase)
                        : "--"}{" "}
                      {swapSymbol}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      1 {swapSymbol} ≈{" "}
                      {sellPerSwap !== undefined
                        ? formatRatio(sellPerSwap)
                        : "--"}{" "}
                      {baseSymbol}
                    </div>
                  </div>
                </div>
              )}
              {feeConfig && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fees</span>
                  <span className="font-mono">
                    {Number(feeConfig.buyFeeBps) / 100}% buy ·{" "}
                    {Number(feeConfig.sellFeeBps) / 100}% sell
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Mode toggle */}
          <div className="inline-flex rounded-full bg-slate-800/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("buy")}
              className={`px-3 py-1 rounded-full ${
                mode === "buy"
                  ? "bg-emerald-500 text-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setMode("sell")}
              className={`px-3 py-1 rounded-full ${
                mode === "sell"
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Amount Input */}
          <div className="space-y-2 rounded-2xl bg-slate-800/70 p-4">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Pay ({inputTokenSymbol})</span>
              <span className="text-slate-400">Balance: {balanceText}</span>
            </div>
            {(isPaused || !isKeyHolder) && (
              <p className="text-xs text-red-400">
                {!isKeyHolder
                  ? "Active DG Nation Membership is required to trade."
                  : "Vendor is paused."}
              </p>
            )}
            <Input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="border-none bg-transparent text-2xl font-medium text-white placeholder:text-slate-500 focus-visible:ring-0"
              disabled={isPending}
            />
            <PercentPresets
              onSelect={applyPercent}
              disabled={
                isPending ||
                inputBalance === undefined ||
                inputDecimals === undefined
              }
            />
            {parsedAmount === null && amount.trim().length > 0 && (
              <p className="text-xs text-red-400">Enter a valid amount.</p>
            )}
            {isBelowMin && minText && (
              <p className="text-xs text-red-400">{minText}</p>
            )}
            {isOverBalance && (
              <p className="text-xs text-red-400">Insufficient balance.</p>
            )}
            {isSellOutputZero && (
              <p className="text-xs text-red-400">
                Sell amount too small after fees at current rate.
              </p>
            )}
          </div>

          {/* Quote */}
          {(feeText || receiveText) && (
            <div className="space-y-1 rounded-xl bg-slate-800/80 px-3 py-2 text-xs text-slate-200">
              {feeText && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Fee</span>
                  <span className="font-mono">{feeText}</span>
                </div>
              )}
              {receiveText && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Receive</span>
                  <span className="font-mono">{receiveText}</span>
                </div>
              )}
            </div>
          )}

          {/* Primary action */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full rounded-xl font-semibold ${
              mode === "buy"
                ? "bg-emerald-500 hover:bg-emerald-600 text-black"
                : "bg-slate-700 hover:bg-slate-600 text-slate-50"
            }`}
          >
            {isApproving
              ? "Approving..."
              : isPending
                ? "Processing..."
                : mode === "buy"
                  ? `Buy ${swapSymbol}`
                  : `Sell ${swapSymbol}`}
          </Button>
        </>
      )}
    </div>
  );
}
