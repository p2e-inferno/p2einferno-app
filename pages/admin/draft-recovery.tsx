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

const log = getLogger("admin:draft-recovery");

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
      if (deployment.entityType === "bootcamp" && !entityData.id) {
        entityData.id = crypto.randomUUID();
      }

      // Prepare API data based on entity type
      const apiData = {
        ...entityData,
        lock_address: deployment.lockAddress, // Use the deployed lock address
        updated_at: new Date().toISOString(),
        created_at: entityData.created_at || new Date().toISOString(),
      };

      const endpoints = {
        bootcamp: "/api/admin/bootcamps",
        cohort: "/api/admin/cohorts",
        quest: "/api/admin/quests",
        milestone: "/api/admin/milestones",
      };

      const endpoint = endpoints[deployment.entityType];
      if (!endpoint) {
        throw new Error(`Unknown entity type: ${deployment.entityType}`);
      }

      log.info(`Attempting to recover ${deployment.entityType}:`, {
        deploymentId: deployment.id,
        lockAddress: deployment.lockAddress,
        apiData,
      });

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
        // Success! Remove pending deployment
        removePendingDeployment(deployment.id);
        toast.success(`Successfully recovered ${deployment.entityType}!`);

        // Refresh data
        loadData();
      }
    } catch (error: any) {
      log.error("Recovery failed:", error);
      toast.error(`Recovery failed: ${error.message}`);

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
