import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import { toast } from "react-hot-toast";
import { BottomDock } from "../../components/dashboard/bottom-dock";
import { useDashboardDataSimple } from "../../hooks/useDashboardDataSimple";
import {
  LobbyBackground,
  LobbyNavigation,
  WelcomeSection,
  StatsGrid,
  PendingApplicationsAlert,
  QuickActionsGrid,
  CurrentEnrollments,
  LobbyLoadingState,
  LobbyErrorState,
} from "../../components/lobby";

/**
 * Infernal Lobby - Main dashboard for authenticated users
 * Provides access to bootcamps, events, quests, and user progress
 * Route: /lobby
 */
export default function LobbyPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const {
    data: dashboardData,
    loading,
    error,
    refetch,
  } = useDashboardDataSimple();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  const handleCompletePayment = async (applicationId: string) => {
    toast.success("Redirecting to payment portal...");
    // TODO: Implement payment completion flow
  };

  if (!ready || !authenticated) {
    return null;
  }

  if (loading) {
    return <LobbyLoadingState />;
  }

  if (error || !dashboardData) {
    return <LobbyErrorState onRetry={refetch} />;
  }

  const { profile, applications, enrollments, stats } = dashboardData;
  const pendingApplications = applications.filter(
    (app) => app.status === "pending"
  );

  return (
    <>
      <Head>
        <title>Infernal Lobby - P2E Inferno</title>
        <meta
          name="description"
          content="Your gateway to the P2E Inferno metaverse"
        />
      </Head>

      <div
        className="min-h-screen text-white overflow-x-hidden"
        style={{ backgroundColor: "#100F29" }}
      >
        <LobbyBackground />
        <LobbyNavigation />

        {/* Main Content */}
        <main className="relative z-10 px-4 lg:px-8 pb-32">
          <div className="max-w-6xl mx-auto">
            {/* Welcome Section */}
            <div className="mb-8">
              <WelcomeSection profile={profile} />
              <StatsGrid stats={stats} />
            </div>

            {pendingApplications.length > 0 && (
              <PendingApplicationsAlert
                pendingApplications={pendingApplications}
                onCompletePayment={handleCompletePayment}
              />
            )}

            <QuickActionsGrid />

            <CurrentEnrollments enrollments={enrollments} />
          </div>
        </main>

        <BottomDock />
      </div>
    </>
  );
}
