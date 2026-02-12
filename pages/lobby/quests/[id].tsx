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
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

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
  const selectedWallet = useSmartWalletSelection();
  const { signAttestation } = useGaslessAttestation();
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

  const isUserRejected = (err: any): boolean => {
    const code = (err?.code ?? err?.error?.code) as any;
    const name = (err?.name || "").toString().toLowerCase();
    const msg = (err?.message || "").toString().toLowerCase();
    return (
      code === 4001 ||
      code === "ACTION_REJECTED" ||
      name.includes("userrejected") ||
      msg.includes("user rejected") ||
      msg.includes("rejected") ||
      msg.includes("denied") ||
      msg.includes("cancel") ||
      msg.includes("canceled") ||
      msg.includes("cancelled")
    );
  };

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

  const handleTaskAction = async (task: any, inputData?: any) => {
    if (!questId) return;
    setProcessingTask(task.id);
    try {
      let result;
      switch (task.task_type) {
        case "link_email":
          if (user?.email?.address) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { email: user.email.address },
            });
          } else {
            toast.error("Please link your email in your profile first.");
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
          if (inputData && typeof inputData === "string" && inputData.trim()) {
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
        case "deploy_lock":
        case "vendor_buy":
        case "vendor_sell":
        case "vendor_light_up":
          // If inputData is an object (from specialized forms), it contains transactionHash
          // If it's a string (from generic input), assume it's the transactionHash
          const txHash =
            typeof inputData === "object"
              ? (inputData as any).transactionHash
              : inputData;

          if (txHash) {
            result = await completeQuestTaskRequest({
              questId: questId as string,
              taskId: task.id,
              verificationData: { transactionHash: txHash },
            });
          } else {
            result = {
              success: false,
              error: `Please provide a valid transaction hash for ${task.title}`,
            };
          }
          break;
        case "vendor_level_up":
          result = await completeQuestTaskRequest({
            questId: questId as string,
            taskId: task.id,
            verificationData: {},
          });
          break;
        case "complete_external":
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
        await loadQuestDetails();
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
      const easEnabled = isEASEnabled();
      const claimTimestamp = BigInt(Math.floor(Date.now() / 1000));
      let attestationSignature: any = null;

      if (easEnabled) {
        if (!selectedWallet?.address) {
          throw new Error("Wallet not connected");
        }

        const userAddress = selectedWallet.address;
        const questLockAddress =
          typeof questData?.quest?.lock_address === "string"
            ? questData.quest.lock_address
            : null;
        if (!questLockAddress) {
          throw new Error("Quest lock address missing");
        }

        const taskEntry = tasksWithCompletion.find(
          (t) => t.completion?.id === completionId,
        );
        const taskId = taskEntry?.task?.id;
        const taskType = taskEntry?.task?.task_type;
        if (!taskId || typeof taskId !== "string") {
          throw new Error("Task ID missing");
        }
        if (!taskType || typeof taskType !== "string") {
          throw new Error("Task type missing");
        }

        // Mirror server-side reward multiplier logic for deploy_lock tasks.
        let expectedRewardAmount = amount;
        if (taskType === "deploy_lock") {
          const multiplier =
            (taskEntry?.completion?.verification_data?.rewardMultiplier as
              | number
              | undefined) ?? 1.0;
          expectedRewardAmount = Math.floor(amount * multiplier);
        }

        try {
          attestationSignature = await signAttestation({
            schemaKey: "quest_task_reward_claim",
            recipient: userAddress,
            schemaData: [
              { name: "questId", type: "string", value: questId as string },
              { name: "taskId", type: "string", value: taskId },
              { name: "taskType", type: "string", value: taskType },
              { name: "userAddress", type: "address", value: userAddress },
              {
                name: "questLockAddress",
                type: "address",
                value: questLockAddress,
              },
              {
                name: "rewardAmount",
                type: "uint256",
                value: BigInt(expectedRewardAmount),
              },
              {
                name: "claimTimestamp",
                type: "uint256",
                value: claimTimestamp,
              },
            ],
          });
        } catch (err: any) {
          if (isUserRejected(err)) {
            throw new Error("Claim cancelled");
          }
          throw err;
        }
      }

      const result = await claimTaskRewardRequest(completionId, {
        attestationSignature,
      });
      if (result.success) {
        const scanUrl = (result as any).attestationScanUrl;
        const rewarded = (result as any).rewardAmount ?? amount;
        toast.success(
          <div className="text-sm leading-relaxed">
            Claimed {rewarded} DG tokens! 🎉
            {scanUrl && (
              <div className="text-xs mt-1 break-all">
                <a
                  href={scanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-500 underline"
                >
                  View attestation on EAS Scan
                </a>
              </div>
            )}
          </div>,
        );
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
      toast.error("Quest reward is not ready to claim yet.");
      return;
    }
    setIsClaimingQuestReward(true);
    try {
      const easEnabled = isEASEnabled();
      let attestationSignature: any = null;

      // UX: when EAS is enabled, signing is required. Canceling the signature == canceling the claim.
      // For activation quests, we currently sign before calling the activation endpoint.
      // For standard quests, the signature must be created after the key grant so we can include
      // the real tokenId + grant tx hash in the schema data.
      if (easEnabled && questData.quest.reward_type === "activation") {
        const userAddress = selectedWallet?.address;
        if (!userAddress) {
          throw new Error("Wallet not connected");
        }

        const quest = questData.quest;
        const questLockAddress =
          typeof quest?.lock_address === "string" && quest.lock_address
            ? quest.lock_address
            : "0x0000000000000000000000000000000000000000";

        try {
          attestationSignature = await signAttestation({
            schemaKey: "quest_completion",
            recipient: userAddress,
            schemaData: [
              { name: "questId", type: "string", value: String(questId) },
              { name: "questTitle", type: "string", value: quest?.title ?? "" },
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
          if (isUserRejected(err)) {
            throw new Error("Claim cancelled");
          }
          throw err;
        }
      }

      if (questData.quest.reward_type === "activation") {
        const response = await claimActivationRewardRequest<{
          message?: string;
          attestationScanUrl?: string | null;
        }>(questId as string, { attestationSignature });
        const scanUrl = response.attestationScanUrl;
        toast.success(
          <div className="text-sm leading-relaxed">
            {response.message || "Trial claimed successfully!"}
            {scanUrl && (
              <div className="text-xs mt-1 break-all">
                <a
                  href={scanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-500 underline"
                >
                  View attestation on EAS Scan
                </a>
              </div>
            )}
          </div>,
        );
      } else {
        const response = await completeQuestRequest<{
          message?: string;
          transactionHash?: string | null;
          keyTokenId?: string | null;
          attestationRequired?: boolean;
        }>(questId as string, { attestationSignature: null });

        let attestationScanUrl: string | null | undefined = null;
        let proofCancelled = false;

        if (isEASEnabled() && response.attestationRequired) {
          const userAddress = selectedWallet?.address;
          if (!userAddress) {
            throw new Error("Wallet not connected");
          }
          const quest = questData.quest;
          const questLockAddress =
            typeof quest?.lock_address === "string" && quest.lock_address
              ? quest.lock_address
              : "0x0000000000000000000000000000000000000000";
          const keyTokenId = BigInt(response.keyTokenId || "0");
          const grantTxHash =
            response.transactionHash ||
            "0x0000000000000000000000000000000000000000000000000000000000000000";

          try {
            const completionSignature = await signAttestation({
              schemaKey: "quest_completion",
              recipient: userAddress,
              schemaData: [
                { name: "questId", type: "string", value: String(questId) },
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
            attestationScanUrl = commitJson?.attestationScanUrl || null;
          } catch (err: any) {
            if (isUserRejected(err)) {
              proofCancelled = true;
            } else {
              throw err;
            }
          }
        }

        toast.success(
          <div className="text-sm leading-relaxed">
            {response.message || "Quest completed and key granted successfully"}
            {proofCancelled && (
              <div className="text-xs mt-1 text-gray-300">
                Completion proof cancelled — claim completed.
              </div>
            )}
            {attestationScanUrl && (
              <div className="text-xs mt-1 break-all">
                <a
                  href={attestationScanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-500 underline"
                >
                  View attestation on EAS Scan
                </a>
              </div>
            )}
          </div>,
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
  const hasClaimedQuestReward = Boolean(questProgressInfo?.reward_claimed);
  const isQuestCompleted =
    (questCompleted || progress === 100) &&
    (!quest?.lock_address || hasClaimedQuestReward);
  const isQuestKeyPending =
    (questCompleted || progress === 100) &&
    quest?.lock_address &&
    !hasClaimedQuestReward;
  const isActivationQuest = quest?.reward_type === "activation";
  const activationRewardClaimable =
    isActivationQuest && questCompleted && !questProgressInfo?.reward_claimed;
  const xpRewardClaimable =
    !isActivationQuest && questCompleted && !questProgressInfo?.reward_claimed;
  const canClaimQuestReward = activationRewardClaimable || xpRewardClaimable;
  const canStartQuest = quest?.can_start !== false;
  const prerequisiteQuest = quest?.prerequisite_quest || null;
  const prerequisiteWarningMessage = (() => {
    if (!quest || quest.can_start !== false) {
      return null;
    }
    const prereqName = prerequisiteQuest?.title;
    const prereqLink = prerequisiteQuest
      ? `/lobby/quests/${prerequisiteQuest.id}`
      : null;
    switch (quest.prerequisite_state) {
      case "missing_completion":
        return prereqLink ? (
          <>
            Complete{" "}
            <Link
              href={prereqLink}
              className="underline hover:text-yellow-300 transition-colors"
            >
              {prereqName}
            </Link>{" "}
            before starting this quest.
          </>
        ) : (
          "Complete the prerequisite quest before starting this quest."
        );
      case "missing_key":
        return prereqLink ? (
          <>
            You need an active key from{" "}
            <Link
              href={prereqLink}
              className="underline hover:text-yellow-300 transition-colors"
            >
              {prereqName}
            </Link>{" "}
            to continue.
          </>
        ) : (
          "You need an active key from the prerequisite quest to continue."
        );
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
            prerequisiteQuest={prerequisiteQuest}
            canClaimReward={canClaimQuestReward}
            hasClaimedReward={hasClaimedQuestReward}
            onClaimReward={canClaimQuestReward ? handleQuestRewardClaim : undefined}
            isClaimingReward={isClaimingQuestReward}
            isQuestKeyPending={isQuestKeyPending}
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
