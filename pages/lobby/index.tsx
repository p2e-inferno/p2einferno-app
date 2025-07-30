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
  needsReconciliation?: boolean; // Flag for data inconsistencies
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
  // Include applications that need attention (pending payment OR data inconsistencies)
  const pendingApplications: PendingApplication[] = (applications as any[])
    .filter((app: any) => {
      const paymentStatus = app.applications?.payment_status;
      const userAppStatus = app.status; // user_application_status.status

      // Show if payment is pending OR there's a status mismatch
      return (
        paymentStatus === "pending" ||
        (paymentStatus === "completed" && userAppStatus === "pending")
      );
    })
    .map((app: any) => {
      const paymentStatus = app.applications?.payment_status;
      const userAppStatus = app.status;
      const needsReconciliation = paymentStatus !== userAppStatus;

      return {
        id: app.id, // user_application_status ID
        application_id: app.application_id, // actual application ID for API calls
        status: paymentStatus || "pending",
        created_at: app.created_at,
        applications: app.applications,
        needsReconciliation,
      };
    });

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
