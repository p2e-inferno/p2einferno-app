import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { Button } from "@/components/ui/button";
import TaskItem from "@/components/quests/TaskItem";
import { Flame, ChevronLeft, CheckCircle2 } from "lucide-react";
import { RichText } from "@/components/common/RichText";
import { isValidTransactionHash } from "@/lib/quests/txHash";
import { getStageLabel } from "@/lib/blockchain/shared/vendor-constants";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lobby:daily-quests:[runId]");

type DailyQuestDetailResponse = {
  run: any;
  template: any;
  daily_quest_run_tasks: any[];
  progress?: any | null;
  completions?: any[];
  eligibility?: {
    eligible: boolean;
    failures: Array<{ type: string; message: string }>;
    vendor_stage_current?: number;
    vendor_stage_required?: number;
  };
  completion_bonus_reward_amount?: number;
};

export default function DailyQuestDetailPage() {
  const router = useRouter();
  const runId =
    typeof router.query.runId === "string" ? router.query.runId : null;
  const { ready, authenticated } = usePrivy();
  const selectedWallet = useSmartWalletSelection();

  const [data, setData] = useState<DailyQuestDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingTaskId, setProcessingTaskId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [claimingKey, setClaimingKey] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authenticated && selectedWallet?.address) {
        headers["X-Active-Wallet"] = selectedWallet.address;
      }
      const resp = await fetch(`/api/daily-quests/${runId}`, { headers });
      const json = (await resp
        .json()
        .catch(() => ({}))) as DailyQuestDetailResponse;
      if (!resp.ok) {
        throw new Error((json as any)?.error || "Failed to load daily quest");
      }
      setData(json);
    } catch (err) {
      log.error("Failed to fetch daily quest detail", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to load daily quest",
      );
    } finally {
      setLoading(false);
    }
  }, [runId, authenticated, selectedWallet?.address]);

  useEffect(() => {
    if (ready && runId) {
      fetchDetail();
    }
  }, [ready, runId, fetchDetail]);

  const eligibility = data?.eligibility;
  const ineligible = Boolean(eligibility && eligibility.eligible === false);

  const tasks = data?.daily_quest_run_tasks || [];
  const progress = data?.progress || null;
  const completions = data?.completions || [];

  const completionsByTaskId = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of completions) {
      m.set(c.daily_quest_run_task_id, c);
    }
    return m;
  }, [completions]);

  const completedCount = useMemo(() => {
    return completions.filter((c) => c.submission_status === "completed")
      .length;
  }, [completions]);

  const allTasksCompleted = tasks.length > 0 && completedCount === tasks.length;
  const lockAddress = data?.template?.lock_address || null;

  const handleStart = async () => {
    if (!runId) return;
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!selectedWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }
    if (ineligible) return;

    setStarting(true);
    try {
      const resp = await fetch(`/api/daily-quests/${runId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Active-Wallet": selectedWallet.address,
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.message || json?.error || "Failed to start daily quest",
        );
      }
      await fetchDetail();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start daily quest",
      );
    } finally {
      setStarting(false);
    }
  };

  const postCompleteTask = async (runTaskId: string, verificationData: any) => {
    if (!runId) return;
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!selectedWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }
    if (ineligible) return;
    if (!progress) {
      toast.error("Start the daily quest first");
      return;
    }

    const resp = await fetch("/api/daily-quests/complete-task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Active-Wallet": selectedWallet.address,
      },
      body: JSON.stringify({
        dailyQuestRunId: runId,
        dailyQuestRunTaskId: runTaskId,
        verificationData,
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err: any = new Error(json?.error || "Failed to complete task");
      (err as any).code = json?.code;
      throw err;
    }
  };

  const handleTaskAction = async (task: any, inputData?: any) => {
    setProcessingTaskId(task.id);
    try {
      setCheckinError(null);

      switch (task.task_type) {
        case "vendor_level_up":
          await postCompleteTask(task.id, {});
          break;
        case "deploy_lock":
        case "vendor_buy":
        case "vendor_sell":
        case "vendor_light_up":
        case "uniswap_swap": {
          const txHash =
            typeof inputData === "object"
              ? (inputData as any).transactionHash
              : inputData;
          if (
            !txHash ||
            typeof txHash !== "string" ||
            !isValidTransactionHash(txHash)
          ) {
            throw new Error("Valid transaction hash is required");
          }
          await postCompleteTask(task.id, { transactionHash: txHash });
          break;
        }
        default:
          throw new Error("Unsupported task type");
      }

      await fetchDetail();
      toast.success("Task completed!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to complete task");
    } finally {
      setProcessingTaskId(null);
    }
  };

  const handleVerifyCheckin = async (taskId: string) => {
    setProcessingTaskId(taskId);
    try {
      setCheckinError(null);
      await postCompleteTask(taskId, {});
      await fetchDetail();
      toast.success("Daily check-in verified!");
    } catch (err: any) {
      const code = (err as any)?.code;
      if (code === "CHECKIN_NOT_FOUND") {
        setCheckinError(
          err.message || "You must complete your daily check-in first",
        );
      } else {
        setCheckinError(err.message || "Failed to verify daily check-in");
      }
    } finally {
      setProcessingTaskId(null);
    }
  };

  const handleClaimReward = async (completionId: string) => {
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!selectedWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }
    const resp = await fetch("/api/daily-quests/claim-task-reward", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Active-Wallet": selectedWallet.address,
      },
      body: JSON.stringify({ completionId }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      if (resp.status === 409) {
        await fetchDetail();
        return;
      }
      toast.error(json?.message || json?.error || "Failed to claim reward");
      return;
    }
    toast.success("Reward claimed!");
    await fetchDetail();
  };

  const handleClaimKey = async () => {
    if (!runId) return;
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!selectedWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }
    if (ineligible) return;
    if (!progress) {
      toast.error("Start the daily quest first");
      return;
    }
    setClaimingKey(true);
    try {
      const resp = await fetch("/api/daily-quests/complete-quest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Active-Wallet": selectedWallet.address,
        },
        body: JSON.stringify({ dailyQuestRunId: runId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json?.message || json?.error || "Failed to claim key");
      }
      toast.success("Daily completion key claimed!");
      await fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to claim key");
    } finally {
      setClaimingKey(false);
    }
  };

  if (loading) {
    return (
      <LobbyLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Flame className="w-16 h-16 text-orange-500 animate-pulse mx-auto mb-4" />
            <p className="text-xl text-gray-400">Loading daily quest...</p>
          </div>
        </div>
      </LobbyLayout>
    );
  }

  if (!data?.run || !data?.template) {
    return (
      <LobbyLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-400">Daily quest not found.</p>
        </div>
      </LobbyLayout>
    );
  }

  return (
    <LobbyLayout>
      <div className="max-w-6xl mx-auto p-6">
        <Link
          href="/lobby/quests?tab=daily"
          className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Quests
        </Link>

        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            {data.template.title}
          </h1>
          <RichText
            content={data.template.description}
            className="text-gray-300 mb-4"
          />

          <div className="text-sm text-gray-400 mb-2">
            Resets daily at 00:00 UTC
          </div>

          {Number(data.template.completion_bonus_reward_amount || 0) > 0 && (
            <div className="text-sm text-cyan-300 mb-4">
              Completion Bonus:{" "}
              {Number(data.template.completion_bonus_reward_amount || 0)} xDG
            </div>
          )}

          {eligibility && eligibility.eligible === false && (
            <div className="bg-yellow-900/20 border border-yellow-700/60 text-yellow-100 rounded-lg p-4 mb-4">
              <div className="font-semibold mb-2">Requirements not met</div>
              <ul className="list-disc pl-5 space-y-1">
                {eligibility.failures.map((f) => (
                  <li key={f.type}>
                    {f.message}{" "}
                    {f.type === "gooddollar_verification" ? (
                      <Link
                        href="/lobby#gooddollar-verification"
                        className="underline text-yellow-200"
                      >
                        Verify now
                      </Link>
                    ) : null}
                    {f.type === "vendor_stage" &&
                    typeof eligibility.vendor_stage_required === "number" ? (
                      <span className="text-yellow-200">
                        {" "}
                        (Requires{" "}
                        {getStageLabel(eligibility.vendor_stage_required)})
                        {typeof eligibility.vendor_stage_current === "number"
                          ? ` — current: ${getStageLabel(eligibility.vendor_stage_current)}`
                          : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!progress ? (
            <Button
              onClick={handleStart}
              disabled={starting || ineligible}
              className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {starting ? "Starting..." : "Start Daily Quest"}
            </Button>
          ) : (
            <div className="inline-flex items-center text-orange-300 font-semibold">
              <Flame className="w-5 h-5 mr-2" />
              In Progress
            </div>
          )}
        </div>

        <div className="space-y-4">
          {tasks
            .slice()
            .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
            .map((t) => {
              if (t.task_type === "daily_checkin") {
                const completion = completionsByTaskId.get(t.id);
                const isCompleted =
                  completion?.submission_status === "completed";
                return (
                  <div
                    key={t.id}
                    className="bg-gray-900 rounded-xl p-6 border border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {isCompleted ? (
                            <CheckCircle2 className="w-7 h-7 text-green-400" />
                          ) : (
                            <Flame className="w-7 h-7 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <h3
                            className={`text-xl font-bold mb-2 ${
                              isCompleted ? "text-green-400" : "text-white"
                            }`}
                          >
                            {t.title}
                          </h3>
                          <RichText
                            content={t.description}
                            className="text-gray-400 mb-2"
                          />
                          {checkinError && !isCompleted && (
                            <div className="text-sm text-red-300 mb-2">
                              {checkinError}{" "}
                              <Link
                                href="/lobby"
                                className="underline text-red-200"
                              >
                                Go to Lobby
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>

                      {!isCompleted && (
                        <Button
                          onClick={() => handleVerifyCheckin(t.id)}
                          disabled={
                            !progress || ineligible || processingTaskId === t.id
                          }
                          className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-75 disabled:cursor-not-allowed"
                        >
                          {processingTaskId === t.id
                            ? "Verifying..."
                            : "Verify"}
                        </Button>
                      )}
                    </div>

                    {isCompleted &&
                      completion &&
                      !completion.reward_claimed && (
                        <div className="mt-4">
                          <button
                            onClick={() => handleClaimReward(completion.id)}
                            disabled={
                              processingTaskId === t.id ||
                              processingTaskId === completion.id ||
                              !progress ||
                              ineligible
                            }
                            className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-2 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingTaskId === completion.id
                              ? "Claiming..."
                              : `Claim ${t.reward_amount} DG`}
                          </button>
                        </div>
                      )}
                  </div>
                );
              }

              const completion = completionsByTaskId.get(t.id);
              const taskForTaskItem = {
                ...t,
                quest_id: runId,
              };
              const completionForTaskItem = completion
                ? {
                    ...completion,
                    quest_id: runId,
                    task_id: t.id,
                  }
                : undefined;

              return (
                <TaskItem
                  key={t.id}
                  task={taskForTaskItem as any}
                  completion={completionForTaskItem as any}
                  isQuestStarted={Boolean(progress) && !ineligible}
                  questId={runId || ""}
                  onAction={handleTaskAction}
                  onClaimReward={(completionId) =>
                    handleClaimReward(completionId)
                  }
                  processingTaskId={processingTaskId}
                />
              );
            })}
        </div>

        {allTasksCompleted && lockAddress && (
          <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  Daily Completion Key
                </h2>
                {progress?.reward_claimed ? (
                  <div className="text-green-300">Key Claimed</div>
                ) : (
                  <div className="text-gray-300">
                    Claim your daily completion key.
                  </div>
                )}

                {progress?.reward_claimed && (
                  <div className="text-sm text-gray-400 mt-2 break-all">
                    {progress?.key_claim_tx_hash ? (
                      <div>Tx: {progress.key_claim_tx_hash}</div>
                    ) : null}
                    {progress?.key_claim_token_id ? (
                      <div>Token ID: {String(progress.key_claim_token_id)}</div>
                    ) : null}
                  </div>
                )}

                {progress?.completion_bonus_claimed ? (
                  <div className="text-sm text-cyan-300 mt-2">
                    Completion bonus awarded: {progress.completion_bonus_amount}{" "}
                    xDG
                  </div>
                ) : null}
              </div>

              {!progress?.reward_claimed && (
                <Button
                  onClick={handleClaimKey}
                  disabled={claimingKey || ineligible}
                  className="bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {claimingKey ? "Claiming..." : "Claim Daily Completion Key"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </LobbyLayout>
  );
}
