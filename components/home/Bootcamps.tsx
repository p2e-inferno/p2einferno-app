import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
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

export function Bootcamps() {
  const [bootcamps, setBootcamps] = useState<BootcampWithCohorts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBootcamps();
  }, []);

  const fetchBootcamps = async () => {
    try {
      setLoading(true);
      
      // Fetch bootcamps with their cohorts
      const { data: bootcampsData, error: bootcampsError } = await supabase
        .from("bootcamp_programs")
        .select("*")
        .order("created_at", { ascending: false });

      if (bootcampsError) throw bootcampsError;

      // Fetch cohorts for each bootcamp
      const bootcampsWithCohorts = await Promise.all(
        (bootcampsData || []).map(async (bootcamp) => {
          const { data: cohortsData, error: cohortsError } = await supabase
            .from("cohorts")
            .select("*")
            .eq("bootcamp_program_id", bootcamp.id)
            .order("start_date", { ascending: false });

          if (cohortsError) throw cohortsError;

          return {
            ...bootcamp,
            cohorts: cohortsData || []
          };
        })
      );

      setBootcamps(bootcampsWithCohorts);
    } catch (err: any) {
      console.error("Error fetching bootcamps:", err);
      setError(err.message || "Failed to load bootcamps");
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Registration Closed";
    if (diffDays === 0) return "Last Day!";
    if (diffDays === 1) return "1 day left";
    return `${diffDays} days left`;
  };

  if (loading) {
    return (
      <section id="bootcamps" className="py-20 md:py-32 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flame-yellow mx-auto"></div>
            <p className="mt-4 text-faded-grey">Loading bootcamps...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section id="bootcamps" className="py-20 md:py-32 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-red-400">Error: {error}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="bootcamps" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold font-heading">
            Bootcamp Programs
          </h2>
          <p className="mt-4 text-lg text-faded-grey max-w-3xl mx-auto">
            Accelerate your Web3 journey through our immersive bootcamp
            experiences. Learn by doing, earn while learning, and join our
            thriving community.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          {bootcamps.map((bootcamp) => {
            const activeCohort = bootcamp.cohorts.find(c => c.status === "open") || bootcamp.cohorts[0];
            const spotsRemaining = activeCohort 
              ? activeCohort.max_participants - activeCohort.current_participants 
              : 0;
            const timeRemaining = activeCohort 
              ? calculateTimeRemaining(activeCohort.registration_deadline)
              : "No Active Cohort";

            return (
              <Card key={bootcamp.id} className="relative bg-gradient-to-br from-steel-red/10 via-background to-flame-yellow/10 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl">
                {/* Status Badge */}
                <div className="absolute top-4 right-4 z-10">
                  <div className="inline-flex items-center gap-2 bg-flame-yellow/20 backdrop-blur-sm border border-flame-yellow/30 rounded-full px-3 py-1">
                    <div className="w-2 h-2 bg-flame-yellow rounded-full animate-pulse"></div>
                    <span className="text-flame-yellow font-medium text-sm">
                      {activeCohort?.status === "open" ? "Registration Open" : "Coming Soon"}
                    </span>
                  </div>
                </div>

                <CardHeader className="pb-8">
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
                      <CardDescription className="text-base leading-relaxed">
                        {bootcamp.description}
                      </CardDescription>
                    </div>
                  </div>

                  {/* Key Metrics */}
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
                        {bootcamp.max_reward_dgt.toLocaleString()}
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

                  {/* Registration Period */}
                  {activeCohort && (
                    <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 mb-6 border border-faded-grey/20">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Calendar className="w-5 h-5 text-flame-yellow" />
                        <h3 className="text-lg font-medium">Registration Period</h3>
                      </div>
                      <p className="text-center text-faded-grey">
                        {activeCohort.status === "open" ? "Open Registration" : "Coming Soon"}
                      </p>
                    </div>
                  )}

                  {/* CTA */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-faded-grey/20">
                    {activeCohort && (
                      <div className="flex items-center gap-2 text-steel-red">
                        <Calendar className="w-5 h-5" />
                        <span className="font-medium">{timeRemaining}</span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => (window.location.href = `/bootcamp/${bootcamp.id}`)}
                        className="border-flame-yellow/30 text-flame-yellow hover:bg-flame-yellow/10"
                      >
                        Learn More
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
