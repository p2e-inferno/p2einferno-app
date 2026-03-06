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
import { DailyQuestCountdown } from "@/components/quests/DailyQuestCountdown";
import { isValidTransactionHash } from "@/lib/quests/txHash";
import { getLogger } from "@/lib/utils/logger";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { isUserRejectedError } from "@/lib/utils/walletErrors";

const log = getLogger("lobby:daily-quests:[runId]");

type DailyQuestRequirement = {
  type: string;
  status: "met" | "unmet" | "error";
  label: string;
  value?: string;
  requiredValue?: string;
  message?: string;
};

type DailyQuestDetailResponse = {
  run: any;
  template: any;
  daily_quest_run_tasks: any[];
  progress?: any | null;
  completions?: any[];
  eligibility?: {
    eligible: boolean;
    requirements: DailyQuestRequirement[];
    failures: Array<{ type: string; message: string }>;
    vendor_stage_current?: number;
    vendor_stage_required?: number;
  };
  completion_bonus_reward_amount?: number;
};

function formatTimeUntil(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { signAttestation } = useGaslessAttestation();

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

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const eligibility = data?.eligibility;
  const ineligible = Boolean(eligibility && eligibility.eligible === false);

  const tasks = useMemo(() => data?.daily_quest_run_tasks ?? [], [data]);
  const progress = data?.progress || null;
  const completions = useMemo(() => data?.completions ?? [], [data]);

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
  const runEndsAtMs = data?.run?.ends_at ? Date.parse(data.run.ends_at) : null;
  const rewardsExpired =
    typeof runEndsAtMs === "number" ? nowMs > runEndsAtMs : false;
  const isRunStale = rewardsExpired;
  const rewardExpiryMessage =
    typeof runEndsAtMs === "number"
      ? rewardsExpired
        ? "Rewards expired at reset. Complete the next run to earn rewards."
        : `Rewards expire in ${formatTimeUntil(runEndsAtMs - nowMs)}`
      : undefined;

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
    if (rewardsExpired) {
      toast.error("Rewards expired at reset. Join the next daily run to earn.");
      return;
    }
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!selectedWallet?.address) {
      toast.error("Wallet not connected");
      return;
    }
    let attestationSignature: any = null;
    try {
      if (isEASEnabled()) {
        const completion = completions.find((c) => c.id === completionId);
        const task = tasks.find(
          (t) => t.id === completion?.daily_quest_run_task_id,
        );
        const questLockAddress =
          typeof data?.template?.lock_address === "string"
            ? data.template.lock_address
            : null;
        if (!completion || !task) {
          throw new Error("Task completion context missing");
        }
        if (!questLockAddress) {
          throw new Error("Quest lock address missing");
        }
        attestationSignature = await signAttestation({
          schemaKey: "quest_task_reward_claim",
          recipient: selectedWallet.address,
          schemaData: [
            {
              name: "questId",
              type: "string",
              value: String(data?.template?.id || ""),
            },
            { name: "taskId", type: "string", value: String(task.id) },
            {
              name: "taskType",
              type: "string",
              value: String(task.task_type || ""),
            },
            {
              name: "userAddress",
              type: "address",
              value: selectedWallet.address,
            },
            {
              name: "questLockAddress",
              type: "address",
              value: questLockAddress,
            },
            {
              name: "rewardAmount",
              type: "uint256",
              value: BigInt(Number(task.reward_amount || 0)),
            },
            {
              name: "claimTimestamp",
              type: "uint256",
              value: BigInt(Math.floor(Date.now() / 1000)),
            },
          ],
        });
      }
    } catch (err: any) {
      const code = err?.code ?? err?.error?.code;
      const message = String(err?.message || "").toLowerCase();
      const isUserCancelled =
        code === 4001 ||
        code === "ACTION_REJECTED" ||
        message.includes("rejected") ||
        message.includes("denied") ||
        message.includes("cancel");
      toast.error(
        isUserCancelled
          ? "Claim cancelled"
          : err?.message || "Failed to sign claim attestation",
      );
      return;
    }
    const resp = await fetch("/api/daily-quests/claim-task-reward", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Active-Wallet": selectedWallet.address,
      },
      body: JSON.stringify({ completionId, attestationSignature }),
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
    toast.success(
      <div className="text-sm leading-relaxed">
        Claimed {(json as any)?.rewardAmount ?? "task"} DG tokens!
        {(json as any)?.attestationScanUrl && (
          <div className="text-xs mt-1 break-all">
            <a
              href={(json as any).attestationScanUrl}
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

      let attestationScanUrl: string | null | undefined = null;
      let proofCancelled = false;

      if (isEASEnabled() && json?.attestationRequired) {
        const questLockAddress =
          typeof data?.template?.lock_address === "string" &&
          data.template.lock_address
            ? data.template.lock_address
            : "0x0000000000000000000000000000000000000000";
        const keyTokenId = BigInt(json?.keyTokenId || "0");
        const grantTxHash =
          json?.transactionHash ||
          "0x0000000000000000000000000000000000000000000000000000000000000000";
        const xpEarned = BigInt(
          Number(data?.template?.completion_bonus_reward_amount || 0),
        );

        try {
          const completionSignature = await signAttestation({
            schemaKey: "quest_completion",
            recipient: selectedWallet.address,
            schemaData: [
              {
                name: "questId",
                type: "string",
                value: String(data?.template?.id || ""),
              },
              {
                name: "questTitle",
                type: "string",
                value: String(data?.template?.title || ""),
              },
              {
                name: "userAddress",
                type: "address",
                value: selectedWallet.address,
              },
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
              { name: "xpEarned", type: "uint256", value: xpEarned },
              { name: "difficulty", type: "string", value: "daily" },
            ],
          });

          const commitResp = await fetch(
            "/api/daily-quests/commit-completion-attestation",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Active-Wallet": selectedWallet.address,
              },
              body: JSON.stringify({
                dailyQuestRunId: runId,
                attestationSignature: completionSignature,
              }),
            },
          );
          const commitJson = await commitResp.json().catch(() => ({}));

          if (!commitResp.ok || commitJson?.success === false) {
            log.error(
              "Daily completion attestation commit API returned error",
              {
                dailyQuestRunId: runId,
                status: commitResp.status,
                body: commitJson,
              },
            );
          } else if (!commitJson?.attestationUid) {
            log.warn(
              "Daily completion attestation commit completed without UID",
              {
                dailyQuestRunId: runId,
                body: commitJson,
              },
            );
          } else {
            log.info("Daily completion attestation commit succeeded", {
              dailyQuestRunId: runId,
              attestationUid: commitJson?.attestationUid,
            });
          }
          attestationScanUrl = commitJson?.attestationScanUrl || null;
        } catch (err: any) {
          if (isUserRejectedError(err)) {
            proofCancelled = true;
          } else {
            throw err;
          }
        }
      }

      toast.success(
        <div className="text-sm leading-relaxed">
          Daily completion key claimed!
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

          <DailyQuestCountdown className="mb-4" />

          {Number(data.template.completion_bonus_reward_amount || 0) > 0 && (
            <div className="text-sm text-cyan-300 mb-4">
              Completion Bonus:{" "}
              {Number(data.template.completion_bonus_reward_amount || 0)} xDG
            </div>
          )}

          {eligibility && (
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-200 uppercase tracking-wider text-xs">
                  Quest Requirements
                </h3>
                {eligibility.eligible ? (
                  <span className="text-xs font-bold text-green-400 flex items-center bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    All Requirements Met
                  </span>
                ) : (
                  <span className="text-xs font-bold text-yellow-500 flex items-center bg-yellow-500/10 px-2 py-1 rounded-full border border-yellow-500/20">
                    Requirements Not Met
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {eligibility.requirements.map((req) => (
                  <div
                    key={req.type}
                    className={`flex items-start p-3 rounded-lg border transition-all ${
                      req.status === "met"
                        ? "bg-green-500/5 border-green-500/20"
                        : req.status === "error"
                          ? "bg-red-500/5 border-red-500/20"
                          : "bg-gray-800/40 border-gray-700"
                    }`}
                  >
                    <div className="mt-1 mr-3 shrink-0">
                      {req.status === "met" ? (
                        <div className="bg-green-500/20 p-1 rounded-full">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        </div>
                      ) : (
                        <div className="bg-gray-700 p-1 rounded-full">
                          <Flame className="w-4 h-4 text-gray-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-sm font-semibold truncate ${
                            req.status === "met"
                              ? "text-green-300"
                              : "text-gray-300"
                          }`}
                        >
                          {req.label}
                        </span>
                        {req.status === "met" && (
                          <span className="text-[10px] font-bold text-green-500 uppercase">
                            Verified
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm leading-relaxed ${
                          req.status === "met"
                            ? "text-green-400/80"
                            : "text-gray-400"
                        }`}
                      >
                        {req.message}
                      </p>

                      {req.type === "gooddollar_verification" &&
                        req.status === "unmet" && (
                          <div className="mt-2">
                            <Link
                              href="/lobby#gooddollar-verification"
                              className="text-xs font-medium text-orange-400 hover:text-orange-300 underline underline-offset-4"
                            >
                              Complete face verification
                            </Link>
                          </div>
                        )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!progress ? (
            <Button
              onClick={handleStart}
              disabled={starting || ineligible || isRunStale}
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

        {isRunStale && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-amber-200">
                  This daily quest has ended.
                </h3>
                <p className="text-sm text-amber-100/90 mt-1">
                  A new daily quest is available now. Go to today&apos;s quest to continue earning rewards.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/lobby/quests?tab=daily"
                  className="inline-flex items-center rounded-md bg-amber-400 px-3 py-2 text-sm font-semibold text-black hover:bg-amber-300 transition-colors"
                >
                  Go to today&apos;s quest
                </Link>
                <Link
                  href="/lobby/quests?tab=daily"
                  className="inline-flex items-center rounded-md border border-amber-300/50 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/10 transition-colors"
                >
                  Back to daily quests list
                </Link>
              </div>
            </div>
          </div>
        )}

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
                            !progress ||
                            ineligible ||
                            isRunStale ||
                            processingTaskId === t.id
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
                        <div className="mt-4 space-y-2">
                          {rewardExpiryMessage ? (
                            <div
                              className={`text-sm ${rewardsExpired ? "text-red-300" : "text-amber-300"}`}
                            >
                              {rewardExpiryMessage}
                            </div>
                          ) : null}
                          <button
                            onClick={() => handleClaimReward(completion.id)}
                            disabled={
                              processingTaskId === t.id ||
                              processingTaskId === completion.id ||
                              !progress ||
                              ineligible ||
                              rewardsExpired
                            }
                            className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-black font-bold py-2 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingTaskId === completion.id
                              ? "Claiming..."
                              : rewardsExpired
                                ? "Rewards Expired"
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
                  rewardExpiryMessage={rewardExpiryMessage}
                  rewardsExpired={rewardsExpired}
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
                  disabled={claimingKey || ineligible || isRunStale}
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
