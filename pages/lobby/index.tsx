import React from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { useDashboardData } from "../../hooks/useDashboardData";
import {
  WelcomeSection,
  StatsGrid,
  PendingApplicationsAlert,
  QuickActionsGrid,
  CurrentEnrollments,
  LobbyLoadingState,
  LobbyErrorState,
} from "../../components/lobby";
import { LobbyLayout } from "../../components/layouts/lobby-layout";
import { Application } from "@/lib/supabase";

// Add interface to match component requirements
interface PendingApplication {
  id: string;
  application_id: string; // Add this field for the actual application ID
  status: string;
  created_at: string;
  applications: Application;
}

/**
 * Infernal Lobby - Main dashboard for authenticated users
 * Provides access to bootcamps, events, quests, and user progress
 * Route: /lobby
 */
export default function LobbyPage() {
  const router = useRouter();
  const { data: dashboardData, loading, error, refetch } = useDashboardData();

  const handleCompletePayment = async (applicationId: string) => {
    try {
      toast.loading("Redirecting to payment portal...");

      // Navigate to the payment page with the application ID
      await router.push(`/payment/${applicationId}`);

      toast.dismiss();
    } catch (error) {
      console.error("Failed to redirect to payment:", error);
      toast.error("Failed to redirect to payment page");
    }
  };

  if (loading) {
    return <LobbyLoadingState />;
  }

  if (error || !dashboardData) {
    return <LobbyErrorState onRetry={refetch} />;
  }

  const { profile, applications, enrollments, stats } = dashboardData;
  // Convert applications to the expected PendingApplication format
  const pendingApplications: PendingApplication[] = (applications as any[])
    .filter((app: any) => app.applications?.payment_status === "pending")
    .map((app: any) => ({
      id: app.id, // user_application_status ID
      application_id: app.application_id, // actual application ID for API calls
      status: app.applications?.payment_status || "pending",
      created_at: app.created_at,
      applications: app.applications,
    }));

  return (
    <LobbyLayout>
      {/* Welcome Section */}
      <div className="mb-8">
        <WelcomeSection profile={profile} />
        <StatsGrid stats={stats} />
      </div>

      {pendingApplications.length > 0 && (
        <PendingApplicationsAlert
          pendingApplications={pendingApplications}
          onCompletePayment={handleCompletePayment}
          onRefresh={refetch}
        />
      )}

      <QuickActionsGrid />

      <CurrentEnrollments enrollments={enrollments} />
    </LobbyLayout>
  );
}
