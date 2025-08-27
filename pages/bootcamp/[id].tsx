import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Clock, Users, Trophy, Calendar, ChevronRight } from "lucide-react";

interface BootcampData {
  id: string;
  name: string;
  description: string;
  duration_weeks: number;
  max_reward_dgt: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
  cohorts: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    max_participants: number;
    current_participants: number;
    registration_deadline: string;
    status: "open" | "closed" | "upcoming";
    usdt_amount?: number;
    naira_amount?: number;
  }[];
}

interface BootcampPageProps {
  bootcampId: string;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const bootcampId = params?.id as string;

  if (!bootcampId) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      bootcampId,
    },
  };
};

export default function BootcampPage({ bootcampId }: BootcampPageProps) {
  const router = useRouter();
  const [bootcamp, setBootcamp] = useState<BootcampData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBootcampData();
  }, [bootcampId]);

  const fetchBootcampData = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/bootcamps/${bootcampId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch bootcamp");
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || "Failed to fetch bootcamp");
      }

      setBootcamp(result.data);
    } catch (err: any) {
      console.error("Error fetching bootcamp data:", err);
      setError(err.message || "Failed to load bootcamp details");
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

  const handleJoinCohort = (cohortId: string) => {
    router.push(`/bootcamp/${bootcampId}/cohort/${cohortId}`);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flame-yellow mx-auto"></div>
            <p className="mt-4 text-faded-grey">Loading bootcamp details...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !bootcamp) {
    return (
      <MainLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400">
              Error: {error || "Bootcamp not found"}
            </p>
            <Button
              onClick={() => router.push("/")}
              className="mt-4"
              variant="outline"
            >
              Go Home
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <Head>
        <title>{bootcamp.name} - P2E INFERNO Bootcamp</title>
        <meta name="description" content={bootcamp.description} />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        {/* Hero Section */}
        <section
          className="relative min-h-[60vh] flex items-center justify-center overflow-hidden"
          style={{
            backgroundImage:
              "url('https://via.placeholder.com/1920x1080/1a1a1a/444444?text=Bootcamp+Hero')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
        >
          <div className="absolute inset-0 z-0">
            <div className="absolute top-0 left-0 w-64 h-64 bg-steel-red/20 rounded-full filter blur-3xl opacity-50 animate-blob"></div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-flame-yellow/20 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
          </div>

          <div className="relative z-10 container mx-auto text-center px-4 text-white">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-heading mb-6 tracking-tighter">
              {bootcamp.name}
            </h1>

            <p className="max-w-3xl mx-auto text-lg md:text-xl mb-8 leading-relaxed">
              {bootcamp.description}
            </p>

            {/* Key Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
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
                <div className="text-2xl font-bold">{bootcamp.cohorts.length}</div>
                <div className="text-sm text-faded-grey">Cohorts Available</div>
              </div>
            </div>
          </div>
        </section>

        {/* Cohorts Section */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
                Available Cohorts
              </h2>
              <p className="text-lg text-faded-grey max-w-2xl mx-auto">
                Choose from our available cohorts and start your Web3 learning
                journey
              </p>
            </div>

            {bootcamp.cohorts.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-card/50 border border-faded-grey/20 rounded-lg p-8 max-w-md mx-auto">
                  <Calendar className="w-12 h-12 text-faded-grey mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2 text-faded-grey">
                    No Cohorts Available
                  </h3>
                  <p className="text-faded-grey">
                    New cohorts will be announced soon. Check back later!
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {bootcamp.cohorts.map((cohort) => {
                  const spotsRemaining =
                    cohort.max_participants - cohort.current_participants;
                  const timeRemaining = calculateTimeRemaining(
                    cohort.registration_deadline
                  );
                  const isOpen = cohort.status === "open" && spotsRemaining > 0 && timeRemaining !== "Registration Closed";

                  return (
                    <Card
                      key={cohort.id}
                      className="relative bg-gradient-to-br from-steel-red/5 via-background to-flame-yellow/5 border-steel-red/20 hover:border-flame-yellow/50 transition-all duration-300 transform hover:-translate-y-1"
                    >
                      {/* Status Badge */}
                      <div className="absolute top-4 right-4 z-10">
                        <div
                          className={`inline-flex items-center gap-2 backdrop-blur-sm border rounded-full px-3 py-1 ${
                            isOpen
                              ? "bg-green-500/20 border-green-500/30"
                              : cohort.status === "upcoming"
                              ? "bg-blue-500/20 border-blue-500/30"
                              : "bg-red-500/20 border-red-500/30"
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full ${
                              isOpen
                                ? "bg-green-500 animate-pulse"
                                : cohort.status === "upcoming"
                                ? "bg-blue-500"
                                : "bg-red-500"
                            }`}
                          ></div>
                          <span
                            className={`font-medium text-sm ${
                              isOpen ? "text-green-400" : cohort.status === "upcoming" ? "text-blue-400" : "text-red-400"
                            }`}
                          >
                            {isOpen ? "Open" : 
                             cohort.status === "upcoming" ? "Coming Soon" :
                             spotsRemaining <= 0 ? "Full" :
                             timeRemaining === "Registration Closed" ? "Closed" : 
                             cohort.status.charAt(0).toUpperCase() + cohort.status.slice(1)}
                          </span>
                        </div>
                      </div>

                      <CardHeader className="pb-6">
                        <div className="mb-4">
                          <CardTitle className="text-xl font-bold mb-2 text-flame-yellow">
                            {cohort.name}
                          </CardTitle>
                          <div className="text-sm text-faded-grey">
                            {new Date(cohort.start_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}{" "}
                            -{" "}
                            {new Date(cohort.end_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </div>
                        </div>

                        {/* Cohort Stats */}
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-center border border-faded-grey/20">
                            <Users className="w-4 h-4 text-flame-yellow mx-auto mb-1" />
                            <div className="text-lg font-bold">
                              {spotsRemaining}
                            </div>
                            <div className="text-xs text-faded-grey">
                              Spots Left
                            </div>
                          </div>
                          <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 text-center border border-faded-grey/20">
                            <Calendar className="w-4 h-4 text-flame-yellow mx-auto mb-1" />
                            <div className="text-sm font-bold">
                              {timeRemaining.split(" ")[0]}
                            </div>
                            <div className="text-xs text-faded-grey">
                              {timeRemaining.includes("day")
                                ? "Days Left"
                                : timeRemaining.includes("Closed")
                                ? "Closed"
                                : "Status"}
                            </div>
                          </div>
                        </div>

                        {/* Registration Deadline */}
                        <div className="bg-background/60 backdrop-blur-sm rounded-lg p-3 mb-6 border border-faded-grey/20">
                          <div className="text-center">
                            <div className="text-sm font-medium">
                              Registration Deadline
                            </div>
                            <div className="text-xs text-faded-grey">
                              {new Date(
                                cohort.registration_deadline
                              ).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </div>
                          </div>
                        </div>

                        {/* CTA Button */}
                        <Button
                          onClick={() => handleJoinCohort(cohort.id)}
                          disabled={!isOpen || spotsRemaining <= 0}
                          className={`group w-full font-bold py-3 transition-all transform hover:scale-105 ${
                            isOpen && spotsRemaining > 0
                              ? "bg-steel-red hover:bg-steel-red/90 text-white"
                              : "bg-faded-grey/20 text-faded-grey cursor-not-allowed"
                          }`}
                        >
                          {isOpen && spotsRemaining > 0
                            ? "Join Cohort"
                            : spotsRemaining <= 0
                            ? "Cohort Full"
                            : "Registration Closed"}
                          {isOpen && spotsRemaining > 0 && (
                            <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                          )}
                        </Button>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </MainLayout>
    </>
  );
}
