import { useState, useEffect } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Clock,
  Database,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  getPendingDeployments,
  getDrafts,
  removePendingDeployment,
  removeDraft,
  getDeploymentStats,
  clearAllDeploymentState,
  incrementDeploymentRetry,
  type PendingDeployment,
  type DeploymentDraft,
} from "@/lib/utils/lock-deployment-state";
import { useAdminApi } from "@/hooks/useAdminApi";
import { getLogger } from "@/lib/utils/logger";
import { showDismissibleError } from "@/components/ui/dismissible-toast";

const log = getLogger("admin:draft-recovery");

/**
 * Page UI for managing and recovering pending deployments and draft entities.
 *
 * Provides a dashboard that loads and displays pending deployments, saved drafts,
 * and basic statistics; supports recovering pending deployments into the database
 * (with type-specific validation and task creation), deleting individual pending
 * deployments or drafts, and clearing all deployment state. Data is loaded on mount
 * and refreshed every 30 seconds.
 *
 * @returns The React element rendering the Draft Recovery admin interface
 */
export default function DraftRecoveryPage() {
  const [pendingDeployments, setPendingDeployments] = useState<
    PendingDeployment[]
  >([]);
  const [drafts, setDrafts] = useState<DeploymentDraft[]>([]);
  const [isRecovering, setIsRecovering] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const adminApi = useAdminApi({
    redirectOnAuthError: false,
    showAuthErrorModal: true,
    suppressToasts: true, // We'll handle error toasts manually with dismissible versions
  });

  // Load data on mount and set up refresh interval
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = () => {
    const pending = getPendingDeployments();
    const draftData = getDrafts();
    const statistics = getDeploymentStats();

    setPendingDeployments(pending);
    setDrafts(draftData);
    setStats(statistics);

    log.info("Draft recovery data loaded:", {
      pending: pending.length,
      drafts: draftData.length,
      stats: statistics,
    });
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeSince = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  };

  const recoverPendingDeployment = async (deployment: PendingDeployment) => {
    if (isRecovering) return;

    setIsRecovering(deployment.id);

    try {
      // Generate new UUID for the entity if needed
      const entityData = { ...deployment.entityData };
      if (!entityData.id) {
        entityData.id = crypto.randomUUID();
      }

      // Prepare API data based on entity type
      const apiData = {
        ...entityData,
        lock_address: deployment.lockAddress, // Use the deployed lock address
        updated_at: new Date().toISOString(),
        created_at: entityData.created_at || new Date().toISOString(),
      };

      // Sanitize: Convert empty strings to null for optional UUID fields
      // PostgreSQL rejects empty strings for UUID columns
      const uuidFields = [
        "prerequisite_milestone_id",
        "cohort_id",
        "bootcamp_program_id",
      ];
      uuidFields.forEach((field) => {
        if (apiData[field] === "") {
          apiData[field] = null;
        }
      });

      const endpoints = {
        bootcamp: "/api/admin/bootcamps",
        cohort: "/api/admin/cohorts",
        quest: "/api/admin/quests-v2", // v2 API handles tasks in POST body
        milestone: "/api/admin/milestones",
      };

      const endpoint = endpoints[deployment.entityType];
      if (!endpoint) {
        throw new Error(`Unknown entity type: ${deployment.entityType}`);
      }

      // Validate and resolve cohort-specific requirements using lock addresses
      if (deployment.entityType === "cohort") {
        const cohortData = apiData as any;

        // Fetch all bootcamps to resolve parent relationship
        const bootcampsResponse = await adminApi.adminFetch<{
          success: boolean;
          data?: any[];
        }>("/api/admin/bootcamps");

        if (!bootcampsResponse.data?.data) {
          throw new Error("Failed to fetch bootcamps for validation");
        }

        const bootcamps = bootcampsResponse.data.data;

        // Try to find the parent bootcamp by UUID first
        let parentBootcamp = bootcamps.find(
          (b: any) => b.id === cohortData.bootcamp_program_id,
        );

        // If not found by UUID, try to match by lock address from a parent bootcamp property
        // (This would require storing parent lock address in entityData - future enhancement)
        if (!parentBootcamp && cohortData.parent_bootcamp_lock_address) {
          parentBootcamp = bootcamps.find(
            (b: any) =>
              b.lock_address === cohortData.parent_bootcamp_lock_address,
          );
        }

        // If still not found, throw helpful error with available bootcamps
        if (!parentBootcamp) {
          const availableBootcamps = bootcamps
            .map((b: any) => `- ${b.name} (Lock: ${b.lock_address})`)
            .join("\n");

          throw new Error(
            `Cannot recover cohort: Parent bootcamp not found.\n\n` +
              `Stored bootcamp_program_id: ${cohortData.bootcamp_program_id}\n\n` +
              `Available bootcamps:\n${availableBootcamps}\n\n` +
              `This cohort needs to be manually linked to one of the above bootcamps. ` +
              `To fix: Expand the entity data below, note the bootcamp lock address you want, ` +
              `find that bootcamp's current ID above, then manually edit the JSON and change ` +
              `"bootcamp_program_id" to the correct ID, then retry recovery.`,
          );
        }

        // Update the bootcamp_program_id to the current UUID (lock address-based lookup)
        apiData.bootcamp_program_id = parentBootcamp.id;

        log.info("Resolved cohort parent bootcamp:", {
          originalId: cohortData.bootcamp_program_id,
          resolvedId: parentBootcamp.id,
          bootcampName: parentBootcamp.name,
          bootcampLockAddress: parentBootcamp.lock_address,
        });
      }

      // Validate and resolve milestone-specific requirements using lock addresses
      if (deployment.entityType === "milestone") {
        const milestoneData = apiData as any;

        // Milestones reference cohorts, which can also have UUID mismatches after DB reset
        if (milestoneData.cohort_id) {
          // Fetch cohorts to resolve parent relationship
          const cohortsResponse = await adminApi.adminFetch<{
            success: boolean;
            data?: any[];
          }>("/api/admin/cohorts");

          if (cohortsResponse.data?.data) {
            const cohorts = cohortsResponse.data.data;

            // Try to find parent cohort by UUID first
            let parentCohort = cohorts.find(
              (c: any) => c.id === milestoneData.cohort_id,
            );

            // If not found by UUID, try by lock address
            if (!parentCohort && milestoneData.parent_cohort_lock_address) {
              parentCohort = cohorts.find(
                (c: any) =>
                  c.lock_address === milestoneData.parent_cohort_lock_address,
              );
            }

            if (!parentCohort) {
              const availableCohorts = cohorts
                .map((c: any) => `- ${c.name} (Lock: ${c.lock_address})`)
                .join("\n");

              throw new Error(
                `Cannot recover milestone: Parent cohort not found.\n\n` +
                  `Stored cohort_id: ${milestoneData.cohort_id}\n\n` +
                  `Available cohorts:\n${availableCohorts}\n\n` +
                  `Delete this pending deployment or manually update the cohort_id.`,
              );
            }

            // Update cohort_id to current UUID
            apiData.cohort_id = parentCohort.id;

            log.info("Resolved milestone parent cohort:", {
              originalId: milestoneData.cohort_id,
              resolvedId: parentCohort.id,
              cohortName: parentCohort.name,
              cohortLockAddress: parentCohort.lock_address,
            });
          }
        }
      }

      log.info(`Attempting to recover ${deployment.entityType}:`, {
        deploymentId: deployment.id,
        lockAddress: deployment.lockAddress,
        hasId: !!apiData.id,
        hasName: !!apiData.name,
        hasBootcampProgramId: !!(apiData as any).bootcamp_program_id,
        hasCohortId: !!(apiData as any).cohort_id,
        apiDataKeys: Object.keys(apiData),
      });

      // Extract milestone tasks (they need to be created separately via milestone-tasks API)
      // Quest tasks are kept in apiData - the quests-v2 API handles them automatically
      const milestoneTasks =
        deployment.entityType === "milestone" && (apiData as any).tasks
          ? (apiData as any).tasks
          : null;

      // Remove tasks from milestone apiData before sending to POST
      // (milestone API doesn't accept tasks field, but quests-v2 does)
      if (deployment.entityType === "milestone") {
        delete (apiData as any).tasks;
      }

      const response = await adminApi.adminFetch<{
        success: boolean;
        data?: any;
        error?: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify(apiData),
      });

      if (response.error) {
        // Increment retry count but don't remove deployment yet
        incrementDeploymentRetry(deployment.id);
        throw new Error(response.error);
      }

      if (!response.data?.success) {
        incrementDeploymentRetry(deployment.id);
        throw new Error(response.data?.error || "Failed to recover deployment");
      }

      if (response.data) {
        // For milestones, also create tasks if they exist
        if (
          deployment.entityType === "milestone" &&
          milestoneTasks &&
          milestoneTasks.length > 0
        ) {
          const createdMilestoneId = response.data.data?.id;
          if (createdMilestoneId) {
            log.info("Creating milestone tasks during recovery", {
              milestoneId: createdMilestoneId,
              taskCount: milestoneTasks.length,
            });

            // Prepare tasks with the new milestone_id
            const tasksToCreate = milestoneTasks.map((task: any) => ({
              ...task,
              milestone_id: createdMilestoneId,
              // Remove any old IDs to avoid conflicts
              id: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

            try {
              const tasksResponse = await adminApi.adminFetch<{
                success: boolean;
                data?: any;
                error?: string;
              }>("/api/admin/milestone-tasks", {
                method: "POST",
                body: JSON.stringify(tasksToCreate),
              });

              if (tasksResponse.error || !tasksResponse.data?.success) {
                log.warn("Failed to create milestone tasks during recovery", {
                  error: tasksResponse.error,
                  milestoneId: createdMilestoneId,
                });
                toast(
                  "Milestone recovered but tasks failed to create. You can add them manually.",
                  {
                    icon: "⚠️",
                  },
                );
              } else {
                log.info("Successfully created milestone tasks", {
                  milestoneId: createdMilestoneId,
                  createdCount: tasksResponse.data.data?.length || 0,
                });
              }
            } catch (taskError: any) {
              log.error("Error creating milestone tasks", {
                error: taskError,
                milestoneId: createdMilestoneId,
              });
              toast(
                "Milestone recovered but tasks failed to create. You can add them manually.",
                {
                  icon: "⚠️",
                },
              );
            }
          }
        }

        // Success! Remove pending deployment
        removePendingDeployment(deployment.id);
        toast.success(`Successfully recovered ${deployment.entityType}!`);

        // Refresh data
        loadData();
      }
    } catch (error: any) {
      log.error("Recovery failed:", error);
      showDismissibleError(`Recovery failed: ${error.message}`);

      // Refresh data to update retry count
      loadData();
    } finally {
      setIsRecovering(null);
    }
  };

  const deletePendingDeployment = (deploymentId: string) => {
    if (
      confirm(
        "Are you sure you want to delete this pending deployment? This will NOT affect the deployed lock on the blockchain.",
      )
    ) {
      removePendingDeployment(deploymentId);
      toast.success("Pending deployment removed");
      loadData();
    }
  };

  const deleteDraft = (entityType: string) => {
    if (confirm(`Are you sure you want to delete the ${entityType} draft?`)) {
      removeDraft(entityType as any);
      toast.success("Draft removed");
      loadData();
    }
  };

  const clearAllData = () => {
    if (
      confirm(
        "Are you sure you want to clear ALL drafts and pending deployments? This action cannot be undone.",
      )
    ) {
      clearAllDeploymentState();
      toast.success("All deployment state cleared");
      loadData();
    }
  };

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto space-y-4 lg:space-y-6 px-4 lg:px-0">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl lg:text-2xl font-bold text-white">
              Draft Recovery
            </h1>
            <p className="text-gray-400 mt-1 text-sm lg:text-base">
              Manage orphaned locks and recover from failed database operations
            </p>
          </div>
          <Button
            onClick={clearAllData}
            variant="destructive"
            className="bg-red-600 hover:bg-red-700 flex-shrink-0"
            size="sm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All
          </Button>
        </div>

        {/* Statistics */}
        {stats && (
          <Card className="bg-card border border-gray-800 p-4 lg:p-6">
            <h2 className="text-base lg:text-lg font-semibold text-white mb-4">
              Statistics
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-xl lg:text-2xl font-bold text-red-400">
                  {stats.pendingCount}
                </div>
                <div className="text-xs lg:text-sm text-gray-400">
                  Pending Deployments
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl lg:text-2xl font-bold text-yellow-400">
                  {stats.draftCount}
                </div>
                <div className="text-xs lg:text-sm text-gray-400">Drafts</div>
              </div>
              <div className="text-center">
                <div className="text-xl lg:text-2xl font-bold text-blue-400">
                  {stats.pendingByType.bootcamp}
                </div>
                <div className="text-xs lg:text-sm text-gray-400">
                  Bootcamp Locks
                </div>
              </div>
              <div className="text-center">
                <div className="text-xl lg:text-2xl font-bold text-green-400">
                  {stats.pendingByType.quest}
                </div>
                <div className="text-xs lg:text-sm text-gray-400">
                  Quest Locks
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Pending Deployments */}
        <Card className="bg-card border border-gray-800 p-4 lg:p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="h-4 lg:h-5 w-4 lg:w-5 text-red-400 mr-2" />
            <h2 className="text-base lg:text-lg font-semibold text-white">
              Pending Deployments ({pendingDeployments.length})
            </h2>
          </div>

          {pendingDeployments.length === 0 ? (
            <p className="text-gray-400">No pending deployments found.</p>
          ) : (
            <div className="space-y-4">
              {pendingDeployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="border border-gray-700 rounded-lg p-3 lg:p-4 space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge
                          variant="outline"
                          className="bg-red-900/20 border-red-700 text-red-300 text-xs"
                        >
                          {deployment.entityType}
                        </Badge>
                        {deployment.retryCount > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-yellow-900/20 border-yellow-700 text-yellow-300 text-xs"
                          >
                            {deployment.retryCount} retries
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-medium text-white text-sm lg:text-base">
                        {deployment.entityData?.name ||
                          `${deployment.entityType} deployment`}
                      </h3>
                      <p className="text-xs lg:text-sm text-gray-400 mt-1 break-all">
                        Lock:{" "}
                        <span className="font-mono text-blue-300">
                          {deployment.lockAddress}
                        </span>
                      </p>
                      <p className="text-xs lg:text-sm text-gray-400">
                        Created: {formatTimestamp(deployment.timestamp)} (
                        {getTimeSince(deployment.timestamp)})
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
                      {deployment.blockExplorerUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            window.open(deployment.blockExplorerUrl, "_blank")
                          }
                          className="border-gray-700 text-gray-300 hover:bg-gray-800 p-2 lg:px-3"
                          title="View on block explorer"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => recoverPendingDeployment(deployment)}
                        disabled={isRecovering === deployment.id}
                        className="bg-green-600 hover:bg-green-700 text-xs lg:text-sm"
                        title="Recover deployment to database"
                      >
                        {isRecovering === deployment.id ? (
                          <>
                            <div className="mr-1 lg:mr-2 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"></div>
                            <span className="hidden sm:inline">
                              Recovering...
                            </span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          <>
                            <Database className="h-4 w-4 mr-1 lg:mr-2" />
                            <span className="hidden sm:inline">Recover</span>
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deletePendingDeployment(deployment.id)}
                        className="bg-red-600 hover:bg-red-700 p-2 lg:px-3"
                        title="Delete pending deployment (won't affect blockchain lock)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {deployment.entityData && (
                    <details className="text-xs lg:text-sm">
                      <summary className="cursor-pointer text-gray-400 hover:text-white">
                        View entity data
                      </summary>
                      <pre className="mt-2 p-2 lg:p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">
                        {JSON.stringify(deployment.entityData, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Drafts */}
        <Card className="bg-card border border-gray-800 p-4 lg:p-6">
          <div className="flex items-center mb-4">
            <Clock className="h-4 lg:h-5 w-4 lg:w-5 text-yellow-400 mr-2" />
            <h2 className="text-base lg:text-lg font-semibold text-white">
              Drafts ({drafts.length})
            </h2>
          </div>

          {drafts.length === 0 ? (
            <p className="text-gray-400 text-sm lg:text-base">
              No drafts found.
            </p>
          ) : (
            <div className="space-y-4">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="border border-gray-700 rounded-lg p-3 lg:p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <Badge
                          variant="outline"
                          className="bg-yellow-900/20 border-yellow-700 text-yellow-300 text-xs"
                        >
                          {draft.entityType}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-white text-sm lg:text-base">
                        {draft.formData?.name || `${draft.entityType} draft`}
                      </h3>
                      <p className="text-xs lg:text-sm text-gray-400">
                        Created: {formatTimestamp(draft.timestamp)} (
                        {getTimeSince(draft.timestamp)})
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteDraft(draft.entityType)}
                      className="bg-red-600 hover:bg-red-700 p-2 lg:px-3 flex-shrink-0"
                      title="Delete draft"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <details className="text-xs lg:text-sm">
                    <summary className="cursor-pointer text-gray-400 hover:text-white">
                      View draft data
                    </summary>
                    <pre className="mt-2 p-2 lg:p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(draft.formData, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}