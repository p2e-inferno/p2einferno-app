import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { usePrivy } from "@privy-io/react-auth";
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
import { LobbyCheckinStrip } from "@/components/lobby/checkin-strip";
import LobbyConfirmationModal from "../../components/lobby/LobbyConfirmationModal";
import { LobbyLayout } from "../../components/layouts/lobby-layout";
import { Application } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lobby:index");

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
  const { getAccessToken, authenticated, ready } = usePrivy();
  const { data: dashboardData, loading, error, refetch } = useDashboardData();
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [enrollmentToRemove, setEnrollmentToRemove] = useState<string | null>(
    null,
  );
  const [isRemoving, setIsRemoving] = useState(false);
  const verificationHandledRef = useRef(false);

  // Handle verification callback feedback (success/error) from GoodDollar flow
  useEffect(() => {
    if (!router.isReady) return;
    if (verificationHandledRef.current) return;
    const { verification, message, ...restQuery } = router.query;

    if (verification) {
      const msg =
        typeof message === "string" && message.length > 0
          ? message
          : verification === "success"
            ? "Gooddollar verification completed successfully"
            : "Gooddollar verification failed";

      if (verification === "success") {
        toast.success(msg);
      } else {
        toast.error(msg);
      }

      router.replace(
        {
          pathname: router.pathname,
          query: restQuery,
        },
        undefined,
        { shallow: true },
      );
      verificationHandledRef.current = true;
    }
  }, [router]);

  const handleCompletePayment = async (applicationId: string) => {
    try {
      toast.loading("Redirecting to payment portal...");

      // Navigate to the payment page with the application ID
      await router.push(`/payment/${applicationId}`);

      toast.dismiss();
    } catch (error) {
      log.error("Failed to redirect to payment:", error);
      toast.error("Failed to redirect to payment page");
    }
  };

  const handleRemoveJourney = (enrollmentId: string) => {
    setEnrollmentToRemove(enrollmentId);
    setShowRemoveModal(true);
  };

  const confirmRemoveJourney = async () => {
    if (!enrollmentToRemove) return;

    try {
      setIsRemoving(true);

      const token = await getAccessToken();
      const response = await fetch(
        `/api/user/enrollment/${enrollmentToRemove}/remove`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to remove journey");
      }

      toast.success("Journey removed from lobby");

      // Refresh the dashboard data to update the UI
      await refetch();

      // Close modal and reset state
      setShowRemoveModal(false);
      setEnrollmentToRemove(null);
    } catch (error: any) {
      log.error("Failed to remove journey:", error);
      toast.error(error.message || "Failed to remove journey");
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCloseRemoveModal = () => {
    setShowRemoveModal(false);
    setEnrollmentToRemove(null);
  };

  // Only show loading/error states if user is authenticated
  // If not authenticated, let LobbyLayout handle the wallet connection screen
  if (ready && authenticated) {
    if (loading) {
      return <LobbyLoadingState />;
    }

    if (error || !dashboardData) {
      return <LobbyErrorState onRetry={refetch} />;
    }
  }

  // If user is not authenticated or data not loaded, render LobbyLayout which will show wallet connection
  if (!ready || !authenticated || !dashboardData) {
    return (
      <LobbyLayout>
        <div />
      </LobbyLayout>
    );
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
        {profile.wallet_address && profile.id && (
          <LobbyCheckinStrip
            userAddress={profile.wallet_address}
            userProfileId={profile.id}
          />
        )}
        <StatsGrid stats={stats} />
      </div>

      {pendingApplications.length > 0 && (
        <PendingApplicationsAlert
          pendingApplications={pendingApplications}
          onCompletePayment={handleCompletePayment}
          onRefresh={refetch}
        />
      )}

      <QuickActionsGrid
        userAddress={profile.wallet_address}
        userProfileId={profile.id}
      />

      <CurrentEnrollments
        enrollments={enrollments}
        onRemoveJourney={handleRemoveJourney}
      />

      <LobbyConfirmationModal
        isOpen={showRemoveModal}
        onClose={handleCloseRemoveModal}
        onConfirm={confirmRemoveJourney}
        title="Remove Journey"
        description="Are you sure you want to remove this journey from your lobby? This action will hide it from your dashboard but won't affect your actual enrollment status."
        confirmText="Remove Journey"
        cancelText="Keep Journey"
        variant="danger"
        isLoading={isRemoving}
      />
    </LobbyLayout>
  );
}
