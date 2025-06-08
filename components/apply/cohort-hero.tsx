import React from "react";
import {
  Calendar,
  Clock,
  Trophy,
  DollarSign,
  Users,
  ChevronRight,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/bootcamp-data";
import type { CohortHeroProps } from "./types";

/**
 * CohortHero Component
 *
 * Hero section for cohort detail pages featuring:
 * - Cohort name and description
 * - Key statistics and metrics
 * - Registration status and urgency indicators
 * - Primary CTA to begin application
 *
 * @param program - Bootcamp program data
 * @param cohort - Current cohort information
 * @param timeRemaining - Time remaining for registration
 * @param spotsRemaining - Number of available spots
 * @param onBeginApplication - Handler for application start
 */
export const CohortHero: React.FC<CohortHeroProps> = ({
  program,
  cohort,
  timeRemaining,
  spotsRemaining,
  onBeginApplication,
}) => {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background:
          'linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url("/api/placeholder/1920/1080")',
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Background Shapes */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-64 h-64 bg-steel-red/20 rounded-full filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-flame-yellow/20 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 container mx-auto text-center px-4 text-white">
        {/* Status Badge */}
        <div className="inline-flex items-center gap-2 bg-flame-yellow/20 backdrop-blur-sm border border-flame-yellow/30 rounded-full px-4 py-2 mb-6">
          <div className="w-2 h-2 bg-flame-yellow rounded-full animate-pulse"></div>
          <span className="text-flame-yellow font-medium text-sm">
            Registration Open
          </span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-heading mb-6 tracking-tighter">
          {program.name}
        </h1>

        <div className="inline-flex items-center gap-2 bg-steel-red/20 backdrop-blur-sm border border-steel-red/30 rounded-full px-4 py-2 mb-8">
          <Flame className="w-4 h-4 text-steel-red" />
          <span className="text-steel-red font-medium text-sm">
            {cohort.name}
          </span>
        </div>

        <p className="max-w-3xl mx-auto text-lg md:text-xl mb-12 leading-relaxed">
          {program.description}
        </p>

        {/* Key Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto mb-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <Calendar className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-2xl font-bold">
              {new Date(cohort.start_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="text-sm text-faded-grey">Start Date</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <Clock className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-2xl font-bold">{program.duration_weeks}</div>
            <div className="text-sm text-faded-grey">Weeks</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-2xl font-bold">
              {program.max_reward_dgt.toLocaleString()}
            </div>
            <div className="text-sm text-faded-grey">Max DG Rewards</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <DollarSign className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-2xl font-bold">
              {formatCurrency(program.cost_usd, "USD")}
            </div>
            <div className="text-sm text-faded-grey">
              or {formatCurrency(program.cost_naira, "NGN")}
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <Users className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-2xl font-bold">{spotsRemaining}</div>
            <div className="text-sm text-faded-grey">Spots Left</div>
          </div>
        </div>

        {/* Urgency Indicator */}
        <div className="inline-flex items-center gap-2 bg-steel-red/20 backdrop-blur-sm border border-steel-red/30 rounded-full px-4 py-2 mb-8">
          <Calendar className="w-4 h-4 text-steel-red" />
          <span className="text-steel-red font-medium text-sm">
            Registration closes:{" "}
            {new Date(cohort.registration_deadline).toLocaleDateString(
              "en-US",
              {
                month: "short",
                day: "numeric",
                year: "numeric",
              }
            )}{" "}
            ({timeRemaining})
          </span>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onBeginApplication}
          className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
        >
          Begin Application
          <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
        </Button>

        <p className="mt-4 text-sm text-faded-grey">
          Secure your spot with a registration fee. Full payment due after
          acceptance.
        </p>
      </div>
    </section>
  );
};
