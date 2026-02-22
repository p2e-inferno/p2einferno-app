import React, { useState, useEffect, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import {
  claimActivationRewardRequest,
  completeQuestRequest,
  completeQuestTaskRequest,
} from "@/lib/quests/client";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { isUserRejectedError } from "@/lib/utils/walletErrors";
import type {
  Quest,
  UserQuestProgress,
  UserTaskCompletion,
} from "@/lib/supabase/types";

const log = getLogger("hooks:useQuests");

export const useQuests = () => {
  const { user, ready, authenticated } = usePrivy();
  const selectedWallet = useSmartWalletSelection();
  const { signAttestation, isSigning } = useGaslessAttestation();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [userProgress, setUserProgress] = useState<UserQuestProgress[]>([]);
  const [completedTasks, setCompletedTasks] = useState<UserTaskCompletion[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderAttestationToast = (
    message: string,
    scanUrl?: string | null,
    opts?: { proofCancelled?: boolean },
  ) => {
    return React.createElement(
      "div",
      { className: "text-sm leading-relaxed" },
      message,
      opts?.proofCancelled
        ? React.createElement(
            "div",
            { className: "text-xs mt-1 text-gray-300" },
            "Completion proof cancelled — claim completed.",
          )
        : null,
      scanUrl
        ? React.createElement(
            "div",
            { className: "text-xs mt-1 break-all" },
            React.createElement(
              "a",
              {
                href: scanUrl,
                target: "_blank",
                rel: "noreferrer",
                className: "text-cyan-500 underline",
              },
              "View attestation on EAS Scan",
            ),
          )
        : null,
    );
  };

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
          walletAddress: selectedWallet?.address,
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
    [user?.id, authenticated, fetchUserProgress, selectedWallet?.address],
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
          transactionHash?: string | null;
          keyTokenId?: string | null;
          attestationRequired?: boolean;
        }>(questId, { attestationSignature: null });

        let scanUrl: string | null | undefined = null;
        let proofCancelled = false;

        if (isEASEnabled() && data.attestationRequired) {
          if (!selectedWallet?.address) {
            throw new Error("Wallet not connected");
          }
          const userAddress = selectedWallet.address;

          const quest = quests.find((q) => q.id === questId);
          const questLockAddress =
            quest?.lock_address &&
            typeof quest.lock_address === "string" &&
            quest.lock_address.length > 0
              ? quest.lock_address
              : "0x0000000000000000000000000000000000000000";
          const keyTokenId = BigInt(data.keyTokenId || "0");
          const grantTxHash =
            data.transactionHash ||
            "0x0000000000000000000000000000000000000000000000000000000000000000";

          try {
            const completionSignature = await signAttestation({
              schemaKey: "quest_completion",
              recipient: userAddress,
              schemaData: [
                { name: "questId", type: "string", value: questId },
                {
                  name: "questTitle",
                  type: "string",
                  value: quest?.title ?? "",
                },
                { name: "userAddress", type: "address", value: userAddress },
                {
                  name: "questLockAddress",
                  type: "address",
                  value: questLockAddress,
                },
                { name: "keyTokenId", type: "uint256", value: keyTokenId },
                { name: "grantTxHash", type: "bytes32", value: grantTxHash },
                {
                  name: "completionDate",
                  type: "uint256",
                  value: BigInt(Math.floor(Date.now() / 1000)),
                },
                {
                  name: "xpEarned",
                  type: "uint256",
                  value: BigInt(quest?.total_reward ?? 0),
                },
                { name: "difficulty", type: "string", value: "" },
              ],
            });

            const commitResp = await fetch(
              "/api/quests/commit-completion-attestation",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  questId,
                  attestationSignature: completionSignature,
                }),
              },
            );
            const commitJson = await commitResp.json().catch(() => ({}));
            scanUrl = commitJson?.attestationScanUrl || null;
          } catch (err: any) {
            if (isUserRejectedError(err)) {
              proofCancelled = true;
            } else {
              throw err;
            }
          }
        }

        toast.success(
          renderAttestationToast(
            data.message || "Quest completed successfully",
            scanUrl,
            { proofCancelled },
          ),
        );

        // Refresh user progress
        await fetchUserProgress();
        return true;
      } catch (err) {
        log.error("Error completing quest:", err);
        toast.error(
          err instanceof Error ? err.message : "Failed to complete quest",
        );
        return false;
      }
    },
    [
      user?.id,
      authenticated,
      fetchUserProgress,
      selectedWallet?.address,
      quests,
      signAttestation,
    ],
  );

  // Claim activation reward (e.g., DG trial)
  const claimActivationReward = useCallback(
    async (questId: string) => {
      if (!user?.id || !authenticated) {
        toast.error("Please connect your wallet first");
        return false;
      }

      try {
        const easEnabled = isEASEnabled();
        let attestationSignature: any = null;

        if (easEnabled) {
          if (!selectedWallet?.address) {
            throw new Error("Wallet not connected");
          }
          const userAddress = selectedWallet.address;

          const quest = quests.find((q) => q.id === questId);
          const questLockAddress =
            quest?.lock_address &&
            typeof quest.lock_address === "string" &&
            quest.lock_address.length > 0
              ? quest.lock_address
              : "0x0000000000000000000000000000000000000000";

          try {
            attestationSignature = await signAttestation({
              schemaKey: "quest_completion",
              recipient: userAddress,
              schemaData: [
                { name: "questId", type: "string", value: questId },
                {
                  name: "questTitle",
                  type: "string",
                  value: quest?.title ?? "",
                },
                { name: "userAddress", type: "address", value: userAddress },
                {
                  name: "questLockAddress",
                  type: "address",
                  value: questLockAddress,
                },
                { name: "keyTokenId", type: "uint256", value: 0n },
                {
                  name: "grantTxHash",
                  type: "bytes32",
                  value:
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                },
                {
                  name: "completionDate",
                  type: "uint256",
                  value: BigInt(Math.floor(Date.now() / 1000)),
                },
                {
                  name: "xpEarned",
                  type: "uint256",
                  value: BigInt(quest?.total_reward ?? 0),
                },
                { name: "difficulty", type: "string", value: "" },
              ],
            });
          } catch (err: any) {
            if (isUserRejectedError(err)) {
              throw new Error("Claim cancelled");
            }
            throw err;
          }
        }

        const data = await claimActivationRewardRequest<{
          message?: string;
          attestationScanUrl?: string | null;
        }>(questId, { attestationSignature });

        const scanUrl = data.attestationScanUrl;
        toast.success(
          renderAttestationToast(
            data.message || "Trial claimed successfully!",
            scanUrl,
          ),
        );

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
    [
      user?.id,
      authenticated,
      fetchUserProgress,
      selectedWallet?.address,
      quests,
      signAttestation,
    ],
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
    loading: loading || isSigning,
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
