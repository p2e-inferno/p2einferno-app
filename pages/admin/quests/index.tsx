import { useState, useEffect } from "react";
import AdminListPageLayout from "@/components/admin/AdminListPageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase/client";
import { Pencil, Eye, Trash2, Coins, CheckCircle2, Users } from "lucide-react";
import Link from "next/link";
import type { Quest } from "@/lib/supabase/types";

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch quests with their tasks
      const { data: questsData, error: questsError } = await supabase
        .from("quests")
        .select(`
          *,
          quest_tasks!quest_tasks_quest_id_fkey (
            id,
            title,
            reward_amount,
            task_type,
            requires_admin_review
          )
        `)
        .order("created_at", { ascending: false });

      if (questsError) throw questsError;

      // Fetch quest statistics
      const { data: statsData, error: statsError } = await supabase
        .from("quest_statistics")
        .select("*");

      if (statsError) throw statsError;

      // Combine quests with their statistics
      const questsWithStats = (questsData || []).map(quest => {
        const stats = statsData?.find(s => s.quest_id === quest.id);
        return {
          ...quest,
          stats: stats ? {
            total_users: stats.total_users || 0,
            completed_users: stats.completed_users || 0,
            pending_submissions: stats.pending_submissions || 0,
            completion_rate: stats.completion_rate || 0
          } : undefined
        };
      });

      setQuests(questsWithStats);
    } catch (err: any) {
      console.error("Error fetching quests:", err);
      setError(err.message || "Failed to load quests");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleQuestStatus = async (quest: Quest) => {
    try {
      const { error } = await supabase
        .from("quests")
        .update({ is_active: !quest.is_active })
        .eq("id", quest.id);

      if (error) throw error;

      // Refresh quests
      fetchQuests();
    } catch (err: any) {
      console.error("Error toggling quest status:", err);
      setError(err.message || "Failed to update quest status");
    }
  };

  const deleteQuest = async (questId: string) => {
    if (!window.confirm("Are you sure you want to delete this quest? This action cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("quests")
        .delete()
        .eq("id", questId);

      if (error) throw error;

      // Refresh quests
      fetchQuests();
    } catch (err: any) {
      console.error("Error deleting quest:", err);
      setError(err.message || "Failed to delete quest");
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
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && quests.length === 0}
      emptyStateTitle="No quests found"
      emptyStateMessage="Create your first quest to engage users"
    >
      <div className="grid gap-6">
        {quests.map((quest) => (
          <div
            key={quest.id}
            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 hover:border-gray-600 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start space-x-4 flex-1">
                {quest.image_url && (
                  <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                    <img
                      src={quest.image_url}
                      alt={quest.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-white">{quest.title}</h3>
                    <Badge className={quest.is_active ? "bg-green-600" : "bg-gray-600"}>
                      {quest.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {quest.stats && quest.stats.pending_submissions > 0 && (
                      <Badge className="bg-orange-600">
                        {quest.stats.pending_submissions} Pending Reviews
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-400 mb-3 line-clamp-2">{quest.description}</p>
                  
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
                        <span className="text-gray-300">{quest.stats.total_users} users</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-gray-300">{quest.stats.completed_users} completed</span>
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
                  <span className="font-bold text-lg">{quest.total_reward} DG</span>
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
                className={quest.is_active ? "border-gray-700 hover:border-orange-500" : "border-gray-700 hover:border-green-500"}
                onClick={() => toggleQuestStatus(quest)}
              >
                {quest.is_active ? "Deactivate" : "Activate"}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="border-gray-700 hover:border-red-500 hover:text-red-500"
                onClick={() => deleteQuest(quest.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </AdminListPageLayout>
  );
}