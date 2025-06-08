import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import {
  infernalSparksProgram,
  currentCohort,
  weeklyContent,
  formatCurrency,
  calculateTimeRemaining,
} from "@/lib/bootcamp-data";
import {
  Clock,
  Users,
  Trophy,
  DollarSign,
  Calendar,
  Target,
  BookOpen,
  Flame,
  ChevronRight,
} from "lucide-react";

interface CohortPageProps {
  cohortId: string;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const cohortId = params?.cohortId as string;

  // In a real app, you'd fetch this from your database
  if (cohortId !== "infernal-sparks-cohort-1") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      cohortId,
    },
  };
};

export default function CohortPage({ cohortId }: CohortPageProps) {
  const router = useRouter();

  const handleBeginApplication = () => {
    router.push(`/apply/${cohortId}`);
  };

  const timeRemaining = calculateTimeRemaining(
    currentCohort.registration_deadline
  );
  const spotsRemaining =
    currentCohort.max_participants - currentCohort.current_participants;

  return (
    <>
      <Head>
        <title>{infernalSparksProgram.name} - P2E INFERNO Bootcamp</title>
        <meta name="description" content={infernalSparksProgram.description} />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        {/* Hero Section with Background */}
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
              {infernalSparksProgram.name}
            </h1>

            <div className="inline-flex items-center gap-2 bg-steel-red/20 backdrop-blur-sm border border-steel-red/30 rounded-full px-4 py-2 mb-8">
              <Flame className="w-4 h-4 text-steel-red" />
              <span className="text-steel-red font-medium text-sm">
                {currentCohort.name}
              </span>
            </div>

            <p className="max-w-3xl mx-auto text-lg md:text-xl mb-12 leading-relaxed">
              {infernalSparksProgram.description}
            </p>

            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-5xl mx-auto mb-12">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Calendar className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {new Date(currentCohort.start_date).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}
                </div>
                <div className="text-sm text-faded-grey">Start Date</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Clock className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {infernalSparksProgram.duration_weeks}
                </div>
                <div className="text-sm text-faded-grey">Weeks</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {infernalSparksProgram.max_reward_dgt.toLocaleString()}
                </div>
                <div className="text-sm text-faded-grey">Max DG Rewards</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <DollarSign className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {formatCurrency(infernalSparksProgram.cost_usd, "USD")}
                </div>
                <div className="text-sm text-faded-grey">
                  or {formatCurrency(infernalSparksProgram.cost_naira, "NGN")}
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
                {new Date(
                  currentCohort.registration_deadline
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                ({timeRemaining})
              </span>
            </div>

            {/* CTA Button */}
            <Button
              onClick={handleBeginApplication}
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

        {/* Detailed Information */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              {/* Program Overview */}
              <div>
                <h2 className="text-3xl font-bold font-heading mb-6 text-flame-yellow">
                  What You'll Learn
                </h2>
                <p className="text-lg text-faded-grey mb-8">
                  Master the fundamentals of Web3 and join the P2E Inferno
                  community through hands-on experience and real-world
                  applications.
                </p>

                <div className="space-y-6">
                  {weeklyContent.map((week) => (
                    <Card
                      key={week.week}
                      className="p-6 bg-card border-steel-red/20"
                    >
                      <div className="flex items-start gap-4">
                        <div className="bg-steel-red text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                          {week.week}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold mb-2">
                            {week.title}
                          </h3>
                          <p className="text-faded-grey text-sm mb-3">
                            {week.focus}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-faded-grey">
                            <div className="flex items-center gap-1">
                              <Trophy className="w-3 h-3" />
                              {week.reward.toLocaleString()} DG
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {week.estimatedHours}h
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Program Details */}
              <div className="space-y-8">
                <Card className="p-6 bg-card border-flame-yellow/20">
                  <h3 className="text-xl font-bold mb-4 text-flame-yellow flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Program Highlights
                  </h3>
                  <ul className="space-y-3 text-faded-grey">
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                      <span>Hands-on experience with real Web3 protocols</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                      <span>
                        Direct access to P2E Inferno community and mentors
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                      <span>Weekly milestones with DG token rewards</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                      <span>Portfolio-ready projects and achievements</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                      <span>Optional Gitcoin Passport certification</span>
                    </li>
                  </ul>
                </Card>

                <Card className="p-6 bg-card border-steel-red/20">
                  <h3 className="text-xl font-bold mb-4 text-steel-red flex items-center gap-2">
                    <BookOpen className="w-5 h-5" />
                    Requirements
                  </h3>
                  <ul className="space-y-3 text-faded-grey">
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                      <span>No prior Web3 experience required</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                      <span>Access to a computer and stable internet</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                      <span>Commitment of 8-10 hours per week</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                      <span>Willingness to engage with community</span>
                    </li>
                  </ul>
                </Card>

                {/* Final CTA */}
                <div className="text-center pt-8">
                  <Button
                    onClick={handleBeginApplication}
                    className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 w-full"
                  >
                    Start Your Web3 Journey
                    <Flame className="ml-2 h-5 w-5 transition-transform group-hover:rotate-12" />
                  </Button>
                  <p className="mt-4 text-sm text-faded-grey">
                    Join {currentCohort.current_participants} other aspiring
                    Web3 enthusiasts
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </MainLayout>
    </>
  );
}
