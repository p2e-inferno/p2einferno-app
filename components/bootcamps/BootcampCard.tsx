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

  return (
    <Card className="relative bg-gradient-to-br from-steel-red/10 via-background to-flame-yellow/10 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl h-full">
      {/* Status Badge */}
      <div className="absolute top-4 right-4 z-10">
        <div className={`inline-flex items-center gap-2 backdrop-blur-sm border rounded-full px-2 py-1 ${
          isRegistrationOpen 
            ? "bg-green-500/20 border-green-500/30" 
            : activeCohort?.status === "upcoming"
            ? "bg-blue-500/20 border-blue-500/30"
            : "bg-red-500/20 border-red-500/30"
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isRegistrationOpen 
              ? "bg-green-500 animate-pulse" 
              : activeCohort?.status === "upcoming"
              ? "bg-blue-500"
              : "bg-red-500"
          }`}></div>
          <span className={`font-medium text-xs ${
            isRegistrationOpen 
              ? "text-green-400" 
              : activeCohort?.status === "upcoming"
              ? "text-blue-400"
              : "text-red-400"
          }`}>
            {isRegistrationOpen ? "Open" : 
             activeCohort?.status === "upcoming" ? "Coming Soon" : 
             !activeCohort ? "Cooking" : "Closed"}
          </span>
        </div>
      </div>

      <CardHeader className="p-6 flex flex-col h-full">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-steel-red rounded-full text-white flex-shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="font-heading text-lg mb-2 text-flame-yellow line-clamp-2">
              {bootcamp.name}
            </CardTitle>
            <div className="inline-flex items-center gap-1 bg-steel-red/20 border border-steel-red/30 rounded-full px-2 py-1 mb-3">
              <Sparkles className="w-3 h-3 text-steel-red" />
              <span className="text-steel-red font-medium text-xs">
                Beginner Friendly
              </span>
            </div>
          </div>
        </div>

        <CardDescription className="text-sm leading-relaxed mb-4 flex-grow line-clamp-3">
          {bootcamp.description}
        </CardDescription>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-center border border-faded-grey/20">
            <Clock className="w-4 h-4 text-flame-yellow mx-auto mb-1" />
            <div className="text-lg font-bold">{bootcamp.duration_weeks}</div>
            <div className="text-xs text-faded-grey">Weeks</div>
          </div>
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-center border border-faded-grey/20">
            <Trophy className="w-4 h-4 text-flame-yellow mx-auto mb-1" />
            <div className="text-lg font-bold">
              {bootcamp.max_reward_dgt > 1000 
                ? `${Math.round(bootcamp.max_reward_dgt / 1000)}k` 
                : bootcamp.max_reward_dgt.toLocaleString()
              }
            </div>
            <div className="text-xs text-faded-grey">Max DG</div>
          </div>
          {activeCohort && (
            <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-center border border-faded-grey/20">
              <Users className="w-4 h-4 text-flame-yellow mx-auto mb-1" />
              <div className="text-lg font-bold">{spotsRemaining}</div>
              <div className="text-xs text-faded-grey">Spots</div>
            </div>
          )}
        </div>

        {/* Registration Status */}
        {activeCohort && (
          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 mb-4 border border-faded-grey/20">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="w-4 h-4 text-flame-yellow" />
              <h3 className="text-sm font-medium">Registration</h3>
            </div>
            <p className="text-center text-xs text-faded-grey">
              {isRegistrationOpen ? "Open Now" : 
               activeCohort.status === "upcoming" ? "Coming Soon" : 
               "Closed"}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col gap-2 pt-4 border-t border-faded-grey/20 mt-auto">
          {activeCohort && (
            <div className="flex items-center justify-center gap-2 text-steel-red">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium">{timeRemaining}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = `/bootcamp/${bootcamp.id}`)}
            className="border-flame-yellow/30 text-flame-yellow hover:bg-flame-yellow/10 w-full"
          >
            Learn More
            <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}