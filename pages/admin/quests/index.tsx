import { useState, useEffect, useCallback } from "react";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { Pencil, Eye, Trash2, Coins, CheckCircle2, Users } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { Quest } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { getLogger } from "@/lib/utils/logger";
import { toast } from "react-hot-toast";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const log = getLogger("admin:quests:index");

interface QuestWithStats extends Quest {
  stats?: {
    total_users: number;
    completed_users: number;
    pending_submissions: number;
    completion_rate: number;
  };
}

export default function AdminQuestsPage() {
  const [quests, setQuests] = useState<QuestWithStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    questId: string;
    questTitle: string;
  }>({
    isOpen: false,
    questId: "",
    questTitle: "",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState<string | null>(null);
  const { adminFetch, loading } = useAdminApi({ suppressToasts: true });
  const { getAccessToken } = usePrivy();
  const selectedWallet = useSmartWalletSelection();
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchQuests = useCallback(async () => {
    try {
      setError(null);

      // Fetch quests via adminFetch
      const result = await adminFetch<{ success: boolean; data: Quest[] }>(
        "/api/admin/quests",
      );

      if (result.error) {
        throw new Error(result.error);
      }

      // Extract the data from the nested response structure - now includes stats
      const questsWithStats = result.data?.data || [];

      setQuests(Array.isArray(questsWithStats) ? questsWithStats : []);
    } catch (err: any) {
      log.error("Error fetching quests:", err);
      setError(err.message || "Failed to load quests");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchQuests();
  }, [fetchQuests]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetchQuests();
    } finally {
      setIsRetrying(false);
    }
  };

  const toggleQuestStatus = async (quest: Quest) => {
    try {
      setError(null);
      const result = await adminFetch(`/api/admin/quests/${quest.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !quest.is_active }),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Refresh quests
      fetchQuests();
    } catch (err: any) {
      log.error("Error toggling quest status:", err);
      setError(err.message || "Failed to update quest status");
    }
  };

  const openDeleteConfirmation = async (quest: Quest) => {
    setCheckingDelete(quest.id);
    try {
      // Get auth token for direct fetch (avoids triggering global loading state)
      const accessToken = await getAccessToken();

      if (!accessToken) {
        toast.error("Authentication required");
        return;
      }

      // Direct fetch - doesn't trigger global loading state
      const response = await fetch(
        `/api/admin/quests/${quest.id}/can-delete`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Active-Wallet": selectedWallet?.address || "",
          },
          credentials: "include",
        },
      );

      if (!response.ok) {
        toast.error("Failed to verify delete status");
        return;
      }

      const result = await response.json();

      if (!result.canDelete) {
        // Show error toast instead of modal
        toast.error(result.message || "Cannot delete this quest", {
          duration: 5000,
        });
        return;
      }

      // Deletion is allowed, show confirmation modal
      setDeleteConfirmation({
        isOpen: true,
        questId: quest.id,
        questTitle: quest.title,
      });
    } catch (err: any) {
      log.error("Error checking delete status:", err);
      toast.error("Failed to verify delete status");
    } finally {
      setCheckingDelete(null);
    }
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({
      isOpen: false,
      questId: "",
      questTitle: "",
    });
    setIsDeleting(false);
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsDeleting(true);
      const result = await adminFetch(
        `/api/admin/quests/${deleteConfirmation.questId}`,
        {
          method: "DELETE",
        },
      );

      if (result.error) {
        throw new Error(result.error);
      }

      toast.success("Quest deleted successfully!");
      await fetchQuests();
      closeDeleteConfirmation();
    } catch (err: any) {
      log.error("Error deleting quest:", err);
      toast.error(err.message || "Failed to delete quest");
      closeDeleteConfirmation();
    } finally {
      setIsDeleting(false);
    }
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case "submit_url":
      case "submit_text":
      case "submit_proof":
        return "📝";
      case "link_email":
        return "📧";
      case "link_wallet":
        return "👛";
      case "link_farcaster":
        return "🔗";
      case "sign_tos":
        return "📄";
      default:
        return "✅";
    }
  };

  return (
    <AdminListPageLayout
      title="Quest Management"
      newButtonText="Create Quest"
      newButtonLink="/admin/quests/new"
      isLoading={loading}
      error={error}
      onRetry={handleRetry}
      isRetrying={isRetrying}
      isEmpty={!loading && !error && quests.length === 0}
      emptyStateTitle="No quests found"
      emptyStateMessage="Create your first quest to engage users"
    >
      <div className="grid gap-4 md:gap-6">
        {quests.map((quest) => (
          <div
            key={quest.id}
            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4 md:p-6 border border-gray-700 hover:border-gray-600 transition-all"
          >
            {/* Mobile Layout - Stack vertically */}
            <div className="md:hidden">
              {/* Header with image and title */}
              <div className="flex items-start gap-3 mb-3">
                {quest.image_url && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                    <Image
                      src={quest.image_url}
                      alt={quest.title}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-1 leading-tight">
                    {quest.title}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      className={
                        quest.is_active ? "bg-green-600" : "bg-gray-600"
                      }
                    >
                      {quest.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {quest.stats && quest.stats.pending_submissions > 0 && (
                      <Badge className="bg-orange-600 text-xs">
                        {quest.stats.pending_submissions} Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Reward info */}
              <div className="flex justify-between items-center mb-3 p-3 bg-gray-800/50 rounded-lg">
                <div className="flex items-center text-yellow-400">
                  <Coins className="w-4 h-4 mr-1" />
                  <span className="font-bold text-base">
                    {quest.total_reward} DG
                  </span>
                </div>
                <div className="text-xs text-gray-400">
                  {quest.quest_tasks?.length || 0} tasks
                </div>
              </div>

              {/* Description */}
              <p className="text-gray-400 text-sm mb-3 leading-relaxed">
                {quest.description}
              </p>

              {/* Quest Tasks Preview */}
              <div className="flex flex-wrap gap-1 mb-3">
                {quest.quest_tasks?.slice(0, 4).map((task) => (
                  <div
                    key={task.id}
                    className="bg-gray-800 px-2 py-1 rounded-full text-xs text-gray-300 flex items-center gap-1"
                  >
                    <span>{getTaskTypeIcon(task.task_type)}</span>
                    <span className="truncate max-w-20">{task.title}</span>
                    {task.requires_admin_review && (
                      <span className="text-orange-400">⚡</span>
                    )}
                  </div>
                ))}
                {quest.quest_tasks && quest.quest_tasks.length > 4 && (
                  <div className="bg-gray-800 px-2 py-1 rounded-full text-xs text-gray-400">
                    +{quest.quest_tasks.length - 4} more
                  </div>
                )}
              </div>

              {/* Quest Stats */}
              {quest.stats && (
                <div className="grid grid-cols-3 gap-2 text-xs mb-4 p-2 bg-gray-800/30 rounded">
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <Users className="w-3 h-3 text-gray-400" />
                    </div>
                    <span className="text-gray-300 block">
                      {quest.stats.total_users}
                    </span>
                    <span className="text-gray-500">users</span>
                  </div>
                  <div className="text-center">
                    <div className="flex justify-center mb-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                    </div>
                    <span className="text-gray-300 block">
                      {quest.stats.completed_users}
                    </span>
                    <span className="text-gray-500">completed</span>
                  </div>
                  <div className="text-center">
                    <span className="text-gray-300 block">
                      {quest.stats.completion_rate}%
                    </span>
                    <span className="text-gray-500">completion</span>
                  </div>
                </div>
              )}

              {/* Action Buttons - Stack on mobile */}
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/admin/quests/${quest.id}`} className="flex">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-blue-500 w-full justify-center"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    <span className="text-xs">View</span>
                  </Button>
                </Link>

                <Link href={`/admin/quests/${quest.id}/edit`} className="flex">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-flame-yellow w-full justify-center"
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    <span className="text-xs">Edit</span>
                  </Button>
                </Link>

                <Button
                  size="sm"
                  variant="outline"
                  className={`w-full justify-center text-xs ${quest.is_active ? "border-gray-700 hover:border-orange-500" : "border-gray-700 hover:border-green-500"}`}
                  onClick={() => toggleQuestStatus(quest)}
                >
                  {quest.is_active ? "Deactivate" : "Activate"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-700 hover:border-red-500 hover:text-red-500 w-full justify-center"
                  onClick={() => openDeleteConfirmation(quest)}
                  disabled={checkingDelete === quest.id}
                >
                  <Trash2
                    className={`h-3 w-3 ${checkingDelete === quest.id ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            </div>

            {/* Desktop Layout - Original horizontal layout */}
            <div className="hidden md:block">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start space-x-4 flex-1">
                  {quest.image_url && (
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                      <Image
                        src={quest.image_url}
                        alt={quest.title}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">
                        {quest.title}
                      </h3>
                      <Badge
                        className={
                          quest.is_active ? "bg-green-600" : "bg-gray-600"
                        }
                      >
                        {quest.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {quest.stats && quest.stats.pending_submissions > 0 && (
                        <Badge className="bg-orange-600">
                          {quest.stats.pending_submissions} Pending Reviews
                        </Badge>
                      )}
                    </div>
                    <p className="text-gray-400 mb-3 line-clamp-2">
                      {quest.description}
                    </p>

                    {/* Quest Tasks Preview */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {quest.quest_tasks?.slice(0, 5).map((task) => (
                        <div
                          key={task.id}
                          className="bg-gray-800 px-3 py-1 rounded-full text-xs text-gray-300 flex items-center gap-1"
                        >
                          <span>{getTaskTypeIcon(task.task_type)}</span>
                          <span>{task.title}</span>
                          {task.requires_admin_review && (
                            <span className="text-orange-400">⚡</span>
                          )}
                        </div>
                      ))}
                      {quest.quest_tasks && quest.quest_tasks.length > 5 && (
                        <div className="bg-gray-800 px-3 py-1 rounded-full text-xs text-gray-400">
                          +{quest.quest_tasks.length - 5} more
                        </div>
                      )}
                    </div>

                    {/* Quest Stats */}
                    {quest.stats && (
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">
                            {quest.stats.total_users} users
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-gray-300">
                            {quest.stats.completed_users} completed
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-300">
                            {quest.stats.completion_rate}% completion rate
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Reward */}
                <div className="text-right ml-4">
                  <div className="flex items-center text-yellow-400 mb-2">
                    <Coins className="w-5 h-5 mr-1" />
                    <span className="font-bold text-lg">
                      {quest.total_reward} DG
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {quest.quest_tasks?.length || 0} tasks
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-700">
                <Link href={`/admin/quests/${quest.id}`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-blue-500"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Button>
                </Link>

                <Link href={`/admin/quests/${quest.id}/edit`}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 hover:border-flame-yellow"
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </Link>

                <Button
                  size="sm"
                  variant="outline"
                  className={
                    quest.is_active
                      ? "border-gray-700 hover:border-orange-500"
                      : "border-gray-700 hover:border-green-500"
                  }
                  onClick={() => toggleQuestStatus(quest)}
                >
                  {quest.is_active ? "Deactivate" : "Activate"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-700 hover:border-red-500 hover:text-red-500"
                  onClick={() => openDeleteConfirmation(quest)}
                  disabled={checkingDelete === quest.id}
                >
                  <Trash2
                    className={`h-4 w-4 ${checkingDelete === quest.id ? 'animate-spin' : ''}`}
                  />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={closeDeleteConfirmation}
        onConfirm={handleDeleteConfirm}
        title="Delete Quest"
        description={`Are you sure you want to delete "${deleteConfirmation.questTitle}"? This action cannot be undone and will permanently remove the quest and all associated data.`}
        confirmText="Delete Quest"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </AdminListPageLayout>
  );
}
