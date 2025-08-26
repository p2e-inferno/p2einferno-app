import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import Link from "next/link";
import { MainLayout } from "../../components/layouts/MainLayout";
import {
  FlameIcon,
  TrophyIcon,
  CrystalIcon,
} from "../../components/icons/dashboard-icons";
import {
  Clock,
  Users,
  Calendar,
  ArrowRight,
  BookOpen,
  Zap,
  CheckCircle,
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useBootcamps } from "@/hooks/useBootcamps";
import type { BootcampWithCohorts } from "@/lib/supabase/types";

// Helper function to calculate time remaining
function calculateTimeRemaining(deadline: string): string {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - now.getTime();

  if (diff <= 0) return "Registration closed";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} remaining`;
  }

  return `${hours} hour${hours > 1 ? "s" : ""} remaining`;
}

/**
 * Bootcamp Listing Page - Shows available bootcamps for authenticated users
 * Route: /apply
 */
export default function BootcampListingPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { data: dashboardData } = useDashboardData();
  const { bootcamps, loading: bootcampsLoading, error: bootcampsError } = useBootcamps();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return null;
  }

  if (bootcampsLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            <div className="text-center">
              <div className="flex justify-center mb-6">
                <FlameIcon
                  size={80}
                  className="text-flame-yellow animate-pulse"
                />
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4">
                Loading Bootcamps...
              </h1>
              <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (bootcampsError) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            <div className="text-center">
              <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4 text-red-400">
                Error Loading Bootcamps
              </h1>
              <p className="text-lg text-faded-grey">{bootcampsError}</p>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Helper function to check for pending application
  const getPendingApplication = (cohortId: string) => {
    if (dashboardData && dashboardData.applications) {
      return dashboardData.applications.find(
        (app) =>
          app?.cohort_id === cohortId && app.payment_status === "pending"
      );
    }
    return null;
  };

  return (
    <>
      <Head>
        <title>Join Bootcamp - P2E Inferno</title>
        <meta
          name="description"
          content="Join our Web3 bootcamps and start your infernal journey"
        />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="text-center mb-12">
              <div className="flex justify-center mb-6">
                <FlameIcon
                  size={80}
                  className="text-flame-yellow animate-pulse"
                />
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4">
                Join the Infernal Journey
              </h1>
              <p className="text-xl text-faded-grey max-w-2xl mx-auto">
                Transform your Web3 knowledge through our intensive bootcamps
                designed for every skill level
              </p>
            </div>

            {/* Available Bootcamps */}
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold mb-8 text-center">
                Available Bootcamps
              </h2>

              {bootcamps.length === 0 ? (
                <div className="text-center py-12">
                  <FlameIcon size={60} className="text-faded-grey mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">No Bootcamps Available</h3>
                  <p className="text-faded-grey">Check back soon for new bootcamp programs!</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {bootcamps.map((bootcamp) => (
                    <div key={bootcamp.id} className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border border-purple-500/20 overflow-hidden">
                      {/* Bootcamp Header */}
                      <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
                        <div className="flex items-center space-x-4">
                          <div className="p-3 bg-flame-yellow/20 rounded-xl">
                            <FlameIcon size={40} className="text-flame-yellow" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold">{bootcamp.name}</h3>
                            <p className="text-faded-grey">{bootcamp.description}</p>
                          </div>
                        </div>
                      </div>

                      {/* Bootcamp Stats */}
                      <div className="p-6 border-b border-purple-500/20">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="bg-background/30 rounded-xl p-4 text-center">
                            <Calendar size={24} className="text-cyan-400 mx-auto mb-2" />
                            <div className="font-bold">{bootcamp.duration_weeks} Weeks</div>
                            <div className="text-xs text-faded-grey">Duration</div>
                          </div>
                          <div className="bg-background/30 rounded-xl p-4 text-center">
                            <CrystalIcon size={24} className="text-cyan-400 mx-auto mb-2" />
                            <div className="font-bold">{bootcamp.max_reward_dgt.toLocaleString()} DGT</div>
                            <div className="text-xs text-faded-grey">Max Rewards</div>
                          </div>
                          <div className="bg-background/30 rounded-xl p-4 text-center">
                            <Users size={24} className="text-cyan-400 mx-auto mb-2" />
                            <div className="font-bold">{bootcamp.cohorts.length}</div>
                            <div className="text-xs text-faded-grey">Available Cohorts</div>
                          </div>
                        </div>
                      </div>

                      {/* Cohorts Section */}
                      <div className="p-6">
                        <h4 className="text-xl font-bold mb-4">Available Cohorts</h4>
                        {bootcamp.cohorts.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-faded-grey/30 rounded-lg">
                            <p className="text-faded-grey">No cohorts available for this bootcamp yet.</p>
                          </div>
                        ) : (
                          <div className="grid gap-4">
                            {bootcamp.cohorts.map((cohort) => {
                              const timeRemaining = calculateTimeRemaining(cohort.registration_deadline);
                              const spotsRemaining = cohort.max_participants - cohort.current_participants;
                              const isRegistrationOpen = cohort.status === "open";
                              const pendingApplication = getPendingApplication(cohort.id);
                              
                              return (
                                <div key={cohort.id} className="border border-faded-grey/20 rounded-xl p-4">
                                  <div className="flex justify-between items-start mb-4">
                                    <div>
                                      <h5 className="font-bold text-lg">{cohort.name}</h5>
                                      <p className="text-sm text-faded-grey">
                                        {new Date(cohort.start_date).toLocaleDateString()} - {new Date(cohort.end_date).toLocaleDateString()}
                                      </p>
                                    </div>
                                    {cohort.is_enrolled && (
                                      <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1">
                                        <CheckCircle size={16} className="text-green-400" />
                                        <span className="text-green-400 text-sm font-medium">Enrolled</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Status Banner */}
                                  <div className="mb-4">
                                    {cohort.is_enrolled ? (
                                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                        <p className="text-green-400 text-sm font-medium">
                                          ✅ You are enrolled in this cohort
                                        </p>
                                      </div>
                                    ) : isRegistrationOpen ? (
                                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                        <p className="text-green-400 text-sm font-medium">
                                          🟢 Registration Open - {timeRemaining}
                                        </p>
                                      </div>
                                    ) : cohort.status === "upcoming" ? (
                                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                                        <p className="text-blue-400 text-sm font-medium">
                                          🔵 Coming Soon
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                        <p className="text-red-400 text-sm font-medium">
                                          🔴 Registration Closed
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Cohort Stats */}
                                  <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="text-center">
                                      <div className="font-bold">{spotsRemaining}</div>
                                      <div className="text-xs text-faded-grey">Spots Left</div>
                                    </div>
                                    <div className="text-center">
                                      <div className="font-bold">₦{cohort.naira_amount?.toLocaleString() || 'TBD'}</div>
                                      <div className="text-xs text-faded-grey">Cost (NGN)</div>
                                    </div>
                                  </div>

                                  {/* CTA */}
                                  <div className="text-center">
                                    {cohort.is_enrolled ? (
                                      <Link
                                        href={`/lobby/bootcamps/${cohort.id}`}
                                        className="inline-flex items-center space-x-3 bg-green-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-700 transition-all duration-300"
                                      >
                                        <span>Enter Bootcamp</span>
                                        <ArrowRight size={18} />
                                      </Link>
                                    ) : isRegistrationOpen ? (
                                      pendingApplication ? (
                                        <Link
                                          href={`/payment/${pendingApplication.id}`}
                                          className="inline-flex items-center space-x-3 bg-orange-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-700 transition-all duration-300"
                                        >
                                          <span>Complete Payment</span>
                                          <ArrowRight size={18} />
                                        </Link>
                                      ) : (
                                        <Link
                                          href={`/apply/${cohort.id}`}
                                          className="inline-flex items-center space-x-3 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all duration-300"
                                        >
                                          <span>Apply Now</span>
                                          <ArrowRight size={18} />
                                        </Link>
                                      )
                                    ) : (
                                      <div className="inline-flex items-center space-x-3 bg-gray-600 text-gray-300 px-6 py-3 rounded-xl font-medium cursor-not-allowed">
                                        <span>
                                          {cohort.status === "upcoming" ? "Coming Soon" : "Registration Closed"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}
