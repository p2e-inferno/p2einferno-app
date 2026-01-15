import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { usePrivy } from "@privy-io/react-auth";
import { useTOSSigning } from "@/hooks/useTOSSigning"; // Keep for signTOS logic
import {
  Flame, // Keep for main loading icon
  // Coins, CheckCircle2, Circle, Mail, Wallet, Share2, FileSignature, Sparkles, // Moved to components
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  claimActivationRewardRequest,
  completeQuestRequest,
  claimTaskRewardRequest,
  completeQuestTaskRequest,
  startQuestRequest,
} from "@/lib/quests/client";

// Import the new components
import QuestHeader from "@/components/quests/QuestHeader";
import TaskItem from "@/components/quests/TaskItem";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lobby:quests:[id]");

// Assuming types for Task, TaskCompletion would be defined or imported,
// similar to those in TaskItem.tsx. For this refactor, we'll rely on `any`
// for some parts of questData if specific types aren't readily available at this scope.
// Ideally, these would be imported from e.g. "@/lib/supabase/types" or a dedicated quests types file.

interface TaskWithCompletion {
  task: any; // Should be Task type
  completion: any; // Should be TaskCompletion type
  isCompleted: boolean;
  canClaim: boolean;
}

const QuestDetailsPage = () => {
  const router = useRouter();
  const { id: questId } = router.query; // Renamed for clarity
  const { user } = usePrivy();
  // useQuests hook is not directly used here anymore for rendering, but its functions might be (or similar logic)
  // For this refactor, we'll keep the existing data fetching and action functions within this page,
  // and pass them down to the new components.
  const { signTOS } = useTOSSigning();

  const [questData, setQuestData] = useState<any>(null); // Should be a specific QuestDetail type
  const [loading, setLoading] = useState(true);
  const [tasksWithCompletion, setTasksWithCompletion] = useState<
    TaskWithCompletion[]
  >([]);
  const [progress, setProgress] = useState(0); // Percentage
  const [processingTask, setProcessingTask] = useState<string | null>(null); // For button loading states
  const [isClaimingQuestReward, setIsClaimingQuestReward] = useState(false);

  // Data fetching and processing logic (fetchQuestDetails, startQuest, calculateQuestProgress, claimTaskReward, etc.)
  // remains largely the same in this file for now.
  // These functions will be called and their results/handlers passed to the new components.

  const fetchQuestDetailsAPI = async (qId: string) => {
    const response = await fetch(`/api/quests/${qId}`);
    if (!response.ok) throw new Error("Failed to fetch quest details");
    return response.json();
  };

  const loadQuestDetails = useCallback(async () => {
    if (!questId || !user) return;
    setLoading(true);
    try {
      const data = await fetchQuestDetailsAPI(questId as string);
      if (data) {
        setQuestData(data);
        const tasks = data.quest?.quest_tasks || [];
        const completions = data.completions || [];

        const processedTasks = tasks
          .map((task: any) => {
            const completion = completions.find(
              (c: any) => c.task_id === task.id,
            );
            return {
              task,
              completion,
              isCompleted: completion?.submission_status === "completed",
              canClaim:
                completion?.submission_status === "completed" &&
                !completion.reward_claimed,
            };
          })
          .sort((a: any, b: any) => a.task.order_index - b.task.order_index);

        setTasksWithCompletion(processedTasks);

        const completedCount = processedTasks.filter(
          (t: any) => t.isCompleted,
        ).length;
        setProgress(
          tasks.length > 0
            ? Math.round((completedCount / tasks.length) * 100)
            : 0,
        );
      }
    } catch (error) {
      log.error("Error loading quest details:", error);
      toast.error("Failed to load quest details");
    } finally {
      setLoading(false);
    }
  }, [questId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (questId && user) {
      loadQuestDetails();
    }
  }, [questId, user, loadQuestDetails]);

  const handleStartQuest = async () => {
    if (!questId) return;
    setProcessingTask("start_quest"); // Use a unique ID for start quest processing
    try {
      const result = await startQuestRequest(questId as string);
      if (result.success) {
        toast.success("Quest started! Begin your journey!");
        await loadQuestDetails(); // Refresh data
      } else {
        toast.error(result.error || "Failed to start quest");
      }
    } catch (error: any) {
      toast.error(error.message || "Error starting quest");
    } finally {
      setProcessingTask(null);
    }
  };

  const handleTaskAction = async (task: any, inputData?: string) => {
    if (!questId) return;
    setProcessingTask(task.id);
    try {
      let result;
      // This logic is simplified. The original page had more complex calls via useQuests hook.
      // We're simulating the core action here.
      switch (task.task_type) {
        case "link_email":
          // Simulate linking email - actual logic might involve Privy SDK or other services
          if (user?.email?.address) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { email: user.email.address },
            });
          } else {
            toast.error("Please link your email in your profile first."); // Or trigger Privy email linking
            result = { success: false, error: "Email not available" };
          }
          break;
        case "link_wallet":
          result = await completeQuestTaskRequest({
            questId: questId as string,
            taskId: task.id,
            verificationData: { wallet: user?.wallet?.address },
          });
          break;
        case "link_farcaster":
          // Verify Farcaster is linked in Privy, then complete via API
          if (user?.farcaster?.fid) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: {
                fid: user.farcaster.fid,
                username: user.farcaster.username,
              },
            });
          } else {
            toast.error("No Farcaster found. Link it in your profile first.");
            result = { success: false, error: "Farcaster not linked" };
          }
          break;
        case "sign_tos":
          const signature = await signTOS();
          if (signature) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { signature },
            });
          } else {
            result = {
              success: false,
              error: "Failed to sign Terms of Service",
            };
          }
          break;
        case "submit_url":
        case "submit_text":
        case "submit_proof":
          // These task types require input data
          if (inputData && inputData.trim()) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { inputData },
              inputData,
            });
          } else {
            result = {
              success: false,
              error: `Please provide ${task.input_label || "required information"}`,
            };
          }
          break;
        case "complete_external":
          // External tasks are completed outside the platform
          result = await completeQuestTaskRequest({
            questId: questId as string,
            taskId: task.id,
            verificationData: {
              completed_external: true,
              timestamp: new Date().toISOString(),
            },
          });
          break;
        case "custom":
          // Custom tasks may or may not require input
          if (task.input_required && inputData) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { inputData },
              inputData,
            });
          } else if (task.input_required) {
            result = {
              success: false,
              error: `Please provide ${task.input_label || "required input"}`,
            };
          } else {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { custom_action: true },
            });
          }
          break;
        default:
          result = { success: false, error: "Unknown task type" };
      }

      if (result.success) {
        toast.success("Task completed! 🔥");
        await loadQuestDetails(); // Refresh data
      } else {
        toast.error(result.error || "Failed to perform task action");
      }
    } catch (error: any) {
      log.error("Error completing task:", error);
      toast.error(
        error.message || "An error occurred while completing the task",
      );
    } finally {
      setProcessingTask(null);
    }
  };

  const handleClaimReward = async (completionId: string, amount: number) => {
    setProcessingTask(completionId); // Use completionId for claiming, as task.id might be duplicated for processingTask if user clicks complete then claim quickly
    try {
      const result = await claimTaskRewardRequest(completionId);
      if (result.success) {
        toast.success(`Claimed ${amount} DG tokens! 🎉`);
        await loadQuestDetails(); // Refresh data
      } else {
        toast.error(result.error || "Failed to claim reward");
      }
    } catch (error: any) {
      log.error("Error claiming reward:", error);
      toast.error(
        error.message || "An error occurred while claiming the reward",
      );
    } finally {
      setProcessingTask(null);
    }
  };

  const handleQuestRewardClaim = async () => {
    if (!questId || !questData?.quest) return;
    if (!canClaimQuestReward) {
      return;
    }
    setIsClaimingQuestReward(true);
    try {
      if (questData.quest.reward_type === "activation") {
        const response = await claimActivationRewardRequest<{
          message?: string;
        }>(questId as string);
        toast.success(response.message || "Trial claimed successfully!");
      } else {
        const response = await completeQuestRequest<{
          message?: string;
        }>(questId as string);
        toast.success(
          response.message || "Quest completed and key granted successfully",
        );
      }
      await loadQuestDetails();
    } catch (error: any) {
      log.error("Error claiming quest reward:", error);
      toast.error(error.message || "Failed to claim quest reward");
    } finally {
      setIsClaimingQuestReward(false);
    }
  };

  // getTaskIcon is now part of TaskItem.tsx

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

  const { quest, progress: questProgressInfo } = questData; // Assuming 'progress' here is the quest_user_progress record
  const isQuestStarted = !!questProgressInfo;
  const questCompleted = Boolean(questProgressInfo?.is_completed);
  const isQuestCompleted = questCompleted || progress === 100;
  const isActivationQuest = quest?.reward_type === "activation";
  const activationRewardClaimable =
    isActivationQuest && questCompleted && !questProgressInfo?.reward_claimed;
  const xpRewardClaimable =
    !isActivationQuest && questCompleted && !questProgressInfo?.reward_claimed;
  const canClaimQuestReward = activationRewardClaimable || xpRewardClaimable;
  const hasClaimedQuestReward = Boolean(questProgressInfo?.reward_claimed);
  const canStartQuest = quest?.can_start !== false;
  const prerequisiteWarningMessage = (() => {
    if (!quest || quest.can_start !== false) {
      return null;
    }
    switch (quest.prerequisite_state) {
      case "missing_completion":
        return "Complete the prerequisite quest before starting this quest.";
      case "missing_key":
        return "You need an active key from the prerequisite quest to continue.";
      default:
        return "Prerequisite requirements are not met yet.";
    }
  })();

  return (
    <LobbyLayout>
      <div className="min-h-screen p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/lobby/quests"
            className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-6"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Back to Quests
          </Link>

          {prerequisiteWarningMessage && (
            <div className="mb-6 bg-yellow-900/20 border border-yellow-700/60 text-yellow-100 rounded-lg p-4">
              {prerequisiteWarningMessage}
            </div>
          )}

          <QuestHeader
            quest={quest} // Pass the main quest object
            progressPercentage={progress}
            isQuestCompleted={isQuestCompleted}
            isQuestStarted={isQuestStarted}
            tasksCompletedCount={
              tasksWithCompletion.filter((t) => t.isCompleted).length
            }
            totalTasksCount={tasksWithCompletion.length}
            onStartQuest={!isQuestStarted ? handleStartQuest : undefined} // Only pass if not started
            isLoadingStartQuest={processingTask === "start_quest"}
            canStartQuest={canStartQuest}
            canClaimReward={canClaimQuestReward}
            hasClaimedReward={hasClaimedQuestReward}
            onClaimReward={
              isQuestCompleted ? handleQuestRewardClaim : undefined
            }
            isClaimingReward={isClaimingQuestReward}
          />

          {isQuestStarted && tasksWithCompletion.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center">
                <Flame className="w-6 h-6 text-orange-500 mr-2" />{" "}
                {/* Re-add Flame icon for this header */}
                Quest Tasks
              </h2>
              {tasksWithCompletion.map(({ task, completion }) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  completion={completion}
                  isQuestStarted={isQuestStarted}
                  questId={questId as string}
                  onAction={handleTaskAction}
                  onClaimReward={handleClaimReward}
                  processingTaskId={processingTask}
                />
              ))}
            </div>
          )}

          {!isQuestStarted && tasksWithCompletion.length > 0 && (
            <div className="mt-8 bg-gray-800/50 rounded-xl p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-3">
                Start the Quest to Unlock Tasks
              </h3>
              <p className="text-gray-400 mb-4">
                This quest has tasks waiting for you. Click &quot;Start
                Quest&quot; above to begin!
              </p>
            </div>
          )}

          {isQuestCompleted && (
            <div className="mt-8 bg-gradient-to-r from-green-900/30 to-green-800/30 rounded-xl p-6 border border-green-500/50 text-center">
              {/* Sparkles icon is now part of QuestHeader, this can be a simpler message or removed if redundant */}
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
