import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  // Find open cohort first, then upcoming, then most recent
  const openCohort = bootcamp.cohorts.find(c => c.status === "open");
  const upcomingCohort = bootcamp.cohorts.find(c => c.status === "upcoming");
  const activeCohort = openCohort || upcomingCohort || bootcamp.cohorts[0];
  
  // Use the registration validation utility
  const registrationStatus = activeCohort 
    ? getCohortRegistrationStatus(activeCohort, false) // We don't have enrollment info in this context
    : null;
  
  const spotsRemaining = registrationStatus?.spotsRemaining ?? 0;
  const timeRemaining = registrationStatus?.timeRemaining ?? "No Active Cohort";
  const isRegistrationOpen = registrationStatus?.isOpen ?? false;
  
  // Dynamic button text
  const getButtonText = () => {
    if (!activeCohort) return "Coming Soon";
    if (isRegistrationOpen) return "Join Our Next Cohort";
    if (activeCohort.status === "upcoming") return "Coming Soon";
    return "Coming Soon";
  };
  
  const isButtonDisabled = !activeCohort || !isRegistrationOpen;

  return (
    // <Card className="relative max-w-md mx-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-flame-yellow/30 rounded-2xl overflow-hidden h-full">
    //   {/* Status Badge - Top Right */}
    //   <div className="absolute top-4 right-4 z-10">
    //     <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
    //       isRegistrationOpen 
    //         ? "bg-flame-yellow text-black" 
    //         : "bg-gray-700 text-gray-300"
    //     }`}>
    //       <div className={`w-2 h-2 rounded-full ${
    //         isRegistrationOpen ? "bg-black" : "bg-gray-400"
    //       }`}></div>
    //       {isRegistrationOpen ? "Registration Open" : "Coming Soon"}
    //     </div>
    //   </div>

    //   <div className="p-6 flex flex-col h-full">
    //     {/* Header with Icon and Title */}
    //     <div className="flex items-center gap-3 mb-4">
    //       <div className="p-3 bg-steel-red rounded-full">
    //         <Flame className="w-6 h-6 text-white" />
    //       </div>
    //       <div className="flex-1">
    //         <h3 className="text-xl font-bold text-flame-yellow mb-1">
    //           {bootcamp.name}
    //         </h3>
    //         <div className="inline-flex items-center gap-1 bg-steel-red/20 rounded-full px-2 py-1">
    //           <Sparkles className="w-3 h-3 text-steel-red" />
    //           <span className="text-steel-red text-xs font-medium">Beginner Friendly</span>
    //         </div>
    //       </div>
    //     </div>

    //     {/* Description */}
    //     <p className="text-gray-300 text-sm leading-relaxed mb-6">
    //       {bootcamp.description}
    //     </p>

    //     {/* Stats Grid */}
    //     <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    //       <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
    //         <Clock className="w-5 h-5 text-flame-yellow mx-auto mb-2" />
    //         <div className="text-lg font-bold text-white">{bootcamp.duration_weeks}</div>
    //         <div className="text-xs text-gray-400">Weeks</div>
    //       </div>
    //       <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
    //         <Trophy className="w-5 h-5 text-flame-yellow mx-auto mb-2" />
    //         <div className="text-lg font-bold text-white">
    //           {bootcamp.max_reward_dgt > 1000 
    //             ? `${Math.round(bootcamp.max_reward_dgt / 1000)}k` 
    //             : bootcamp.max_reward_dgt.toLocaleString()
    //           }
    //         </div>
    //         <div className="text-xs text-gray-400">Max DG</div>
    //       </div>
    //       {activeCohort && (
    //         <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-center">
    //           <Users className="w-5 h-5 text-flame-yellow mx-auto mb-2" />
    //           <div className="text-lg font-bold text-white">{spotsRemaining}</div>
    //           <div className="text-xs text-gray-400">Spots Left</div>
    //         </div>
    //       )}
    //     </div>

    //     {/* Bottom Section */}
    //     <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
    //       {/* Days Remaining Display */}
    //       <div className="flex items-center gap-1 text-steel-red text-sm">
    //         <Calendar className="w-4 h-4" />
    //         <span>{timeRemaining}</span>
    //       </div>

    //       {/* Single CTA Button */}
    //       <Button
    //         disabled={isButtonDisabled}
    //         onClick={() => !isButtonDisabled && (window.location.href = `/bootcamp/${bootcamp.id}`)}
    //         className={`${
    //           isButtonDisabled 
    //             ? "bg-gray-600 text-gray-300 cursor-not-allowed" 
    //             : "bg-steel-red hover:bg-steel-red/80 text-white"
    //         } px-6 py-2 rounded-lg font-medium transition-colors`}
    //       >
    //         {getButtonText()}
    //         {!isButtonDisabled && <ChevronRight className="ml-1 h-4 w-4" />}
    //       </Button>
    //     </div>
    //   </div>
    // </Card>


    <Card className="relative bg-gradient-to-br from-steel-red/10 via-background to-flame-yellow/10 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl h-full flex flex-col min-h-[480px]">
    {/* Status Badge */}
    <div className="absolute top-4 right-4 z-10">
      <div className={`inline-flex items-center gap-2 backdrop-blur-sm border rounded-full px-3 py-1 ${
        isRegistrationOpen 
          ? "bg-flame-yellow/20 border-flame-yellow/30" 
          : activeCohort?.status === "upcoming"
          ? "bg-blue-500/20 border-blue-500/30"
          : "bg-red-500/20 border-red-500/30"
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          isRegistrationOpen 
            ? "bg-flame-yellow animate-pulse" 
            : activeCohort?.status === "upcoming"
            ? "bg-blue-500"
            : "bg-red-500"
        }`}></div>
        <span className={`font-medium text-sm ${
          isRegistrationOpen 
            ? "text-flame-yellow" 
            : activeCohort?.status === "upcoming"
            ? "text-blue-400"
            : "text-red-400"
        }`}>
          {isRegistrationOpen ? "Registration Open" : 
           activeCohort?.status === "upcoming" ? "Coming Soon" : 
           !activeCohort ? "Cooking" : "Registration Closed"}
        </span>
      </div>
    </div>

    <CardHeader className="pb-8 flex-1 flex flex-col">
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-steel-red rounded-full text-white">
          <Flame className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <CardTitle className="font-heading text-2xl md:text-3xl mb-2 text-flame-yellow">
            {bootcamp.name}
          </CardTitle>
          <div className="inline-flex items-center gap-2 bg-steel-red/20 border border-steel-red/30 rounded-full px-3 py-1 mb-4">
            <Sparkles className="w-4 h-4 text-steel-red" />
            <span className="text-steel-red font-medium text-sm">
              Beginner Friendly
            </span>
          </div>
          <CardDescription className="text-base leading-relaxed flex-1 min-h-[80px]">
            {bootcamp.description}
          </CardDescription>
        </div>
      </div>

      {/* Key Metrics - Remove pricing section */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
          <Clock className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
          <div className="text-xl font-bold">
            {bootcamp.duration_weeks}
          </div>
          <div className="text-sm text-faded-grey">Weeks</div>
        </div>
        <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
          <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
          <div className="text-xl font-bold">
            {bootcamp.max_reward_dgt > 1000 
              ? `${Math.round(bootcamp.max_reward_dgt / 1000)}k` 
              : bootcamp.max_reward_dgt.toLocaleString()
            }
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-faded-grey/20 mt-auto">
        <div className="flex items-center gap-2 text-steel-red">
          <Calendar className="w-5 h-5" />
          <span className="font-medium">{timeRemaining}</span>
        </div>

        <div className="flex gap-3">
          <Button
            disabled={isButtonDisabled}
            onClick={() => !isButtonDisabled && (window.location.href = `/bootcamp/${bootcamp.id}`)}
            className={`group font-bold px-6 transition-all transform hover:scale-105 ${
              !isButtonDisabled 
                ? "bg-steel-red hover:bg-steel-red/90 text-white"
                : "bg-gray-600 text-gray-300 cursor-not-allowed"
            }`}
          >
            {getButtonText()}
            {!isButtonDisabled && <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </Button>
        </div>
      </div>
    </CardHeader>
  </Card>
  );
}