import React, { useMemo } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBootcamps } from "@/hooks/useBootcamps";
import { Calendar, Users, Clock, Trophy, Loader2 } from "lucide-react";
import type { Cohort } from "@/lib/supabase/types";

function selectPrimaryCohort(
  cohorts: (Cohort | null | undefined)[],
): Cohort | null {
  if (!cohorts || cohorts.length === 0) return null;
  const filteredCohorts = cohorts.filter(
    (c): c is Cohort => c !== null && c !== undefined,
  );
  const open = filteredCohorts.find((c) => c.status === "open");
  if (open) return open;
  const upcoming = filteredCohorts.find((c) => c.status === "upcoming");
  if (upcoming) return upcoming;
  return filteredCohorts[0] || null;
}

export function FlagshipInfernalSparks() {
  const { bootcamps, loading, error } = useBootcamps();

  const infernal = useMemo(() => {
    return bootcamps.find((b) =>
      b.name?.toLowerCase().includes("infernal sparks"),
    );
  }, [bootcamps]);

  const cohort = infernal ? selectPrimaryCohort(infernal.cohorts || []) : null;

  if (loading) {
    return (
      <section className="py-14 bg-background/80">
        <div className="container mx-auto px-4 text-center text-faded-grey">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading bootcamp...
        </div>
      </section>
    );
  }

  if (error || !infernal) {
    return null;
  }

  const startDate = cohort
    ? new Date(cohort.start_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";
  const spotsLeft = cohort
    ? Math.max(0, cohort.max_participants - cohort.current_participants)
    : null;

  return (
    <section className="py-16 md:py-24 bg-background/90" id="flagship">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-heading font-bold text-white mb-8">
            Featured Bootcamp
          </h2>
          <h3 className="text-xl md:text-2xl lg:text-3xl font-heading text-flame-yellow mb-4">
            {infernal.name}
          </h3>
          <p className="text-base md:text-lg text-faded-grey max-w-3xl mx-auto">
            {infernal.duration_weeks}-week cohort-based onboarding experience
            for Web3 beginners.
          </p>
        </div>

        <Card className="bg-card/80 border-border/70 shadow-2xl max-w-4xl mx-auto">
          <CardHeader className="space-y-8 px-6 md:px-6 lg:px-10 py-8 md:py-10">
            <div className="space-y-6">
              <h4 className="text-lg font-semibold text-white mb-6 text-center">
                What you&apos;ll do:
              </h4>
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4 text-sm md:text-base text-faded-grey max-w-3xl mx-auto">
                <li>
                  • Set up your Web3 identity including: Wallet + Basename +
                  social accounts
                </li>
                <li>
                  • Join and participate in real Decentralized Autonomous
                  Organizations (DAOs)
                </li>
                <li>• Make your first swap onchain</li>
                <li>• Deploy an NFT contract & create a sales checkout</li>
                <li>• Join a guild and earn roles</li>
                <li>• Create a final artifact proving your journey</li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-3 justify-center pt-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-border/60">
                <Clock className="w-4 h-4 text-flame-yellow" />
                <span className="text-sm text-white font-semibold">
                  {infernal.duration_weeks} weeks
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-border/60">
                <Trophy className="w-4 h-4 text-flame-yellow" />
                <span className="text-sm text-white font-semibold">
                  {infernal.max_reward_dgt.toLocaleString()} DG
                </span>
              </div>
              {cohort && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-border/60">
                  <Calendar className="w-4 h-4 text-flame-yellow" />
                  <span className="text-sm text-white font-semibold">
                    Starts {startDate}
                  </span>
                </div>
              )}
              {cohort && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/80 border border-border/60">
                  <Users className="w-4 h-4 text-flame-yellow" />
                  <span className="text-sm text-white font-semibold">
                    {spotsLeft ?? ""} spots left
                  </span>
                </div>
              )}
            </div>
          </CardHeader>

          <div className="px-6 md:px-6 lg:px-10 pb-8 pt-6 flex justify-center">
            {cohort ? (
              <Button
                className="bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold"
                onClick={() =>
                  (window.location.href = `/bootcamp/${infernal.id}/cohort/${cohort.id}`)
                }
              >
                View Details & Apply
              </Button>
            ) : (
              <div className="text-sm text-faded-grey">
                No cohort available yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
