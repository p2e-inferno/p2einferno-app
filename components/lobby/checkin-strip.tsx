"use client";

import { motion } from "framer-motion";
import {
  Flame,
  Sprout,
  Zap,
  CheckCircle2,
  Loader2,
  CalendarDays,
  Power,
} from "lucide-react";
import { useDailyCheckin, useStreakData } from "@/hooks/checkin";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface LobbyCheckinStripProps {
  userAddress: string;
  userProfileId: string;
  className?: string;
}

type DailyCheckinProps = {
  xpToday?: number;
  streakDays?: number;
  multiplier?: number;
  checkedToday?: boolean;
  canCheckin?: boolean;
  loading?: boolean;
  capForProgress?: number;
  onCheckIn?: () => Promise<void> | void;
  storageKey?: string;
};

// Next reset moment based on UTC midnight, aligning with DB (CURRENT_DATE in UTC)
function getNextUtcMidnight(): number {
  const now = new Date();
  const nextUtcMidnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return nextUtcMidnight.getTime();
}

function formatHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function DailyCheckinStripUI({
  xpToday = 10,
  streakDays = 0,
  multiplier = 1.0,
  checkedToday = false,
  canCheckin = true,
  loading = false,
  capForProgress = 30,
  onCheckIn,
  storageKey = "p2e-inferno-daily-strip-hidden-until",
}: DailyCheckinProps) {
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const until = Number(raw);
        if (Number.isFinite(until) && until > Date.now()) {
          setHidden(true);
        }
      }
    } catch {}
  }, [storageKey]);

  // Update countdown timer every second when showing "Next in" message
  const showCountdown = checkedToday || !canCheckin;
  useEffect(() => {
    if (!showCountdown) return;
    intervalRef.current = window.setInterval(
      () => setNow(Date.now()),
      1000,
    ) as unknown as number;
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [showCountdown]);

  const pct = useMemo(() => {
    const cap = Math.max(1, capForProgress);
    const p = Math.min(streakDays, cap) / cap;
    return Math.round(p * 100);
  }, [streakDays, capForProgress]);

  const msUntilMidnight = getNextUtcMidnight() - now;
  const countdown = formatHMS(msUntilMidnight);

  async function handleClick() {
    if (checkedToday || !canCheckin || loading || busy) {
      return;
    }

    try {
      setBusy(true);
      await onCheckIn?.();
    } finally {
      setBusy(false);
    }
  }

  function hideForToday() {
    try {
      const until = getNextUtcMidnight();
      localStorage.setItem(storageKey, String(until));
      setHidden(true);
    } catch {
      setHidden(true);
    }
  }

  if (hidden) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="w-full mb-4"
    >
      <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#17142A]/80 via-[#141226]/80 to-[#0E0C1A]/80 p-4 sm:p-5 shadow-2xl backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium tracking-tight text-white">
              Daily Check‑in
            </div>
            <div className="text-xs text-white/60">
              Keep your streak alive and earn XP
            </div>
          </div>

          <button
            onClick={hideForToday}
            aria-label="Hide for today"
            className="group grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <Power className="h-5 w-5 text-white/70 transition group-hover:text-white" />
          </button>
        </div>

        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
          {checkedToday ? (
            <div className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-white ring-1 ring-white/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <span className="font-medium">Checked in</span>
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                Next in {countdown}
              </span>
            </div>
          ) : !canCheckin ? (
            <div className="inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-white/60 ring-1 ring-white/10">
              <CalendarDays className="h-5 w-5 text-white/40" />
              <span className="font-medium">Come back later</span>
              <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                Next in {countdown}
              </span>
            </div>
          ) : (
            <button
              onClick={handleClick}
              disabled={loading || busy}
              className={
                "group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-white ring-1 ring-indigo-400/40 transition focus:outline-none focus-visible:ring-2 hover:ring-indigo-300/60"
              }
            >
              <span className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-indigo-500/10 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              {busy || loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarDays className="h-5 w-5 text-indigo-300" />
              )}
              <span>Check in</span>
              <span className="ml-1 hidden rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80 sm:inline">
                +{xpToday} XP
              </span>
            </button>
          )}

          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              icon={<Flame className="h-4 w-4" />}
              label="Streak"
              value={`${streakDays} day${streakDays === 1 ? "" : "s"}`}
            />
            <StatTile
              icon={<Sprout className="h-4 w-4" />}
              label="Multiplier"
              value={`${multiplier.toFixed(1)}×`}
            />
            <StatTile
              icon={<Zap className="h-4 w-4" />}
              label={checkedToday ? "Today" : "Reward"}
              value={checkedToday ? "Done" : `+${xpToday} XP`}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-white/60">
            <span>Progress to 30-day reward</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-fuchsia-400 to-emerald-400"
            />
          </div>
          <p className="mt-2 text-xs text-white/50">
            Keep the streak alive to boost your XP rewards.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-white/80">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wide text-white/50">
          {label}
        </div>
        <div className="text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

export const LobbyCheckinStrip: React.FC<LobbyCheckinStripProps> = ({
  userAddress,
  userProfileId,
  className,
}) => {
  const {
    performCheckin,
    isPerformingCheckin,
    isLoading,
    hasCheckedInToday,
    canCheckinToday,
    previewXP,
    refreshStatus,
  } = useDailyCheckin(userAddress, userProfileId, {
    autoRefreshStatus: true,
    // Uses default 12-hour interval (daily check-in feature)
    showToasts: true,
  });

  const { streakInfo, multiplier } = useStreakData(userAddress, {
    autoRefresh: true,
    // Uses default 12-hour interval (daily check-in feature)
  });
  const storageKey = useMemo(
    () =>
      `p2e-inferno-daily-strip-hidden-until:${(userAddress || "").toLowerCase()}`,
    [userAddress],
  );

  return (
    <div className={className}>
      <DailyCheckinStripUI
        xpToday={previewXP || 0}
        streakDays={streakInfo?.currentStreak || 0}
        multiplier={multiplier || 1}
        checkedToday={!!hasCheckedInToday}
        canCheckin={canCheckinToday}
        loading={isLoading || isPerformingCheckin}
        onCheckIn={async () => {
          await performCheckin();
          await refreshStatus();
        }}
        storageKey={storageKey}
      />
    </div>
  );
};
