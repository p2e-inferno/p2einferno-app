import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import { MainLayout } from "../../components/layouts/MainLayout";
import { FlameIcon } from "../../components/icons/dashboard-icons";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useBootcamps } from "@/hooks/useBootcamps";
import { BootcampCohortCard } from "@/components/bootcamps/BootcampCohortCard";

/**
 * Bootcamp Listing Page - Shows available bootcamps for authenticated users
 * Route: /apply
 */
export default function BootcampListingPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { data: dashboardData } = useDashboardData();
  const {
    bootcamps,
    loading: bootcampsLoading,
    error: bootcampsError,
  } = useBootcamps();

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
          app?.cohort_id === cohortId && app.payment_status === "pending",
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
              <div className="flex justify-center mb-6"></div>
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
                  <FlameIcon
                    size={60}
                    className="text-faded-grey mx-auto mb-4"
                  />
                  <h3 className="text-xl font-bold mb-2">
                    No Bootcamps Available
                  </h3>
                  <p className="text-faded-grey">
                    Check back soon for new bootcamp programs!
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {bootcamps.map((bootcamp) => (
                    <BootcampCohortCard
                      key={bootcamp.id}
                      bootcamp={bootcamp}
                      getPendingApplication={getPendingApplication}
                      defaultExpanded={true}
                    />
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
