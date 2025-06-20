import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import { supabase } from "@/lib/supabase/client";
import type { 
  BootcampProgram, 
  Cohort, 
  CohortMilestone, 
  MilestoneTask,
  ProgramHighlight,
  ProgramRequirement 
} from "@/lib/supabase/types";
import {
  Clock,
  Users,
  Trophy,
  Calendar,
  Target,
  BookOpen,
  Flame,
  ChevronRight,
} from "lucide-react";

interface CohortPageProps {
  bootcampId: string;
  cohortId: string;
}

interface MilestoneWithTasks extends CohortMilestone {
  milestone_tasks: MilestoneTask[];
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
  const [bootcamp, setBootcamp] = useState<BootcampProgram | null>(null);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [milestones, setMilestones] = useState<MilestoneWithTasks[]>([]);
  const [highlights, setHighlights] = useState<ProgramHighlight[]>([]);
  const [requirements, setRequirements] = useState<ProgramRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCohortData();
  }, [bootcampId, cohortId]);

  const fetchCohortData = async () => {
    try {
      setLoading(true);
      
      // Fetch bootcamp details
      const { data: bootcampData, error: bootcampError } = await supabase
        .from("bootcamp_programs")
        .select("*")
        .eq("id", bootcampId)
        .single();

      if (bootcampError) throw bootcampError;

      // Fetch cohort details
      const { data: cohortData, error: cohortError } = await supabase
        .from("cohorts")
        .select("*")
        .eq("id", cohortId)
        .single();

      if (cohortError) throw cohortError;

      // Fetch milestones with tasks
      const { data: milestonesData, error: milestonesError } = await supabase
        .from("cohort_milestones")
        .select(`
          *,
          milestone_tasks (*)
        `)
        .eq("cohort_id", cohortId)
        .order("order_index", { ascending: true });

      if (milestonesError) throw milestonesError;

      // Fetch program highlights
      const { data: highlightsData, error: highlightsError } = await supabase
        .from("program_highlights")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("order_index", { ascending: true });

      if (highlightsError) throw highlightsError;

      // Fetch program requirements
      const { data: requirementsData, error: requirementsError } = await supabase
        .from("program_requirements")
        .select("*")
        .eq("cohort_id", cohortId)
        .order("order_index", { ascending: true });

      if (requirementsError) throw requirementsError;

      setBootcamp(bootcampData);
      setCohort(cohortData);
      setMilestones(milestonesData || []);
      setHighlights(highlightsData || []);
      setRequirements(requirementsData || []);
    } catch (err: any) {
      console.error("Error fetching cohort data:", err);
      setError(err.message || "Failed to load cohort details");
    } finally {
      setLoading(false);
    }
  };

  const handleBeginApplication = () => {
    router.push(`/apply/${cohortId}`);
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

  return (
    <>
      <Head>
        <title>{cohort.name} - {bootcamp.name} - P2E INFERNO Bootcamp</title>
        <meta name="description" content={bootcamp.description} />
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
                {cohort.status === "open" ? "Registration Open" : cohort.status}
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
                  {new Date(cohort.start_date).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}
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

            {/* Urgency Indicator */}
            <div className="inline-flex items-center gap-2 bg-steel-red/20 backdrop-blur-sm border border-steel-red/30 rounded-full px-4 py-2 mb-8">
              <Calendar className="w-4 h-4 text-steel-red" />
              <span className="text-steel-red font-medium text-sm">
                Registration closes:{" "}
                {new Date(cohort.registration_deadline).toLocaleDateString("en-US", {
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
              disabled={cohort.status !== "open" || spotsRemaining <= 0}
              className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 shadow-lg disabled:bg-faded-grey/20 disabled:text-faded-grey disabled:cursor-not-allowed"
            >
              {cohort.status === "open" && spotsRemaining > 0 ? "Begin Application" : 
               spotsRemaining <= 0 ? "Cohort Full" : "Registration Closed"}
              {cohort.status === "open" && spotsRemaining > 0 && (
                <ChevronRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              )}
            </Button>

            <p className="mt-4 text-sm text-faded-grey">
              Secure your spot with a registration fee. Full payment due after acceptance.
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
                  Progress through structured milestones designed to build your Web3 expertise step by step.
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
                            {milestone.milestone_tasks && milestone.milestone_tasks.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-sm font-medium mb-2 text-flame-yellow">
                                  Tasks ({milestone.milestone_tasks.length})
                                </h4>
                                <div className="space-y-1">
                                  {milestone.milestone_tasks
                                    .sort((a, b) => a.order_index - b.order_index)
                                    .slice(0, 3)
                                    .map((task) => (
                                      <div key={task.id} className="flex items-center gap-2 text-xs text-faded-grey">
                                        <div className="w-1 h-1 bg-flame-yellow rounded-full"></div>
                                        <span>{task.title}</span>
                                      </div>
                                    ))}
                                  {milestone.milestone_tasks.length > 3 && (
                                    <div className="text-xs text-faded-grey italic">
                                      +{milestone.milestone_tasks.length - 3} more tasks
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-4 text-xs text-faded-grey mt-3">
                              <div className="flex items-center gap-1">
                                <Trophy className="w-3 h-3" />
                                {milestone.total_reward?.toLocaleString() || 0} DG
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
                      <p className="text-faded-grey">Milestones will be available soon</p>
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
                        <li key={highlight.id} className="flex items-start gap-3">
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
                        <li key={requirement.id} className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 bg-steel-red rounded-full mt-2"></div>
                          <span>{requirement.content}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Final CTA */}
                <div className="text-center pt-8">
                  <Button
                    onClick={handleBeginApplication}
                    disabled={cohort.status !== "open" || spotsRemaining <= 0}
                    className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 w-full disabled:bg-faded-grey/20 disabled:text-faded-grey disabled:cursor-not-allowed"
                  >
                    {cohort.status === "open" && spotsRemaining > 0 ? "Start Your Web3 Journey" : 
                     spotsRemaining <= 0 ? "Cohort Full" : "Registration Closed"}
                    {cohort.status === "open" && spotsRemaining > 0 && (
                      <Flame className="ml-2 h-5 w-5 transition-transform group-hover:rotate-12" />
                    )}
                  </Button>
                  <p className="mt-4 text-sm text-faded-grey">
                    Join {cohort.current_participants} other aspiring Web3 enthusiasts
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