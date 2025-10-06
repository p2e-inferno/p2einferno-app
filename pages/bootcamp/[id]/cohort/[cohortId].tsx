import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";

import {
  Clock,
  Users,
  Trophy,
  Calendar,
  Target,
  BookOpen,
  Flame,
  ChevronRight,
  CheckCircle,
} from "lucide-react";
import { calculateTimeRemaining } from "@/lib/utils/registration-validation";
import { useCohortDetails } from "@/hooks/useCohortDetails";

interface CohortPageProps {
  bootcampId: string;
  cohortId: string;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const bootcampId = params?.id as string;
  const cohortId = params?.cohortId as string;

  if (!bootcampId || !cohortId) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      bootcampId,
      cohortId,
    },
  };
};

export default function CohortPage({ bootcampId, cohortId }: CohortPageProps) {
  const router = useRouter();
  const { data, loading, error } = useCohortDetails(cohortId);

  // Extract data from the hook response
  const bootcamp = data?.bootcamp || null;
  const cohort = data?.cohort || null;
  const milestones = data?.milestones || [];
  const highlights = data?.highlights || [];
  const requirements = data?.requirements || [];

  const handleBeginApplication = () => {
    // Only allow navigation if registration is open and spots are available
    if (
      cohort?.status === "open" &&
      cohort.max_participants - cohort.current_participants > 0
    ) {
      router.push(`/apply/${cohortId}`);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flame-yellow mx-auto"></div>
            <p className="mt-4 text-faded-grey">Loading cohort details...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !bootcamp || !cohort) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400">Error: {error || "Cohort not found"}</p>
            <Button
              onClick={() => router.push(`/bootcamp/${bootcampId}`)}
              className="mt-4"
              variant="outline"
            >
              Back to Bootcamp
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  const timeRemaining = calculateTimeRemaining(cohort.registration_deadline);
  const spotsRemaining = cohort.max_participants - cohort.current_participants;
  const isRegistrationOpen =
    cohort.status === "open" &&
    spotsRemaining > 0 &&
    timeRemaining !== "Registration Closed";

  const isEnrolledInBootcamp = data?.userEnrollment?.isEnrolledInBootcamp;
  const enrolledCohortId = data?.userEnrollment?.enrolledCohortId;

  return (
    <>
      <Head>
        <title>
          {cohort.name} - {bootcamp.name} - P2E INFERNO Bootcamp
        </title>
        <meta name="description" content={bootcamp.description} />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        {/* Hero Section with Background */}
        <section
          className="relative min-h-screen flex items-center justify-center overflow-hidden"
          style={{
            backgroundImage:
              "url('https://via.placeholder.com/1920x1080/1a1a1a/444444?text=Cohort+Details')",
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
            <div
              className={`inline-flex items-center gap-2 backdrop-blur-sm border rounded-full px-4 py-2 mb-6 ${
                isRegistrationOpen
                  ? "bg-green-500/20 border-green-500/30"
                  : cohort.status === "upcoming"
                    ? "bg-blue-500/20 border-blue-500/30"
                    : "bg-red-500/20 border-red-500/30"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isRegistrationOpen
                    ? "bg-green-500 animate-pulse"
                    : cohort.status === "upcoming"
                      ? "bg-blue-500"
                      : "bg-red-500"
                }`}
              ></div>
              <span
                className={`font-medium text-sm ${
                  isRegistrationOpen
                    ? "text-green-400"
                    : cohort.status === "upcoming"
                      ? "text-blue-400"
                      : "text-red-400"
                }`}
              >
                {isRegistrationOpen
                  ? "Registration Open"
                  : cohort.status === "upcoming"
                    ? "Coming Soon"
                    : spotsRemaining <= 0
                      ? "Cohort Full"
                      : timeRemaining === "Registration Closed"
                        ? "Registration Closed"
                        : cohort.status.charAt(0).toUpperCase() +
                          cohort.status.slice(1)}
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-heading mb-6 tracking-tighter">
              {bootcamp.name}
            </h1>

            <div className="inline-flex items-center gap-2 bg-steel-red/20 backdrop-blur-sm border border-steel-red/30 rounded-full px-4 py-2 mb-8">
              <Flame className="w-4 h-4 text-steel-red" />
              <span className="text-steel-red font-medium text-sm">
                {cohort.name}
              </span>
            </div>

            <p className="max-w-3xl mx-auto text-lg md:text-xl mb-12 leading-relaxed">
              {bootcamp.description}
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
                <div className="text-2xl font-bold">
                  {bootcamp.duration_weeks}
                </div>
                <div className="text-sm text-faded-grey">Weeks</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Trophy className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">
                  {bootcamp.max_reward_dgt.toLocaleString()}
                </div>
                <div className="text-sm text-faded-grey">Max DG Rewards</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Users className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">{spotsRemaining}</div>
                <div className="text-sm text-faded-grey">Spots Left</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <Target className="w-6 h-6 text-flame-yellow mx-auto mb-2" />
                <div className="text-2xl font-bold">{milestones.length}</div>
                <div className="text-sm text-faded-grey">Milestones</div>
              </div>
            </div>

            {/* Status Indicator */}
            {isEnrolledInBootcamp ? (
              <div className="inline-flex items-center gap-2 bg-green-500/20 backdrop-blur-sm border border-green-500/30 rounded-full px-4 py-2 mb-8">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-medium text-sm">
                  Enrolled in Bootcamp
                </span>
              </div>
            ) : (
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
                    },
                  )}{" "}
                  ({timeRemaining})
                </span>
              </div>
            )}

            {/* CTA Button */}
            {isEnrolledInBootcamp ? (
              <Button
                onClick={() =>
                  router.push(`/lobby/bootcamps/${enrolledCohortId}`)
                }
                className="group bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                Continue Learning
                <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            ) : isRegistrationOpen ? (
              <Button
                onClick={handleBeginApplication}
                className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg"
              >
                Begin Application
                <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            ) : (
              <div className="bg-faded-grey/20 text-faded-grey font-bold py-4 px-8 rounded-full text-lg cursor-not-allowed inline-flex items-center gap-2">
                {spotsRemaining <= 0
                  ? "Cohort Full"
                  : timeRemaining === "Registration Closed"
                    ? "Registration Closed"
                    : cohort.status === "upcoming"
                      ? "Registration Opens Soon"
                      : "Not Available"}
              </div>
            )}

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
              {/* Milestones Overview */}
              <div>
                <h2 className="text-3xl font-bold font-heading mb-6 text-flame-yellow">
                  Learning Milestones
                </h2>
                <p className="text-lg text-faded-grey mb-8">
                  Progress through structured milestones designed to build your
                  Web3 expertise step by step.
                </p>

                <div className="space-y-6">
                  {milestones.length > 0 ? (
                    milestones.map((milestone, index) => (
                      <Card
                        key={milestone.id}
                        className="p-6 bg-card border-steel-red/20"
                      >
                        <div className="flex items-start gap-4">
                          <div className="bg-steel-red text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-bold mb-2">
                              {milestone.name}
                            </h3>
                            <p className="text-faded-grey text-sm mb-3">
                              {milestone.description}
                            </p>
                            {milestone.milestone_tasks &&
                              milestone.milestone_tasks.length > 0 && (
                                <div className="mt-4">
                                  <h4 className="text-sm font-medium mb-2 text-flame-yellow">
                                    Tasks ({milestone.milestone_tasks.length})
                                  </h4>
                                  <div className="space-y-1">
                                    {milestone.milestone_tasks
                                      .sort(
                                        (a, b) => a.order_index - b.order_index,
                                      )
                                      .slice(0, 3)
                                      .map((task) => (
                                        <div
                                          key={task.id}
                                          className="flex items-center gap-2 text-xs text-faded-grey"
                                        >
                                          <div className="w-1 h-1 bg-flame-yellow rounded-full"></div>
                                          <span>{task.title}</span>
                                        </div>
                                      ))}
                                    {milestone.milestone_tasks.length > 3 && (
                                      <div className="text-xs text-faded-grey italic">
                                        +{milestone.milestone_tasks.length - 3}{" "}
                                        more tasks
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            <div className="flex items-center gap-4 text-xs text-faded-grey mt-3">
                              <div className="flex items-center gap-1">
                                <Trophy className="w-3 h-3" />
                                {milestone.total_reward?.toLocaleString() ||
                                  0}{" "}
                                DG
                              </div>
                              {milestone.duration_hours && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {milestone.duration_hours}h
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Target className="w-12 h-12 text-faded-grey mx-auto mb-4" />
                      <p className="text-faded-grey">
                        Milestones will be available soon
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Program Details */}
              <div className="space-y-8">
                {highlights.length > 0 && (
                  <Card className="p-6 bg-card border-flame-yellow/20">
                    <h3 className="text-xl font-bold mb-4 text-flame-yellow flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Program Highlights
                    </h3>
                    <ul className="space-y-3 text-faded-grey">
                      {highlights.map((highlight) => (
                        <li
                          key={highlight.id}
                          className="flex items-start gap-3"
                        >
                          <div className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2"></div>
                          <span>{highlight.content}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {requirements.length > 0 && (
                  <Card className="p-6 bg-card border-steel-red/20">
                    <h3 className="text-xl font-bold mb-4 text-steel-red flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      Requirements
                    </h3>
                    <ul className="space-y-3 text-faded-grey">
                      {requirements.map((requirement) => (
                        <li
                          key={requirement.id}
                          className="flex items-start gap-3"
                        >
                          <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                          <span>{requirement.content}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Final CTA */}
                <div className="text-center pt-8">
                  {isEnrolledInBootcamp ? (
                    <Button
                      onClick={() =>
                        router.push(`/lobby/bootcamps/${enrolledCohortId}`)
                      }
                      className="group bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 w-full"
                    >
                      Continue Learning
                      <Flame className="ml-2 h-5 w-5 transition-transform group-hover:rotate-12" />
                    </Button>
                  ) : isRegistrationOpen ? (
                    <Button
                      onClick={handleBeginApplication}
                      className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 w-full"
                    >
                      Start Your Web3 Journey
                      <Flame className="ml-2 h-5 w-5 transition-transform group-hover:rotate-12" />
                    </Button>
                  ) : (
                    <div className="bg-faded-grey/20 text-faded-grey font-bold py-4 px-8 rounded-full text-lg cursor-not-allowed w-full text-center">
                      {spotsRemaining <= 0
                        ? "Cohort Full"
                        : timeRemaining === "Registration Closed"
                          ? "Registration Closed"
                          : cohort.status === "upcoming"
                            ? "Registration Opens Soon"
                            : "Not Available"}
                    </div>
                  )}
                  <p className="mt-4 text-sm text-faded-grey">
                    Join {cohort.current_participants} other aspiring Web3
                    enthusiasts
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
