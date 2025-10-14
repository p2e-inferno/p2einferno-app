import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import TaskList from "@/components/admin/TaskList";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import { Calendar, Clock, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CohortMilestone, Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";

const log = getLogger("admin:cohorts:[cohortId]:milestones:[milestoneId]");

interface MilestoneWithCohort extends CohortMilestone {
  cohort: Cohort;
}

export default function MilestoneDetailsPage() {
  const { authenticated, isAdmin, isLoadingAuth, user } = useAdminAuthContext();
  const router = useRouter();
  // Correctly read the dynamic route params
  const { cohortId, milestoneId } = router.query as {
    cohortId?: string;
    milestoneId?: string;
  };
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({ suppressToasts: true }), []);
  const { adminFetch } = useAdminApi(adminApiOptions);

  const [milestone, setMilestone] = useState<MilestoneWithCohort | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMilestone = useCallback(async () => {
    if (!milestoneId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Get milestone data
      const milestoneResult = await adminFetch<{
        success: boolean;
        data: CohortMilestone;
      }>(`/api/admin/milestones?milestone_id=${milestoneId}`);

      if (milestoneResult.error) {
        throw new Error(milestoneResult.error);
      }

      const milestoneData = milestoneResult.data?.data;
      if (!milestoneData) {
        throw new Error("Milestone not found");
      }

      // Get cohort data
      const cohortResult = await adminFetch<{ success: boolean; data: Cohort }>(
        `/api/admin/cohorts/${milestoneData.cohort_id}`,
      );

      if (cohortResult.error) {
        throw new Error(cohortResult.error);
      }

      const cohortData = cohortResult.data?.data;
      if (!cohortData) {
        throw new Error("Cohort not found");
      }

      // Combine the data
      const combinedMilestone: MilestoneWithCohort = {
        ...milestoneData,
        cohort: cohortData,
      };

      // Debug logging for lock manager grant status
      log.info("Milestone data loaded", {
        milestoneId: combinedMilestone.id,
        hasLockAddress: !!combinedMilestone.lock_address,
        lockAddress: combinedMilestone.lock_address,
        lockManagerGranted: combinedMilestone.lock_manager_granted,
        lockManagerGrantedType: typeof combinedMilestone.lock_manager_granted,
        grantFailureReason: combinedMilestone.grant_failure_reason,
        grantFailureReasonPresent: Boolean(
          combinedMilestone.grant_failure_reason,
        ),
        shouldShowRetryButton:
          !!combinedMilestone.lock_address &&
          combinedMilestone.lock_manager_granted === false,
        // Diagnostic helpers
        diag: {
          condHasLock: Boolean(combinedMilestone.lock_address),
          condExplicitFalse: combinedMilestone.lock_manager_granted === false,
          condLooseNotTrue:
            !!combinedMilestone.lock_address &&
            combinedMilestone.lock_manager_granted !== true,
        },
      });

      setMilestone(combinedMilestone);
    } catch (err: any) {
      log.error("Error fetching milestone:", err);
      setError(err.message || "Failed to load milestone");
    } finally {
      setIsLoading(false);
    }
  }, [milestoneId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: adminFetch is intentionally excluded from dependencies to prevent infinite re-renders
  // caused by useAdminFetchOnce re-triggering when adminFetch changes

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [milestoneId as string | undefined],
    fetcher: fetchMilestone,
  });

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchMilestone();
    } finally {
      setIsRetrying(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <AdminEditPageLayout
      title={milestone ? milestone.name : "Milestone Details"}
      backLinkHref={
        cohortId ? `/admin/cohorts/${cohortId}/milestones` : "/admin/cohorts"
      }
      backLinkText="Back to milestones"
      isLoading={isLoadingAuth || isLoading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
    >
      {milestone && (
        <div className="space-y-6">
          <div className="mb-6">
            <p className="text-gray-400">{milestone.cohort?.name}</p>
          </div>

          {/* Milestone Overview */}
          <Card className="bg-card border-gray-800">
            <CardHeader>
              <CardTitle className="text-white">Milestone Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-300 leading-relaxed">
                {milestone.description}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <Clock className="w-5 h-5 text-flame-yellow" />
                  <div>
                    <p className="text-sm text-gray-400">Duration</p>
                    <p className="text-white font-semibold">
                      {milestone.duration_hours || 0} hours
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <Trophy className="w-5 h-5 text-flame-yellow" />
                  <div>
                    <p className="text-sm text-gray-400">Total Reward</p>
                    <p className="text-white font-semibold">
                      {milestone.total_reward?.toLocaleString() || 0} DG
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <Calendar className="w-5 h-5 text-flame-yellow" />
                  <div>
                    <p className="text-sm text-gray-400">Start Date</p>
                    <p className="text-white font-semibold">
                      {milestone.start_date
                        ? formatDate(milestone.start_date)
                        : "Not set"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <Calendar className="w-5 h-5 text-flame-yellow" />
                  <div>
                    <p className="text-sm text-gray-400">End Date</p>
                    <p className="text-white font-semibold">
                      {milestone.end_date
                        ? formatDate(milestone.end_date)
                        : "Not set"}
                    </p>
                  </div>
                </div>
              </div>

              {milestone.prerequisite_milestone_id && (
                <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
                  <p className="text-blue-300 text-sm">
                    <strong>Prerequisite:</strong> This milestone requires
                    completion of a previous milestone.
                  </p>
                </div>
              )}

              {milestone.lock_address && (
                <div className="p-3 bg-purple-900/20 border border-purple-700 rounded-lg">
                  <p className="text-purple-300 text-sm">
                    <strong>Lock Address:</strong> {milestone.lock_address}
                  </p>
                </div>
              )}

              {/* Lock Manager Grant Retry Button */}
              {(() => {
                const shouldShow =
                  milestone.lock_address &&
                  milestone.lock_manager_granted === false;
                log.debug("LockManagerRetryButton render check", {
                  milestoneId: milestone.id,
                  hasLockAddress: !!milestone.lock_address,
                  lockManagerGranted: milestone.lock_manager_granted,
                  lockManagerGrantedType: typeof milestone.lock_manager_granted,
                  shouldShow,
                  condition1: !!milestone.lock_address,
                  condition2: milestone.lock_manager_granted === false,
                });
                return shouldShow ? (
                  <LockManagerRetryButton
                    entityType="milestone"
                    entityId={milestone.id}
                    lockAddress={milestone.lock_address}
                    grantFailureReason={milestone.grant_failure_reason}
                    onSuccess={() => {
                      toast.success("Database updated successfully");
                      fetchMilestone(); // Refresh milestone data
                    }}
                    onError={(error) => {
                      toast.error(`Update failed: ${error}`);
                    }}
                  />
                ) : null;
              })()}
            </CardContent>
          </Card>

          {/* Tasks Section */}
          <Card className="bg-card border-gray-800">
            <CardContent className="p-6">
              <TaskList
                milestoneId={milestone.id}
                milestoneName={milestone.name}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </AdminEditPageLayout>
  );
}
