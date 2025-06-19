import React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  infernalSparksProgram,
  currentCohort,
  formatCurrency,
  calculateTimeRemaining,
} from "@/lib/bootcamp-data";
import {
  Clock,
  Users,
  Trophy,
  DollarSign,
  Calendar,
  Flame,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export function Bootcamps() {
  const timeRemaining = calculateTimeRemaining(
    currentCohort.registration_deadline
  );
  const spotsRemaining =
    currentCohort.max_participants - currentCohort.current_participants;

  // Registration is always open
  const registrationPeriod = "Open Registration";

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

        <div className="max-w-4xl mx-auto">
          {/* Featured Bootcamp - Infernal Sparks */}
          <Card className="relative bg-gradient-to-br from-steel-red/10 via-background to-flame-yellow/10 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl">
            {/* Status Badge */}
            <div className="absolute top-4 right-4 z-10">
              <div className="inline-flex items-center gap-2 bg-flame-yellow/20 backdrop-blur-sm border border-flame-yellow/30 rounded-full px-3 py-1">
                <div className="w-2 h-2 bg-flame-yellow rounded-full animate-pulse"></div>
                <span className="text-flame-yellow font-medium text-sm">
                  Registration Open
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
                    {infernalSparksProgram.name}
                  </CardTitle>
                  <div className="inline-flex items-center gap-2 bg-steel-red/20 border border-steel-red/30 rounded-full px-3 py-1 mb-4">
                    <Sparkles className="w-4 h-4 text-steel-red" />
                    <span className="text-steel-red font-medium text-sm">
                      Beginner Friendly
                    </span>
                  </div>
                  <CardDescription className="text-base leading-relaxed">
                    {infernalSparksProgram.description}
                  </CardDescription>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
                  <Clock className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                  <div className="text-xl font-bold">
                    {infernalSparksProgram.duration_weeks}
                  </div>
                  <div className="text-sm text-faded-grey">Weeks</div>
                </div>
                <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
                  <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                  <div className="text-xl font-bold">
                    {infernalSparksProgram.max_reward_dgt.toLocaleString()}
                  </div>
                  <div className="text-sm text-faded-grey">Max DG</div>
                </div>
                <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
                  <DollarSign className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                  <div className="text-xl font-bold">
                    {formatCurrency(infernalSparksProgram.cost_usd, "USD")}
                  </div>
                  <div className="text-sm text-faded-grey">Starting at</div>
                </div>
                <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 text-center border border-faded-grey/20">
                  <Users className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                  <div className="text-xl font-bold">{spotsRemaining}</div>
                  <div className="text-sm text-faded-grey">Spots Left</div>
                </div>
              </div>

              {/* Registration Period */}
              <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 mb-6 border border-faded-grey/20">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-flame-yellow" />
                  <h3 className="text-lg font-medium">Registration Period</h3>
                </div>
                <p className="text-center text-faded-grey">{registrationPeriod}</p>
              </div>

              {/* Urgency and CTA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-faded-grey/20">
                <div className="flex items-center gap-2 text-steel-red">
                  <Calendar className="w-5 h-5" />
                  <span className="font-medium">{timeRemaining}</span>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() =>
                      (window.location.href = `/cohort/${currentCohort.id}`)
                    }
                    className="border-flame-yellow/30 text-flame-yellow hover:bg-flame-yellow/10"
                  >
                    Learn More
                  </Button>
                  <Button
                    onClick={() =>
                      (window.location.href = `/cohort/${currentCohort.id}`)
                    }
                    className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold px-6 transition-all transform hover:scale-105"
                  >
                    Join Our Next Cohort
                    <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Coming Soon Programs */}
          <div className="mt-12 text-center">
            <h3 className="text-xl font-bold font-heading mb-6 text-faded-grey">
              More Programs Coming Soon
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-card/50 border-faded-grey/20 opacity-60">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-faded-grey/20 rounded-full">
                      <Trophy className="w-6 h-6 text-faded-grey" />
                    </div>
                    <CardTitle className="text-lg text-faded-grey">
                      Advanced DeFi Mastery
                    </CardTitle>
                  </div>
                  <CardDescription className="text-faded-grey">
                    Deep dive into advanced DeFi protocols, yield farming, and
                    complex trading strategies.
                  </CardDescription>
                  <div className="pt-4">
                    <span className="inline-block bg-faded-grey/20 text-faded-grey px-3 py-1 rounded-full text-sm">
                      Coming Q2 2024
                    </span>
                  </div>
                </CardHeader>
              </Card>

              <Card className="bg-card/50 border-faded-grey/20 opacity-60">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-faded-grey/20 rounded-full">
                      <Users className="w-6 h-6 text-faded-grey" />
                    </div>
                    <CardTitle className="text-lg text-faded-grey">
                      Community Leadership
                    </CardTitle>
                  </div>
                  <CardDescription className="text-faded-grey">
                    Learn to build and manage thriving Web3 communities and
                    DAOs.
                  </CardDescription>
                  <div className="pt-4">
                    <span className="inline-block bg-faded-grey/20 text-faded-grey px-3 py-1 rounded-full text-sm">
                      Coming Q3 2024
                    </span>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
