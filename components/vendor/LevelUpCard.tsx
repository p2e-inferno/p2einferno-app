/**
 * LevelUpCard Component
 *
 * Displays user stage progress and provides upgrade functionality.
 */

import Link from "next/link";
import { useDGProfile } from "@/hooks/vendor/useDGProfile";
import { Button } from "@/components/ui/button";
import {
  ArrowUpCircle,
  Zap,
  Star,
  ArrowRightLeft,
  KeyRound,
} from "lucide-react";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

export default function LevelUpCard() {
  const {
    userState,
    stageLabel,
    upgradeStage,
    isPending,
    canUpgrade,
    upgradeBlockedReason,
    hasKeyOnOtherWalletOnly,
    keyHoldingWalletAddress,
    pointsProgress,
    fuelProgress,
    upgradeProgress,
    pointsRequired,
    fuelRequired,
  } = useDGProfile();

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-900/60 p-6 shadow-2xl shadow-black/40">
      <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <ArrowUpCircle className="h-5 w-5 text-purple-400" />
        Stage Progress
      </h4>

      {/* Current Stage */}
      <div className="mb-5 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Current Stage
        </p>
        <p className="mt-1 text-3xl font-bold text-purple-300">{stageLabel}</p>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-left">
        <div className="rounded-xl bg-slate-800/80 p-3">
          <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            <Star className="h-3 w-3" />
            Points
          </div>
          <p className="font-mono text-lg font-semibold text-white">
            {userState?.points?.toString() ?? "0"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-800/80 p-3">
          <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400">
            <Zap className="h-3 w-3" />
            Fuel
          </div>
          <p className="font-mono text-lg font-semibold text-white">
            {userState?.fuel?.toString() ?? "0"}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
            style={{
              width: `${Math.min(Math.floor(upgradeProgress * 100), 100)}%`,
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Points: {userState?.points?.toString() ?? "0"}/
            {pointsRequired ? pointsRequired.toString() : "-"}
          </span>
          <span>
            Fuel: {userState?.fuel?.toString() ?? "0"}/
            {fuelRequired ? fuelRequired.toString() : "-"}
          </span>
        </div>
        <p className="mt-1 text-center text-[11px] text-slate-400">
          Progress to next stage
        </p>
      </div>

      {/* Upgrade Button */}
      <Button
        onClick={() => upgradeStage()}
        disabled={isPending || !canUpgrade}
        className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 font-semibold text-white hover:from-purple-600 hover:to-pink-600"
      >
        {isPending ? "Upgrading..." : "Upgrade Stage"}
      </Button>

      {/* Membership on another wallet — actionable guidance */}
      {hasKeyOnOtherWalletOnly && (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-center text-xs text-amber-300/90">
            Membership detected on{" "}
            <span className="font-mono font-medium text-amber-200">
              {formatWalletAddress(keyHoldingWalletAddress)}
            </span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
              onClick={() => {
                /* wallet switch is handled externally by the user */
              }}
            >
              <ArrowRightLeft className="h-3 w-3 text-amber-400" />
              Switch wallet
            </button>
            <Link
              href="/lobby/profile"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
            >
              <KeyRound className="h-3 w-3 text-purple-400" />
              Get key for this wallet
            </Link>
          </div>
        </div>
      )}

      {/* Other blocked reasons (not the wallet-switch case) */}
      {upgradeBlockedReason && !hasKeyOnOtherWalletOnly && (
        <p className="mt-2 text-center text-xs text-red-400">
          {upgradeBlockedReason}
        </p>
      )}

      {!upgradeBlockedReason && userState && (
        <p className="mt-2 text-center text-xs text-slate-400">
          {Math.round(pointsProgress * 100)}% points ·{" "}
          {Math.round(fuelProgress * 100)}% fuel
        </p>
      )}
    </div>
  );
}
