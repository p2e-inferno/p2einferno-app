import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";

interface BootcampWithCohorts extends BootcampProgram {
  cohorts: Cohort[];
}
import { Flame, Trophy, Users } from "lucide-react";

interface BootcampsComingSoonProps {
  bootcamps: BootcampWithCohorts[];
}

export function BootcampsComingSoon({ bootcamps }: BootcampsComingSoonProps) {
  // Filter bootcamps that have no cohorts (coming soon)
  const comingSoonBootcamps = bootcamps.filter(
    (bootcamp) => bootcamp.cohorts?.length === 0,
  );

  // Default coming soon bootcamps if none exist
  const defaultComingSoon = [
    {
      id: "advanced-defi",
      name: "Advanced DeFi Mastery",
      description:
        "Deep dive into advanced DeFi protocols, yield farming, and complex trading strategies.",
      icon: Trophy,
      releaseDate: "Q2 2026",
    },
    {
      id: "community-leadership",
      name: "Community Leadership",
      description:
        "Learn to build and manage thriving Web3 communities and DAOs.",
      icon: Users,
      releaseDate: "Q3 2026",
    },
  ];

  const displayBootcamps =
    comingSoonBootcamps.length > 0 ? comingSoonBootcamps : defaultComingSoon;

  return (
    <div className="mt-12 text-center">
      <h3 className="text-xl font-bold font-heading mb-6 text-faded-grey">
        {comingSoonBootcamps.length > 0
          ? "More Programs"
          : "More Programs Coming Soon"}
      </h3>
      <div className="grid md:grid-cols-2 gap-6">
        {displayBootcamps.slice(0, 2).map((bootcamp) => {
          const IconComponent = "icon" in bootcamp ? bootcamp.icon : Flame;
          const releaseDate =
            "releaseDate" in bootcamp ? bootcamp.releaseDate : "Coming Soon";

          return (
            <Card
              key={bootcamp.id}
              className="bg-card/50 border-faded-grey/20 opacity-60"
            >
              <CardHeader>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-faded-grey/20 rounded-full flex-shrink-0">
                    <IconComponent className="w-6 h-6 text-faded-grey" />
                  </div>
                  <CardTitle className="text-lg text-faded-grey text-center flex-1">
                    {bootcamp.name}
                  </CardTitle>
                </div>
                <CardDescription className="text-faded-grey">
                  {bootcamp.description}
                </CardDescription>
                <div className="pt-4">
                  <span className="inline-block bg-faded-grey/20 text-faded-grey px-3 py-1 rounded-full text-sm">
                    {releaseDate}
                  </span>
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
