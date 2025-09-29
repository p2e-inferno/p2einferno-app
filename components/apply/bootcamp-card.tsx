import React from "react";
import Link from "next/link";
import {
  Calendar,
  Users,
  Clock,
  ArrowRight,
  BookOpen,
  Zap,
} from "lucide-react";
import { FlameIcon, TrophyIcon, CrystalIcon } from "../icons/dashboard-icons";
import { formatCurrency } from "@/lib/utils/payment-utils";
import type { BootcampCardProps } from "./types";

/**
 * BootcampCard Component
 *
 * Displays comprehensive bootcamp information including:
 * - Program details and pricing
 * - Registration status and deadlines
 * - Statistics (duration, rewards, spots)
 * - Learning outcomes
 * - Application CTA
 *
 * @param program - Bootcamp program data
 * @param cohort - Current cohort information
 * @param isRegistrationOpen - Whether registration is currently open
 * @param timeRemaining - Time remaining for registration
 * @param spotsRemaining - Number of available spots
 */
export const BootcampCard: React.FC<BootcampCardProps> = ({
  program,
  cohort,
  isRegistrationOpen,
  timeRemaining,
  spotsRemaining,
}) => {
  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border border-purple-500/20 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-flame-yellow/20 rounded-xl">
              <FlameIcon size={32} className="text-flame-yellow" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{program.name}</h3>
              <p className="text-faded-grey">Entry Level Bootcamp</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-flame-yellow">
              {formatCurrency(program.cost_usd, "USD")}
            </div>
            <div className="text-sm text-faded-grey">
              or {formatCurrency(program.cost_naira, "NGN")}
            </div>
          </div>
        </div>

        {/* Status Banner */}
        {isRegistrationOpen ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
            <p className="text-green-400 text-sm font-medium">
              🟢 Registration Open - {timeRemaining}
            </p>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-red-400 text-sm font-medium">
              🔴 Registration Closed
            </p>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        <p className="text-faded-grey mb-6 text-lg">{program.description}</p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <Calendar size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">{program.duration_weeks} Weeks</div>
            <div className="text-xs text-faded-grey">Duration</div>
          </div>
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <CrystalIcon size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">
              {program.max_reward_dgt.toLocaleString()} DGT
            </div>
            <div className="text-xs text-faded-grey">Max Rewards</div>
          </div>
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <Users size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">{spotsRemaining}</div>
            <div className="text-xs text-faded-grey">Spots Left</div>
          </div>
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <Clock size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">8hrs/week</div>
            <div className="text-xs text-faded-grey">Time Commit</div>
          </div>
        </div>

        {/* Key Features */}
        <div className="mb-8">
          <h4 className="text-xl font-bold mb-4">What You&apos;ll Learn</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <Zap size={20} className="text-flame-yellow mt-1 flex-shrink-0" />
              <div>
                <div className="font-medium">Web3 Foundations</div>
                <div className="text-sm text-faded-grey">
                  Wallets, accounts, and basic blockchain concepts
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <BookOpen
                size={20}
                className="text-flame-yellow mt-1 flex-shrink-0"
              />
              <div>
                <div className="font-medium">DeFi Interactions</div>
                <div className="text-sm text-faded-grey">
                  Token swaps and decentralized protocols
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <TrophyIcon
                size={20}
                className="text-flame-yellow mt-1 flex-shrink-0"
              />
              <div>
                <div className="font-medium">NFTs & Community</div>
                <div className="text-sm text-faded-grey">
                  Token-gating and Web3 social platforms
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <CrystalIcon
                size={20}
                className="text-flame-yellow mt-1 flex-shrink-0"
              />
              <div>
                <div className="font-medium">Earn While Learning</div>
                <div className="text-sm text-faded-grey">
                  Up to 24,000 DGT tokens in rewards
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          {isRegistrationOpen ? (
            <Link
              href={`/apply/${cohort.id}`}
              className="inline-flex items-center space-x-3 bg-flame-yellow text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-flame-orange transition-all duration-300 hover:scale-105"
            >
              <span>Apply Now</span>
              <ArrowRight size={20} />
            </Link>
          ) : (
            <div className="inline-flex items-center space-x-3 bg-gray-600 text-gray-300 px-8 py-4 rounded-xl font-bold text-lg cursor-not-allowed">
              <span>Registration Closed</span>
            </div>
          )}
          <p className="text-sm text-faded-grey mt-4">
            Next cohort starts {cohort.start_date}
          </p>
        </div>
      </div>
    </div>
  );
};
