import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import {
  isValidTransactionHash,
  normalizeTransactionHash,
} from "@/lib/quests/txHash";
import {
  isTxHashRequiredTaskType,
  isVendorBlockchainTaskType,
} from "@/lib/quests/vendorTaskTypes";
import { registerDailyQuestTransaction } from "@/lib/quests/daily-quests/replay-prevention";
import type { DailyQuestRun } from "@/lib/supabase/types";

const log = getLogger("api:daily-quests:complete-task");

function isRunActiveWindow(run: DailyQuestRun) {
  const now = Date.now();
  const starts = Date.parse(run.starts_at);
  const ends = Date.parse(run.ends_at);
  return run.status === "active" && now >= starts && now <= ends;
}

function extractMetadataForRegistration(
  metadata: Record<string, unknown>,
  taskType: string,
): {
  amount: string | null;
  eventName: string | null;
  blockNumber: string | null;
  logIndex: number | null;
} {
  const toStringOrNull = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return null;
  };

  const amount =
    toStringOrNull(metadata.amount) ?? toStringOrNull(metadata.inputAmount);

  const eventName =
    taskType === "deploy_lock"
      ? "NewLock"
      : taskType === "uniswap_swap"
        ? "Swap"
        : toStringOrNull(metadata.eventName);

  const blockNumber = toStringOrNull(metadata.blockNumber);

  const logIndex =
    typeof metadata.logIndex === "number" ? metadata.logIndex : null;

  return { amount, eventName, blockNumber, logIndex };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    dailyQuestRunId,
    dailyQuestRunTaskId,
    verificationData: clientVerificationData,
  } = (req.body || {}) as Record<string, unknown>;

  const normalizedDailyQuestRunId =
    typeof dailyQuestRunId === "string" && dailyQuestRunId.trim()
      ? dailyQuestRunId.trim()
      : null;
  const normalizedDailyQuestRunTaskId =
    typeof dailyQuestRunTaskId === "string" && dailyQuestRunTaskId.trim()
      ? dailyQuestRunTaskId.trim()
      : null;

  if (!normalizedDailyQuestRunId || !normalizedDailyQuestRunTaskId) {
    return res.status(400).json({
      error: "Invalid or missing dailyQuestRunId/dailyQuestRunTaskId",
    });
  }

  try {
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userId = authUser.id;

    const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
    if (Array.isArray(rawActiveWalletHeader)) {
      return res
        .status(400)
        .json({ error: "Multiple X-Active-Wallet headers provided" });
    }

    let activeWallet: string | null = null;
    try {
      activeWallet = await extractAndValidateWalletFromHeader({
        userId,
        activeWalletHeader: rawActiveWalletHeader,
        context: "daily-quests:complete-task",
        required: true,
      });
    } catch (walletErr: unknown) {
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      const status =
        walletErr instanceof WalletValidationError &&
        walletErr.code === "NOT_OWNED"
          ? 403
          : 400;
      return res.status(status).json({ error: message });
    }
    if (!activeWallet || !activeWallet.trim()) {
      return res.status(400).json({ error: "Invalid X-Active-Wallet header" });
    }

    const supabase = createAdminClient();

    const { data: run, error: runErr } = await supabase
      .from("daily_quest_runs")
      .select("*")
      .eq("id", normalizedDailyQuestRunId)
      .maybeSingle();
    if (runErr) return res.status(500).json({ error: "Failed to fetch run" });
    if (!run) return res.status(404).json({ error: "Run not found" });

    if (!isRunActiveWindow(run)) {
      return res.status(409).json({ error: "RUN_CLOSED" });
    }

    const { data: progress, error: progErr } = await supabase
      .from("user_daily_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("daily_quest_run_id", normalizedDailyQuestRunId)
      .maybeSingle();
    if (progErr) {
      return res.status(500).json({ error: "Failed to fetch progress" });
    }
    if (!progress) {
      return res.status(400).json({ error: "Daily quest not started" });
    }

    const { data: task, error: taskErr } = await supabase
      .from("daily_quest_run_tasks")
      .select("*")
      .eq("id", normalizedDailyQuestRunTaskId)
      .eq("daily_quest_run_id", normalizedDailyQuestRunId)
      .maybeSingle();

    if (taskErr) return res.status(500).json({ error: "Failed to fetch task" });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const strategy = getVerificationStrategy(task.task_type);
    if (!strategy) {
      return res.status(400).json({
        error: "Unsupported verification method for task type",
        code: "UNSUPPORTED_VERIFICATION",
      });
    }

    const rawClientTxHash =
      clientVerificationData && typeof clientVerificationData === "object"
        ? (clientVerificationData as { transactionHash?: string })
            .transactionHash
        : undefined;
    const clientTxHash =
      typeof rawClientTxHash === "string" && rawClientTxHash.trim()
        ? normalizeTransactionHash(rawClientTxHash)
        : undefined;

    const txRequired = isTxHashRequiredTaskType(task.task_type);
    if (txRequired) {
      if (!clientTxHash || !isValidTransactionHash(clientTxHash)) {
        return res.status(400).json({
          error: "Valid transaction hash is required",
          code: "TX_HASH_REQUIRED",
        });
      }
    }

    const requiresVerification = Boolean(
      task.verification_method === "blockchain" ||
      task.verification_method === "automatic" ||
      isVendorBlockchainTaskType(task.task_type),
    );

    if (!requiresVerification) {
      return res.status(400).json({
        error: "Unsupported verification method for task type",
        code: "UNSUPPORTED_VERIFICATION",
      });
    }

    const verifyResult = await strategy.verify(
      task.task_type,
      txRequired ? { transactionHash: clientTxHash } : {},
      userId,
      activeWallet,
      { taskConfig: task.task_config || null, taskId: task.id },
    );

    if (!verifyResult.success) {
      return res.status(400).json({
        error: verifyResult.error || "Verification failed",
        code: verifyResult.code || "VERIFICATION_FAILED",
      });
    }

    // Register tx hash for replay prevention (tx-based tasks only; daily_checkin is excluded by isTxHashRequiredTaskType)
    if (txRequired && clientTxHash) {
      const metadata = verifyResult.metadata || {};
      const registerData = await registerDailyQuestTransaction(supabase, {
        txHash: clientTxHash,
        userId,
        taskId: task.id,
        taskType: task.task_type,
        metadata: extractMetadataForRegistration(metadata, task.task_type),
      });

      if (!registerData.success) {
        if (registerData.kind === "rpc_error") {
          return res.status(500).json({
            error: "Failed to register transaction",
            code: "TX_REGISTER_FAILED",
          });
        }

        return res.status(400).json({
          error:
            registerData.error ||
            "This transaction has already been used to complete a daily quest task",
          code: "TX_ALREADY_USED",
        });
      }
    }

    // Insert completion idempotently (unique(user_id, daily_quest_run_id, daily_quest_run_task_id))
    const { error: completionUpsertErr } = await supabase
      .from("user_daily_task_completions")
      .upsert(
        {
          user_id: userId,
          daily_quest_run_id: normalizedDailyQuestRunId,
          daily_quest_run_task_id: normalizedDailyQuestRunTaskId,
          verification_data: {
            ...(verifyResult.metadata || {}),
            txHash: txRequired ? clientTxHash || null : null,
            verificationMethod: task.verification_method,
          },
          submission_status: "completed",
        },
        {
          onConflict: "user_id,daily_quest_run_id,daily_quest_run_task_id",
          ignoreDuplicates: true,
        },
      );

    if (completionUpsertErr) {
      log.error("Failed to upsert daily task completion", {
        userId,
        dailyQuestRunId: normalizedDailyQuestRunId,
        dailyQuestRunTaskId: normalizedDailyQuestRunTaskId,
        completionUpsertErr,
      });
      return res.status(500).json({ error: "Failed to save task completion" });
    }

    const { error: finalizeErr } = await supabase.rpc(
      "try_finalize_daily_quest_progress",
      { p_user_id: userId, p_run_id: normalizedDailyQuestRunId },
    );
    if (finalizeErr) {
      log.error("Failed to finalize daily quest progress", {
        userId,
        dailyQuestRunId: normalizedDailyQuestRunId,
        progressId: progress.id,
        finalizeErr,
      });
      return res
        .status(500)
        .json({ error: "Failed to update daily quest progress" });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    log.error("Error in daily quest complete-task API:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
