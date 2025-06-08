import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { useQuests } from "@/hooks/useQuests";
import { usePrivy } from "@privy-io/react-auth";
import { useTOSSigning } from "@/hooks/useTOSSigning";
import {
  Flame,
  Coins,
  CheckCircle2,
  Circle,
  Mail,
  Wallet,
  Share2,
  FileSignature,
  Lock,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";

interface TaskWithCompletion {
  task: any;
  completion: any;
  isCompleted: boolean;
  canClaim: boolean;
}

const QuestDetailsPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = usePrivy();
  const {
    quests,
    userProgress,
    completedTasks,
    loading: questsLoading,
    completeTask,
    claimQuestRewards,
    isTaskCompleted,
    getQuestProgress,
    getQuestCompletionPercentage,
    handleLinkEmail,
    handleLinkFarcaster,
    handleSignTOS,
  } = useQuests();
  const { signTOS } = useTOSSigning();

  const [questData, setQuestData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tasksWithCompletion, setTasksWithCompletion] = useState<
    TaskWithCompletion[]
  >([]);
  const [progress, setProgress] = useState(0);
  const [processingTask, setProcessingTask] = useState<string | null>(null);

  useEffect(() => {
    if (id && user) {
      loadQuestDetails();
    }
  }, [id, user]);

  // Helper function to fetch quest details from API
  const fetchQuestDetails = async (questId: string) => {
    try {
      const url = user?.id
        ? `/api/quests/${questId}?userId=${encodeURIComponent(user.id)}`
        : `/api/quests/${questId}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch quest details");
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching quest details:", error);
      throw error;
    }
  };

  // Helper function to start a quest
  const startQuest = async (questId: string) => {
    try {
      const response = await fetch(`/api/quests/${questId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user?.id }),
      });
      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error starting quest:", error);
      return { success: false, error: "Failed to start quest" };
    }
  };

  // Helper function to calculate quest progress percentage
  const calculateQuestProgress = (tasks: any[], completions: any[]) => {
    if (!tasks || tasks.length === 0) return 0;
    const completedCount = tasks.filter((task) =>
      completions.some((completion) => completion.task_id === task.id)
    ).length;
    return Math.round((completedCount / tasks.length) * 100);
  };

  // Helper function to claim task reward
  const claimTaskReward = async (completionId: string) => {
    try {
      const response = await fetch(`/api/quests/claim-task-reward`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ completionId }),
      });
      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Error claiming task reward:", error);
      return { success: false, error: "Failed to claim reward" };
    }
  };

  const loadQuestDetails = async () => {
    setLoading(true);
    try {
      const data = await fetchQuestDetails(id as string);
      if (data) {
        setQuestData(data);

        // Process tasks with completion data
        const tasks = data.quest.quest_tasks || [];
        const completions = data.completions || [];

        const tasksData = tasks.map((task: any) => {
          const completion = completions.find(
            (c: any) => c.task_id === task.id
          );
          return {
            task,
            completion,
            isCompleted: !!completion,
            canClaim: !!completion && !completion.reward_claimed,
          };
        });

        setTasksWithCompletion(
          tasksData.sort((a, b) => a.task.order_index - b.task.order_index)
        );
        setProgress(calculateQuestProgress(tasks, completions));
      }
    } catch (error) {
      console.error("Error loading quest details:", error);
      toast.error("Failed to load quest details");
    } finally {
      setLoading(false);
    }
  };

  const handleStartQuest = async () => {
    const result = await startQuest(id as string);
    if (result.success) {
      toast.success("Quest started! Begin your journey!");
      loadQuestDetails();
    } else {
      toast.error(result.error || "Failed to start quest");
    }
  };

  const handleTaskAction = async (task: any, progressId: string) => {
    setProcessingTask(task.id);

    try {
      let result;

      // Execute task based on type
      switch (task.task_type) {
        case "link_email":
          result = await handleLinkEmail(id as string, task.id);
          break;
        case "link_wallet":
          // Wallet is already linked if user is authenticated
          result = await completeTask(id as string, task.id, {
            wallet: user?.wallet?.address,
          });
          break;
        case "link_farcaster":
          result = await handleLinkFarcaster(id as string, task.id);
          break;
        case "sign_tos":
          const signature = await signTOS();
          if (signature) {
            result = await handleSignTOS(id as string, task.id, signature);
          } else {
            result = {
              success: false,
              error: "Failed to sign Terms of Service",
            };
          }
          break;
        default:
          result = { success: false, error: "Unknown task type" };
      }

      if (result.success || result === true) {
        toast.success("Task completed! 🔥");
        await loadQuestDetails();
      } else {
        toast.error(result.error || "Failed to perform task action");
      }
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error("An error occurred while completing the task");
    } finally {
      setProcessingTask(null);
    }
  };

  const handleClaimReward = async (completionId: string, amount: number) => {
    setProcessingTask(completionId);

    try {
      const result = await claimTaskReward(completionId);
      if (result.success) {
        toast.success(`Claimed ${amount} DG tokens! 🎉`);
        await loadQuestDetails();
      } else {
        toast.error(result.error || "Failed to claim reward");
      }
    } catch (error) {
      console.error("Error claiming reward:", error);
      toast.error("An error occurred while claiming the reward");
    } finally {
      setProcessingTask(null);
    }
  };

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case "link_email":
        return <Mail className="w-6 h-6" />;
      case "link_wallet":
        return <Wallet className="w-6 h-6" />;
      case "link_farcaster":
        return <Share2 className="w-6 h-6" />;
      case "sign_tos":
        return <FileSignature className="w-6 h-6" />;
      default:
        return <Circle className="w-6 h-6" />;
    }
  };

  if (loading || !questData) {
    return (
      <LobbyLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Flame className="w-16 h-16 text-orange-500 animate-pulse mx-auto mb-4" />
            <p className="text-xl text-gray-400">Loading quest details...</p>
          </div>
        </div>
      </LobbyLayout>
    );
  }

  const { quest, progress: questProgress } = questData;
  const isQuestStarted = !!questProgress;
  const isQuestCompleted = progress === 100;

  return (
    <LobbyLayout>
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          {/* Back button */}
          <Link
            href="/lobby/quests"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          {/* Quest Header */}
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-8 border border-gray-700 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-white mb-4 flex items-center">
                  {quest.title}
                  {isQuestCompleted && (
                    <Sparkles className="w-8 h-8 text-green-500 ml-3" />
                  )}
                </h1>
                <p className="text-lg text-gray-400 leading-relaxed">
                  {quest.description}
                </p>
              </div>

              {/* Quest Image */}
              <div className="ml-8 w-32 h-32 rounded-lg overflow-hidden bg-gradient-to-br from-orange-900/20 to-red-900/20 flex-shrink-0">
                {quest.image_url ? (
                  <img
                    src={quest.image_url}
                    alt={quest.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Flame className="w-16 h-16 text-orange-500/50" />
                  </div>
                )}
              </div>
            </div>

            {/* Progress Section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Quest Progress</span>
                <span className="text-2xl font-bold text-orange-400">
                  {progress}%
                </span>
              </div>

              <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-orange-500 to-red-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex justify-between items-center">
                <div className="text-gray-400">
                  {tasksWithCompletion.filter((t) => t.isCompleted).length} of{" "}
                  {tasksWithCompletion.length} tasks completed
                </div>
                <div className="flex items-center text-yellow-400">
                  <Coins className="w-6 h-6 mr-2" />
                  <span className="font-bold text-xl">
                    {quest.total_reward} DG Total
                  </span>
                </div>
              </div>
            </div>

            {/* Start Quest Button */}
            {!isQuestStarted && (
              <button
                onClick={handleStartQuest}
                className="mt-6 w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-4 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 transform hover:scale-105"
              >
                Start Quest
              </button>
            )}
          </div>

          {/* Tasks List */}
          {isQuestStarted && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <Flame className="w-6 h-6 text-orange-500 mr-2" />
                Quest Tasks
              </h2>

              {tasksWithCompletion.map(
                ({ task, completion, isCompleted, canClaim }, index) => (
                  <div
                    key={task.id}
                    className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-6 border transition-all duration-300 ${
                      isCompleted
                        ? "border-green-500/50"
                        : "border-gray-700 hover:border-orange-500/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start flex-1">
                        {/* Task Status Icon */}
                        <div
                          className={`mr-4 mt-1 ${
                            isCompleted ? "text-green-500" : "text-gray-500"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-8 h-8" />
                          ) : (
                            <div className="relative">
                              {getTaskIcon(task.task_type)}
                            </div>
                          )}
                        </div>

                        {/* Task Info */}
                        <div className="flex-1">
                          <h3
                            className={`text-xl font-bold mb-2 ${
                              isCompleted ? "text-green-400" : "text-white"
                            }`}
                          >
                            {task.title}
                          </h3>
                          <p className="text-gray-400 mb-4">
                            {task.description}
                          </p>

                          {/* Task Actions */}
                          {!isCompleted && isQuestStarted && (
                            <button
                              onClick={() =>
                                handleTaskAction(task, questProgress.id)
                              }
                              disabled={processingTask === task.id}
                              className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingTask === task.id
                                ? "Processing..."
                                : "Complete Task"}
                            </button>
                          )}

                          {/* Claim Reward Button */}
                          {canClaim && (
                            <button
                              onClick={() =>
                                handleClaimReward(
                                  completion.id,
                                  task.reward_amount
                                )
                              }
                              disabled={processingTask === completion.id}
                              className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-2 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {processingTask === completion.id
                                ? "Claiming..."
                                : `Claim ${task.reward_amount} DG`}
                            </button>
                          )}

                          {/* Completed Status */}
                          {isCompleted && !canClaim && (
                            <div className="flex items-center text-green-400">
                              <CheckCircle2 className="w-5 h-5 mr-2" />
                              <span className="font-semibold">
                                Completed & Claimed
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reward Display */}
                      <div className="ml-6 text-right">
                        <div className="flex items-center text-yellow-400">
                          <Coins className="w-5 h-5 mr-1" />
                          <span className="font-bold text-lg">
                            +{task.reward_amount} DG
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Quest Completion Message */}
          {isQuestCompleted && (
            <div className="mt-8 bg-gradient-to-r from-green-900/30 to-green-800/30 rounded-xl p-6 border border-green-500/50 text-center">
              <Sparkles className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-green-400 mb-2">
                Quest Complete!
              </h3>
              <p className="text-gray-300">
                Congratulations, Infernal! You have completed all tasks and
                earned your rewards.
              </p>
            </div>
          )}
        </div>
      </div>
    </LobbyLayout>
  );
};

export default QuestDetailsPage;
