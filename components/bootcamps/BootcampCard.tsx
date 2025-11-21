import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getCohortRegistrationStatus } from "@/lib/utils/registration-validation";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";
import {
  Clock,
  Users,
  Trophy,
  Calendar,
  Flame,
  ChevronRight,
  Sparkles,
} from "lucide-react";

interface BootcampWithCohorts extends BootcampProgram {
  cohorts: Cohort[];
}

interface BootcampCardProps {
  bootcamp: BootcampWithCohorts;
}

export function BootcampCard({ bootcamp }: BootcampCardProps) {
  // Prefer a cohort with registration actually open, then upcoming, else fallback
  const openRegistrationCohort = bootcamp.cohorts.find(
    (c) => getCohortRegistrationStatus(c, false).isOpen,
  );
  const upcomingCohort = bootcamp.cohorts.find((c) => c.status === "upcoming");
  const activeCohort =
    openRegistrationCohort || upcomingCohort || bootcamp.cohorts[0];

  // Use the registration validation utility
  const registrationStatus = activeCohort
    ? getCohortRegistrationStatus(activeCohort, false) // We don't have enrollment info in this context
    : null;

  const spotsRemaining = registrationStatus?.spotsRemaining ?? 0;
  const timeRemaining = registrationStatus?.timeRemaining ?? "No Active Cohort";
  const isRegistrationOpen = registrationStatus?.isOpen ?? false;

  // Global signals across all cohorts for CTA logic
  const anyRegistrationOpen = bootcamp.cohorts.some(
    (c) => getCohortRegistrationStatus(c, false).isOpen,
  );
  const anyUpcoming = bootcamp.cohorts.some((c) => c.status === "upcoming");
  const canNavigate = bootcamp.cohorts.length > 0; // allow viewing details if any cohort exists

  // Dynamic button text
  const getButtonText = () => {
    if (anyRegistrationOpen) return "Join Our Next Cohort";
    if (anyUpcoming) return "Coming Soon";
    return "View Details";
  };

  const isButtonDisabled = !canNavigate;

  return (
    <Card className="relative bg-gradient-to-br from-steel-red/10 via-background to-flame-yellow/10 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl h-full flex flex-col min-h-[480px]">
      <CardHeader className="pb-8 flex-1 flex flex-col space-y-4">
        {/* Status Badge - First element, positioned at top */}
        <div className="flex justify-end mb-2">
          <div
            className={`inline-flex items-center gap-2 backdrop-blur-sm border rounded-full px-3 py-1 ${
              isRegistrationOpen
                ? "bg-flame-yellow/20 border-flame-yellow/30"
                : activeCohort?.status === "upcoming"
                  ? "bg-blue-500/20 border-blue-500/30"
                  : "bg-red-500/20 border-red-500/30"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isRegistrationOpen
                  ? "bg-flame-yellow animate-pulse"
                  : activeCohort?.status === "upcoming"
                    ? "bg-blue-500"
                    : "bg-red-500"
              }`}
            ></div>
            <span
              className={`font-medium text-sm ${
                isRegistrationOpen
                  ? "text-flame-yellow"
                  : activeCohort?.status === "upcoming"
                    ? "text-blue-400"
                    : "text-red-400"
              }`}
            >
              {isRegistrationOpen
                ? "Registration Open"
                : activeCohort?.status === "upcoming"
                  ? "Coming Soon"
                  : !activeCohort
                    ? "Cooking"
                    : "Registration Closed"}
            </span>
          </div>
        </div>

        {/* Icon and Title on same line */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-steel-red rounded-full text-white flex-shrink-0">
            <Flame className="w-8 h-8" />
          </div>
          <CardTitle className="font-heading text-2xl md:text-3xl text-flame-yellow flex-1">
            {bootcamp.name}
          </CardTitle>
        </div>

        {/* Beginner Friendly Badge */}
        <div className="inline-flex items-center gap-2 bg-steel-red/20 border border-steel-red/30 rounded-full px-3 py-1 w-fit self-start">
          <Sparkles className="w-4 h-4 text-steel-red" />
          <span className="text-steel-red font-medium text-sm">
            Beginner Friendly
          </span>
        </div>

        {/* Description flows naturally */}
        <CardDescription className="text-base leading-relaxed">
          {bootcamp.description}
        </CardDescription>

        {/* Key Metrics - Remove pricing section */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
            <Clock className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-xl font-bold">{bootcamp.duration_weeks}</div>
            <div className="text-sm text-faded-grey">Weeks</div>
          </div>
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
            <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
            <div className="text-xl font-bold">
              {bootcamp.max_reward_dgt > 1000
                ? `${Math.round(bootcamp.max_reward_dgt / 1000)}k`
                : bootcamp.max_reward_dgt.toLocaleString()}
            </div>
            <div className="text-sm text-faded-grey">Max DG</div>
          </div>
          {activeCohort && (
            <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
              <Users className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
              <div className="text-xl font-bold">{spotsRemaining}</div>
              <div className="text-sm text-faded-grey">Spots Left</div>
            </div>
          )}
        </div>

        {/* Urgency and CTA */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pt-6 border-t border-faded-grey/20 mt-auto">
          <div className="flex items-center gap-2 text-steel-red">
            <Calendar className="w-5 h-5" />
            <span className="font-medium">{timeRemaining}</span>
          </div>

          <div className="flex gap-3">
            <Button
              disabled={isButtonDisabled}
              onClick={() => {
                if (!isButtonDisabled) {
                  window.location.href = `/bootcamp/${bootcamp.id}${
                    activeCohort ? `/cohort/${activeCohort.id}` : ""
                  }`;
                }
              }}
              className={`group font-bold px-6 transition-all transform hover:scale-105 ${
                !isButtonDisabled
                  ? "bg-steel-red hover:bg-steel-red/90 text-white"
                  : "bg-gray-600 text-gray-300 cursor-not-allowed"
              }`}
            >
              {getButtonText()}
              {!isButtonDisabled && (
                <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
