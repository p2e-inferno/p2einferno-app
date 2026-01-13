import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import AdminEditPageLayout from "@/components/admin/AdminEditPageLayout";
import TaskList from "@/components/admin/TaskList";
import LockManagerRetryButton from "@/components/admin/LockManagerRetryButton";
import MaxKeysSecurityButton from "@/components/admin/MaxKeysSecurityButton";
import SyncLockStateButton from "@/components/admin/SyncLockStateButton";
import { Calendar, Clock, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CohortMilestone, Cohort } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { useMaxNumberOfKeys } from "@/hooks/unlock/useMaxNumberOfKeys";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import type { Address } from "viem";

const log = getLogger("admin:cohorts:[cohortId]:milestones:[milestoneId]");

interface MilestoneWithCohort extends CohortMilestone {
  cohort: Cohort;
}

/**
 * Render the admin milestone details page with controls to inspect and reconcile on-chain lock state and purchase security.
 *
 * Fetches milestone and cohort data, retrieves the server wallet address, checks on-chain lock manager and maxNumberOfKeys values, and exposes UI actions to retry or synchronize database and on-chain state.
 *
 * @returns A React element displaying milestone and cohort data with status indicators and management actions.
 */
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

  // Use ref to store latest adminFetch function to avoid stale closure issues
  const adminFetchRef = useRef(adminFetch);
  adminFetchRef.current = adminFetch;

  const [milestone, setMilestone] = useState<MilestoneWithCohort | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [actualManagerStatus, setActualManagerStatus] = useState<
    boolean | null
  >(null);
  const [actualMaxKeysValue, setActualMaxKeysValue] = useState<bigint | null>(
    null,
  );

  const { checkIsLockManager } = useIsLockManager();
  const { checkMaxNumberOfKeys } = useMaxNumberOfKeys();

  const fetchMilestone = useCallback(async () => {
    if (!milestoneId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Get milestone data
      const milestoneResult = await adminFetchRef.current<{
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
      const cohortResult = await adminFetchRef.current<{
        success: boolean;
        data: Cohort;
      }>(`/api/admin/cohorts/${milestoneData.cohort_id}`);

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
  // We use adminFetchRef.current to access the latest adminFetch function

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [milestoneId as string | undefined],
    fetcher: fetchMilestone,
  });

  // Fetch server wallet address
  const fetchServerWallet = useCallback(async () => {
    try {
      const result = await adminFetchRef.current<{
        serverWalletAddress: string;
      }>("/api/admin/server-wallet");
      if (result.data?.serverWalletAddress) {
        setServerWalletAddress(result.data.serverWalletAddress);
      }
    } catch (err) {
      log.error("Failed to fetch server wallet address:", err);
    }
  }, []);

  // Check actual lock manager status on blockchain
  const checkActualManagerStatus = useCallback(async () => {
    if (!milestone?.lock_address || !serverWalletAddress) return;

    try {
      const isManager = await checkIsLockManager(
        serverWalletAddress as Address,
        milestone.lock_address as Address,
      );
      setActualManagerStatus(isManager);
    } catch (err) {
      log.error("Failed to check lock manager status:", err);
    }
  }, [milestone?.lock_address, serverWalletAddress, checkIsLockManager]);

  // Check actual maxNumberOfKeys value on blockchain
  const checkActualMaxKeysValue = useCallback(async () => {
    if (!milestone?.lock_address) return;

    try {
      const maxKeys = await checkMaxNumberOfKeys(
        milestone.lock_address as Address,
      );
      setActualMaxKeysValue(maxKeys);
    } catch (err) {
      log.error("Failed to check maxNumberOfKeys:", err);
    }
  }, [milestone?.lock_address, checkMaxNumberOfKeys]);

  useEffect(() => {
    fetchServerWallet();
  }, [fetchServerWallet]);

  useEffect(() => {
    if (milestone?.lock_address && serverWalletAddress) {
      checkActualManagerStatus();
    }
  }, [milestone?.lock_address, serverWalletAddress, checkActualManagerStatus]);

  useEffect(() => {
    if (milestone?.lock_address) {
      checkActualMaxKeysValue();
    }
  }, [milestone?.lock_address, checkActualMaxKeysValue]);

  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchMilestone();
      // Also refresh blockchain status after retry
      if (milestone?.lock_address && serverWalletAddress) {
        checkActualManagerStatus();
      }
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

          {/* Lock Manager Status Display */}
          {milestone.lock_address && serverWalletAddress && (
            <div className="mb-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                Lock Manager Status
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Database Status:</span>
                  <span
                    className={`font-medium ${milestone.lock_manager_granted ? "text-green-400" : "text-red-400"}`}
                  >
                    {milestone.lock_manager_granted
                      ? "✅ Granted"
                      : "❌ Not Granted"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Blockchain Status:</span>
                  <span
                    className={`font-medium ${
                      actualManagerStatus === null
                        ? "text-yellow-400"
                        : actualManagerStatus
                          ? "text-green-400"
                          : "text-red-400"
                    }`}
                  >
                    {actualManagerStatus === null
                      ? "⏳ Checking..."
                      : actualManagerStatus
                        ? "✅ Is Manager"
                        : "❌ Not Manager"}
                  </span>
                </div>
                {actualManagerStatus !== null &&
                  milestone.lock_manager_granted !== actualManagerStatus && (
                    <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700 rounded">
                      <div className="flex flex-col gap-2">
                        <p className="text-amber-300 text-xs font-medium">
                          ⚠️ Status Mismatch: Database and blockchain states
                          don&apos;t match!
                        </p>
                        <SyncLockStateButton
                          mode="manager"
                          entityType="milestone"
                          entityId={milestone.id}
                          lockAddress={milestone.lock_address}
                          onSuccess={() => {
                            fetchMilestone();
                            checkActualManagerStatus();
                          }}
                        />
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

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
              {milestone.lock_address && actualManagerStatus === false && (
                <LockManagerRetryButton
                  entityType="milestone"
                  entityId={milestone.id}
                  lockAddress={milestone.lock_address}
                  grantFailureReason={milestone.grant_failure_reason}
                  onSuccess={() => {
                    toast.success("Database updated successfully");
                    fetchMilestone(); // Refresh milestone data
                    checkActualManagerStatus(); // Refresh blockchain status
                  }}
                  onError={(error) => {
                    toast.error(`Update failed: ${error}`);
                  }}
                />
              )}

              {/* Purchase Security Status Display */}
              {milestone.lock_address && (
                <div className="p-3 rounded-lg border border-slate-700 bg-slate-900">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">
                    Purchase Security Status
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Database Status:</span>
                      <span
                        className={`font-medium ${milestone.max_keys_secured ? "text-green-400" : "text-red-400"}`}
                      >
                        {milestone.max_keys_secured
                          ? "✅ Secured"
                          : "❌ Not Secured"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        Blockchain maxNumberOfKeys:
                      </span>
                      <span
                        className={`font-medium ${
                          actualMaxKeysValue === null
                            ? "text-yellow-400"
                            : actualMaxKeysValue === 0n
                              ? "text-green-400"
                              : "text-red-400"
                        }`}
                      >
                        {actualMaxKeysValue === null
                          ? "⏳ Checking..."
                          : actualMaxKeysValue === 0n
                            ? "✅ Purchases disabled (0)"
                            : `❌ Purchases enabled (${actualMaxKeysValue.toString()})`}
                      </span>
                    </div>
                    {actualMaxKeysValue !== null &&
                      ((milestone.max_keys_secured &&
                        actualMaxKeysValue !== 0n) ||
                        (!milestone.max_keys_secured &&
                          actualMaxKeysValue === 0n)) && (
                        <div className="mt-3 p-3 bg-amber-900/20 border border-amber-700 rounded">
                          <div className="flex flex-col gap-2">
                            <p className="text-amber-300 text-xs font-medium">
                              ⚠️ Status Mismatch: Database and blockchain states
                              don&apos;t match!
                            </p>
                            <SyncLockStateButton
                              entityType="milestone"
                              entityId={milestone.id}
                              lockAddress={milestone.lock_address}
                              onSuccess={() => {
                                fetchMilestone();
                                checkActualMaxKeysValue();
                              }}
                            />
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Purchase Security Button */}
              {milestone.lock_address && actualMaxKeysValue !== 0n && (
                <MaxKeysSecurityButton
                  entityType="milestone"
                  entityId={milestone.id}
                  lockAddress={milestone.lock_address}
                  maxKeysFailureReason={milestone.max_keys_failure_reason}
                  onSuccess={() => {
                    toast.success("Lock purchases disabled successfully");
                    fetchMilestone(); // Refresh milestone data
                    checkActualMaxKeysValue(); // Refresh blockchain status
                  }}
                  onError={(error) => {
                    toast.error(`Security update failed: ${error}`);
                  }}
                />
              )}
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