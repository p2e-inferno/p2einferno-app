import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FlameIcon, LightningIcon, SwordIcon } from "../icons/dashboard-icons";

/**
 * Quick actions grid component providing navigation to key sections
 * Includes Join Bootcamp, Events, and Quests actions
 */
export const QuickActionsGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      {/* Apply to Bootcamp */}
      <Link href="/apply" className="group">
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
    </div>
  );
};
