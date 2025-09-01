import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import Link from "next/link";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import {
  FlameIcon,
} from "@/components/icons/dashboard-icons";
import {
  ArrowRight,
  Search,
} from "lucide-react";
import { BootcampCohortCard } from "@/components/bootcamps/BootcampCohortCard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useBootcamps } from "@/hooks/useBootcamps";

/**
 * Lobby Bootcamp Application Page - Shows available bootcamps for authenticated lobby users
 * Route: /lobby/apply
 */
export default function LobbyBootcampListingPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { data: dashboardData } = useDashboardData();
  const { bootcamps, loading: bootcampsLoading, error: bootcampsError } = useBootcamps();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/lobby");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return null;
  }

  if (bootcampsLoading) {
    return (
      <>
        <Head>
          <title>Join Bootcamp - Infernal Lobby</title>
        </Head>
        <LobbyLayout>
          <div className="text-center">
            <FlameIcon size={80} className="text-flame-yellow animate-pulse mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-4">Loading Bootcamps...</h1>
            <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin mx-auto"></div>
          </div>
        </LobbyLayout>
      </>
    );
  }

  if (bootcampsError) {
    return (
      <>
        <Head>
          <title>Join Bootcamp - Infernal Lobby</title>
        </Head>
        <LobbyLayout>
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Bootcamps</h1>
            <p className="text-faded-grey mb-6">{bootcampsError}</p>
            <Link
              href="/lobby"
              className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all"
            >
              <span>Back to Lobby</span>
              <ArrowRight size={18} />
            </Link>
          </div>
        </LobbyLayout>
      </>
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

  // Filter bootcamps based on search query
  const filteredBootcamps = bootcamps.filter((bootcamp) =>
    bootcamp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bootcamp.description.toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <>
      <Head>
        <title>Join Bootcamp - Infernal Lobby</title>
        <meta name="description" content="Join our Web3 bootcamps and start your infernal journey" />
      </Head>

      <LobbyLayout>
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4">
            Join the Infernal Journey
          </h1>
          <p className="text-xl text-faded-grey max-w-2xl mx-auto">
            Transform your Web3 knowledge through our intensive bootcamps designed for every skill level
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-md mx-auto mb-8">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-faded-grey" />
            <input
              type="text"
              placeholder="Search bootcamps..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-background/50 border border-purple-500/20 rounded-xl text-white placeholder-faded-grey focus:outline-none focus:border-flame-yellow/50 transition-colors"
            />
          </div>
        </div>

        {/* Available Bootcamps */}
        <div className="max-w-4xl mx-auto">
          {filteredBootcamps.length === 0 ? (
            <div className="text-center py-12">
              <FlameIcon size={60} className="text-faded-grey mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">
                {searchQuery ? "No bootcamps found" : "No Bootcamps Available"}
              </h3>
              <p className="text-faded-grey">
                {searchQuery ? "Try adjusting your search terms" : "Check back soon for new bootcamp programs!"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredBootcamps.map((bootcamp) => (
                <BootcampCohortCard
                  key={bootcamp.id}
                  bootcamp={bootcamp}
                  getPendingApplication={getPendingApplication}
                  defaultExpanded={false}
                />
              ))}
            </div>
          )}
        </div>
      </LobbyLayout>
    </>
  );
}