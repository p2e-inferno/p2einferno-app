import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  FlameIcon,
  LightningIcon,
  SwordIcon,
  ProfileIcon,
} from "../icons/dashboard-icons";
import { useDailyCheckin } from "@/hooks/checkin";
import { ArrowRight as ArrowIcon } from "lucide-react";

interface QuickActionsGridProps {
  userAddress?: string;
  userProfileId?: string;
}

/**
 * Quick actions grid component providing navigation to key sections
 * Includes Join Bootcamp, Events, and Quests actions
 */
export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  userAddress,
  userProfileId,
}) => {
  const {
    performCheckin,
    canCheckinToday,
    hasCheckedInToday,
    isPerformingCheckin,
  } = useDailyCheckin(userAddress || "", userProfileId || "", {
    showToasts: true,
    autoRefreshStatus: true,
    statusRefreshInterval: 5000, // Refresh every 5 seconds for real-time reactivity
  });

  const checkinCtaText = hasCheckedInToday
    ? "Checked in today"
    : canCheckinToday
      ? "Check in"
      : "Come back tomorrow";

  const onCheckinClick = async () => {
    if (!canCheckinToday || isPerformingCheckin) return;
    await performCheckin();
  };
  const isDisabled = hasCheckedInToday;
  const cardBase = isDisabled
    ? "from-slate-900/40 to-slate-950/40 border-slate-600/30 text-slate-400"
    : "from-green-800/30 to-green-900/30 border-green-500/20 hover:border-green-400/40";
  const titleColor = isDisabled ? "text-slate-300" : "";
  const subtitleColor = isDisabled ? "text-slate-500" : "text-faded-grey";
  const ctaColor = isDisabled
    ? "text-slate-400"
    : canCheckinToday
      ? "text-green-400"
      : "text-faded-grey";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Daily Check-in */}
      <div className={`group ${isDisabled ? "pointer-events-none" : ""}`}>
        <div
          className={`bg-gradient-to-br rounded-xl p-6 border backdrop-blur-sm transition-all duration-300 ${cardBase} ${
            isDisabled ? "opacity-60" : "group-hover:scale-105"
          }`}
        >
          <div className="flex items-center space-x-4 mb-4">
            <FlameIcon
              size={40}
              className={
                isDisabled
                  ? "text-slate-400"
                  : "text-green-400 group-hover:animate-pulse"
              }
            />
            <div>
              <h3 className={`font-bold text-lg ${titleColor}`}>
                Daily Check-in
              </h3>
              <p className={`text-sm ${subtitleColor}`}>
                Keep your streak and earn XP
              </p>
            </div>
          </div>
          <button
            onClick={onCheckinClick}
            disabled={isDisabled || !canCheckinToday || isPerformingCheckin}
            className={`w-full flex items-center justify-between ${
              isDisabled || !canCheckinToday
                ? "cursor-not-allowed"
                : "cursor-pointer"
            }`}
          >
            <span className={`${ctaColor} font-medium`}>{checkinCtaText}</span>
            <ArrowIcon
              size={20}
              className={`${ctaColor} ${isDisabled ? "" : "group-hover:translate-x-1"} transition-transform`}
            />
          </button>
        </div>
      </div>
      {/* Apply to Bootcamp */}
      <Link href="/lobby/apply" className="group">
        <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/30 rounded-xl p-6 border border-purple-500/20 backdrop-blur-sm hover:border-purple-400/40 transition-all duration-300 group-hover:scale-105">
          <div className="flex items-center space-x-4 mb-4">
            <FlameIcon
              size={40}
              className="text-flame-yellow group-hover:animate-pulse"
            />
            <div>
              <h3 className="font-bold text-lg">Join Bootcamp</h3>
              <p className="text-sm text-faded-grey">
                Start your infernal journey
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-flame-yellow font-medium">Apply Now</span>
            <ArrowRight
              size={20}
              className="text-flame-yellow group-hover:translate-x-1 transition-transform"
            />
          </div>
        </div>
      </Link>

      {/* Events */}
      <Link href="/lobby/events" className="group">
        <div className="bg-gradient-to-br from-cyan-800/30 to-cyan-900/30 rounded-xl p-6 border border-cyan-500/20 backdrop-blur-sm hover:border-cyan-400/40 transition-all duration-300 group-hover:scale-105">
          <div className="flex items-center space-x-4 mb-4">
            <LightningIcon
              size={40}
              className="text-cyan-400 group-hover:animate-pulse"
            />
            <div>
              <h3 className="font-bold text-lg">Events</h3>
              <p className="text-sm text-faded-grey">Join live events</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 font-medium">Explore</span>
            <ArrowRight
              size={20}
              className="text-cyan-400 group-hover:translate-x-1 transition-transform"
            />
          </div>
        </div>
      </Link>

      {/* Quests */}
      <Link href="/lobby/quests" className="group">
        <div className="bg-gradient-to-br from-magenta-800/30 to-magenta-900/30 rounded-xl p-6 border border-magenta-500/20 backdrop-blur-sm hover:border-magenta-400/40 transition-all duration-300 group-hover:scale-105">
          <div className="flex items-center space-x-4 mb-4">
            <SwordIcon
              size={40}
              className="text-magenta-400 group-hover:animate-pulse"
            />
            <div>
              <h3 className="font-bold text-lg">Quests</h3>
              <p className="text-sm text-faded-grey">Complete challenges</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-magenta-400 font-medium">Begin</span>
            <ArrowRight
              size={20}
              className="text-magenta-400 group-hover:translate-x-1 transition-transform"
            />
          </div>
        </div>
      </Link>

      {/* Profile */}
      <Link href="/lobby/profile" className="group">
        <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/30 rounded-xl p-6 border border-purple-500/20 backdrop-blur-sm hover:border-purple-400/40 transition-all duration-300 group-hover:scale-105">
          <div className="flex items-center space-x-4 mb-4">
            <ProfileIcon
              size={40}
              className="text-purple-400 group-hover:animate-pulse"
            />
            <div>
              <h3 className="font-bold text-lg">Profile</h3>
              <p className="text-sm text-faded-grey">Manage identity</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-purple-400 font-medium">View</span>
            <ArrowRight
              size={20}
              className="text-purple-400 group-hover:translate-x-1 transition-transform"
            />
          </div>
        </div>
      </Link>
    </div>
  );
};
