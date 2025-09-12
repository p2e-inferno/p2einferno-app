import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useQuests');


// Types
export interface Quest {
  id: string;
  title: string;
  description: string;
  total_reward: number;
  is_active: boolean;
  created_at: string;
  quest_tasks: QuestTask[];
}

export interface QuestTask {
  id: string;
  quest_id: string;
  title: string;
  description: string;
  task_type: "link_email" | "link_wallet" | "link_farcaster" | "sign_tos";
  verification_method: string;
  reward_amount: number;
  order_index: number;
}

export interface UserQuestProgress {
  id: string;
  user_id: string;
  quest_id: string;
  tasks_completed: number;
  is_completed: boolean;
  reward_claimed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserTaskCompletion {
  id: string;
  user_id: string;
  quest_id: string;
  task_id: string;
  verification_data: any;
  reward_claimed: boolean;
  completed_at: string;
}

export const useQuests = () => {
  const { user, ready, authenticated } = usePrivy();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [userProgress, setUserProgress] = useState<UserQuestProgress[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserTaskCompletion[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch quests
  const fetchQuests = useCallback(async () => {
    try {
      const response = await fetch("/api/quests");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch quests");
      }

      setQuests(data.quests || []);
    } catch (err) {
      log.error("Error fetching quests:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch quests");
    }
  }, []);

  // Fetch user progress
  const fetchUserProgress = useCallback(async () => {
    if (!user?.id || !authenticated) return;

    try {
      const response = await fetch(
        `/api/quests/user-progress?userId=${user.id}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch progress");
      }

      setUserProgress(data.progress || []);
      setCompletedTasks(data.completedTasks || []);
    } catch (err) {
      log.error("Error fetching user progress:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch progress");
    }
  }, [user?.id, authenticated]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchQuests(), fetchUserProgress()]);
      setLoading(false);
    };

    if (ready) {
      loadData();
    }
  }, [ready, fetchQuests, fetchUserProgress]);

  // Complete a task
  const completeTask = useCallback(
    async (questId: string, taskId: string, verificationData?: any) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        const response = await fetch("/api/quests/complete-task", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            questId,
            taskId,
            verificationData,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to complete task");
        }

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error completing task:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to complete task"
        );
        return false;
      }
    },
    [user?.id, authenticated, fetchUserProgress]
  );

  // Claim quest rewards
  const claimQuestRewards = useCallback(
    async (questId: string) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        const response = await fetch("/api/quests/claim-rewards", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            questId,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to claim rewards");
        }

        toast.success(
          `Rewards claimed! You earned ${data.totalReward} DG tokens`
        );

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error claiming rewards:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to claim rewards"
        );
        return false;
      }
    },
    [user?.id, authenticated, fetchUserProgress]
  );

  // Check if a task is completed
  const isTaskCompleted = useCallback(
    (taskId: string) => {
      return completedTasks.some((completion) => completion.task_id === taskId);
    },
    [completedTasks]
  );

  // Get quest progress
  const getQuestProgress = useCallback(
    (questId: string) => {
      return userProgress.find((progress) => progress.quest_id === questId);
    },
    [userProgress]
  );

  // Calculate completion percentage for a quest
  const getQuestCompletionPercentage = useCallback(
    (quest: Quest) => {
      const progress = getQuestProgress(quest.id);
      const totalTasks = quest.quest_tasks?.length || 0;
      const completedTaskCount = progress?.tasks_completed || 0;

      return totalTasks > 0
        ? Math.round((completedTaskCount / totalTasks) * 100)
        : 0;
    },
    [getQuestProgress]
  );

  // Handle specific task types
  const handleLinkEmail = useCallback(
    async (questId: string, taskId: string) => {
      if (!user?.email?.address) {
        toast.error("No email found. Please link your email first.");
        return false;
      }

      return await completeTask(questId, taskId, { email: user.email.address });
    },
    [user?.email?.address, completeTask]
  );

  const handleLinkFarcaster = useCallback(
    async (questId: string, taskId: string) => {
      if (!user?.farcaster?.fid) {
        toast.error(
          "No Farcaster account found. Please link your Farcaster first."
        );
        return false;
      }

      return await completeTask(questId, taskId, {
        fid: user.farcaster.fid,
        username: user.farcaster.username,
      });
    },
    [user?.farcaster, completeTask]
  );

  const handleSignTOS = useCallback(
    async (questId: string, taskId: string, signature?: string) => {
      if (!signature) {
        toast.error("Terms of Service signature required");
        return false;
      }

      return await completeTask(questId, taskId, {
        signature,
        signedAt: new Date().toISOString(),
      });
    },
    [completeTask]
  );

  return {
    quests,
    userProgress,
    completedTasks,
    loading,
    error,
    completeTask,
    claimQuestRewards,
    isTaskCompleted,
    getQuestProgress,
    getQuestCompletionPercentage,
    handleLinkEmail,
    handleLinkFarcaster,
    handleSignTOS,
    refreshData: fetchUserProgress,
  };
};
