import { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import {
  claimActivationRewardRequest,
  completeQuestRequest,
  completeQuestTaskRequest,
} from "@/lib/quests/client";
import type {
  Quest,
  UserQuestProgress,
  UserTaskCompletion,
} from "@/lib/supabase/types";

const log = getLogger("hooks:useQuests");

export const useQuests = () => {
  const { user, ready, authenticated } = usePrivy();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [userProgress, setUserProgress] = useState<UserQuestProgress[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserTaskCompletion[]>(
    [],
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
      const response = await fetch(`/api/quests/user-progress`);
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
    async (
      questId: string,
      taskId: string,
      verificationData?: any,
      inputData?: any,
    ) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        await completeQuestTaskRequest({
          questId,
          taskId,
          verificationData,
          inputData,
        });

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error completing task:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to complete task",
        );
        return false;
      }
    },
    [user?.id, authenticated, fetchUserProgress],
  );

  // Complete quest (quest-level key claim)
  const completeQuest = useCallback(
    async (questId: string) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        const data = await completeQuestRequest<{
          message?: string;
        }>(questId);

        toast.success(data.message || "Quest completed successfully");

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error completing quest:", err);
        toast.error(err instanceof Error ? err.message : "Failed to complete quest");
        return false;
      }
    },
    [user?.id, authenticated, fetchUserProgress],
  );

  // Claim activation reward (e.g., DG trial)
  const claimActivationReward = useCallback(
    async (questId: string) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        const data = await claimActivationRewardRequest<{
          message?: string;
        }>(questId);

        toast.success(data.message || "Trial claimed successfully!");

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error claiming activation reward:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to claim trial",
        );
        return false;
      }
    },
    [user?.id, authenticated, fetchUserProgress],
  );

  // Check if a task is completed
  const isTaskCompleted = useCallback(
    (taskId: string) => {
      return completedTasks.some((completion) => completion.task_id === taskId);
    },
    [completedTasks],
  );

  // Get quest progress
  const getQuestProgress = useCallback(
    (questId: string) => {
      return userProgress.find((progress) => progress.quest_id === questId);
    },
    [userProgress],
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
    [getQuestProgress],
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
    [user?.email?.address, completeTask],
  );

  const handleLinkFarcaster = useCallback(
    async (questId: string, taskId: string) => {
      if (!user?.farcaster?.fid) {
        toast.error(
          "No Farcaster account found. Please link your Farcaster first.",
        );
        return false;
      }

      return await completeTask(questId, taskId, {
        fid: user.farcaster.fid,
        username: user.farcaster.username,
      });
    },
    [user?.farcaster, completeTask],
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
    [completeTask],
  );

  return {
    quests,
    userProgress,
    completedTasks,
    loading,
    error,
    completeTask,
    completeQuest,
    claimActivationReward,
    isTaskCompleted,
    getQuestProgress,
    getQuestCompletionPercentage,
    handleLinkEmail,
    handleLinkFarcaster,
    handleSignTOS,
    refreshData: fetchUserProgress,
  };
};
