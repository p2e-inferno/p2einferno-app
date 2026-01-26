import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { useAdminApi } from "@/hooks/useAdminApi";
import type { CohortMilestone } from "@/lib/supabase/types";
import MilestoneFormEnhanced from "./MilestoneFormEnhanced";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { NetworkError } from "@/components/ui/network-error";
import { getLogger } from "@/lib/utils/logger";
import { PendingLockManagerBadge } from "@/components/admin/PendingLockManagerBadge";
import { MaxKeysSecurityBadge } from "@/components/admin/MaxKeysSecurityBadge";
import { TransferabilitySecurityBadge } from "@/components/admin/TransferabilitySecurityBadge";
import { RichText } from "@/components/common/RichText";

const log = getLogger("admin:MilestoneList");

interface MilestoneListProps {
  cohortId: string;
}

export default function MilestoneList({ cohortId }: MilestoneListProps) {
  const [milestones, setMilestones] = useState<CohortMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [editingMilestone, setEditingMilestone] =
    useState<CohortMilestone | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [deletingMilestone, setDeletingMilestone] =
    useState<CohortMilestone | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { adminFetch } = useAdminApi({ suppressToasts: true });

  // Fetch milestones
  const fetchMilestones = async () => {
    try {
      setIsLoading(true);
      const result = await adminFetch<{
        success: boolean;
        data: CohortMilestone[];
      }>(`/api/admin/milestones?cohort_id=${cohortId}`);

      if (result.error) {
        throw new Error(result.error);
      }

      setMilestones(result.data?.data || []);
    } catch (err: any) {
      log.error("Error fetching milestones:", err);
      setError(err.message || "Failed to load milestones");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchMilestones();
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    fetchMilestones();
  }, [cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update milestone order
  const updateMilestoneOrder = async (
    milestone: CohortMilestone,
    direction: "up" | "down",
  ) => {
    const currentIndex = milestones.findIndex((m) => m.id === milestone.id);
    if (
      (direction === "up" && currentIndex === 0) ||
      (direction === "down" && currentIndex === milestones.length - 1)
    ) {
      return; // Already at the edge, can't move further
    }

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const targetMilestone = milestones[newIndex];

    if (!targetMilestone) {
      log.error("Target milestone not found");
      return;
    }

    const currentOrderIndex = milestone.order_index;

    try {
      // Update the target milestone order
      const targetResult = await adminFetch<{
        success?: boolean;
        error?: string;
      }>("/api/admin/milestones", {
        method: "PUT",
        body: JSON.stringify({
          id: targetMilestone.id,
          order_index: currentOrderIndex,
          cohort_id: cohortId,
        }),
      });
      if (targetResult.error) {
        throw new Error(
          targetResult.error || "Failed to update milestone order",
        );
      }

      // Update the current milestone order
      const currentResult = await adminFetch<{
        success?: boolean;
        error?: string;
      }>("/api/admin/milestones", {
        method: "PUT",
        body: JSON.stringify({
          id: milestone.id,
          order_index: targetMilestone.order_index,
          cohort_id: cohortId,
        }),
      });
      if (currentResult.error) {
        throw new Error(
          currentResult.error || "Failed to update milestone order",
        );
      }

      // Refresh the milestone list
      fetchMilestones();
    } catch (err: any) {
      log.error("Error updating milestone order:", err);
      setError(err.message || "Failed to update milestone order");
    }
  };

  // Delete milestone
  const handleDeleteClick = (milestone: CohortMilestone) => {
    setDeletingMilestone(milestone);
  };

  const confirmDeleteMilestone = async () => {
    if (!deletingMilestone) return;

    try {
      setIsDeleting(true);

      const result = await adminFetch<{ success?: boolean; error?: string }>(
        `/api/admin/milestones?id=${deletingMilestone.id}`,
        {
          method: "DELETE",
          body: JSON.stringify({ cohort_id: cohortId }),
        },
      );

      if (result.error) {
        throw new Error(result.error || "Failed to delete milestone");
      }

      // Refresh the milestone list
      fetchMilestones();
      setDeletingMilestone(null);
    } catch (err: any) {
      log.error("Error deleting milestone:", err);
      setError(err.message || "Failed to delete milestone");
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeletingMilestone(null);
    setIsDeleting(false);
  };

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {error && (
        <NetworkError
          error={error}
          onRetry={handleRetry}
          isRetrying={isRetrying}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {!editingMilestone && !isCreatingNew && (
            <div className="flex justify-end">
              <Button
                onClick={() => setIsCreatingNew(true)}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Milestone
              </Button>
            </div>
          )}

          {isCreatingNew && !editingMilestone && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-4">
                Create New Milestone
              </h3>
              <MilestoneFormEnhanced
                cohortId={cohortId}
                onSubmitSuccess={() => {
                  setIsCreatingNew(false);
                  fetchMilestones();
                }}
                onCancel={() => setIsCreatingNew(false)}
                existingMilestones={milestones}
              />
            </div>
          )}

          {editingMilestone && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-white mb-4">
                Edit Milestone
              </h3>
              <MilestoneFormEnhanced
                cohortId={cohortId}
                milestone={editingMilestone}
                existingMilestones={milestones.filter(
                  (m) => m.id !== editingMilestone.id,
                )}
                onSubmitSuccess={() => {
                  setEditingMilestone(null);
                  fetchMilestones();
                }}
                onCancel={() => setEditingMilestone(null)}
              />
            </div>
          )}

          {milestones.length === 0 && !isCreatingNew ? (
            <div className="bg-gray-900/30 border border-gray-800 rounded-lg p-8 text-center">
              <h3 className="text-lg font-medium text-white mb-2">
                No Milestones Yet
              </h3>
              <p className="text-gray-400 mb-6">
                Create milestones to track cohort progress through the program
              </p>
              <Button
                onClick={() => setIsCreatingNew(true)}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create First Milestone
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400 w-10">
                      #
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Name
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Period
                    </th>
                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-400">
                      Prerequisites
                    </th>
                    <th className="py-3 px-4 text-right text-sm font-medium text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone, index) => (
                    <tr
                      key={milestone.id}
                      className="border-b border-gray-800 hover:bg-gray-900"
                    >
                      <td className="py-4 px-4 text-sm text-gray-400">
                        {index + 1}
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{milestone.name}</p>
                            <PendingLockManagerBadge
                              lockAddress={milestone.lock_address}
                              lockManagerGranted={
                                milestone.lock_manager_granted
                              }
                              reason={milestone.grant_failure_reason}
                            />
                            <MaxKeysSecurityBadge
                              lockAddress={milestone.lock_address}
                              maxKeysSecured={milestone.max_keys_secured}
                              reason={milestone.max_keys_failure_reason}
                            />
                            <TransferabilitySecurityBadge
                              lockAddress={milestone.lock_address}
                              transferabilitySecured={
                                milestone.transferability_secured
                              }
                              reason={milestone.transferability_failure_reason}
                            />
                          </div>
                          <RichText
                            content={milestone.description}
                            className="text-gray-400 text-xs mt-1 max-w-xs truncate"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        {milestone.start_date && milestone.end_date ? (
                          <span>
                            {formatDate(milestone.start_date)} -{" "}
                            {formatDate(milestone.end_date)}
                          </span>
                        ) : (
                          <span className="text-gray-500">Not scheduled</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-sm text-white">
                        {milestone.prerequisite_milestone_id ? (
                          milestones.find(
                            (m) => m.id === milestone.prerequisite_milestone_id,
                          )?.name || "Unknown milestone"
                        ) : (
                          <span className="text-gray-500">None</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <Link
                            href={`/admin/cohorts/${cohortId}/milestones/${milestone.id}`}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-gray-700 hover:border-blue-500 hover:text-blue-400"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-flame-yellow"
                            onClick={() => setEditingMilestone(milestone)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-cyan-500"
                            onClick={() =>
                              updateMilestoneOrder(milestone, "up")
                            }
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-cyan-500"
                            onClick={() =>
                              updateMilestoneOrder(milestone, "down")
                            }
                            disabled={index === milestones.length - 1}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            className="border-gray-700 hover:border-red-500 hover:text-red-500"
                            onClick={() => handleDeleteClick(milestone)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={!!deletingMilestone}
        onClose={cancelDelete}
        onConfirm={confirmDeleteMilestone}
        title="Delete Milestone"
        description={
          deletingMilestone
            ? `Are you sure you want to delete "${deletingMilestone.name}"? This action cannot be undone and will also delete all associated tasks and submissions.`
            : ""
        }
        confirmText="Delete Milestone"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
