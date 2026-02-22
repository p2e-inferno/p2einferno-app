import { NextApiRequest, NextApiResponse } from "next";
import type { LinkedAccountWithMetadata, User } from "@privy-io/server-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  WalletValidationError,
} from "@/lib/auth/privy";
import { createPrivyClient } from "@/lib/utils/privyUtils";
import { getLogger } from "@/lib/utils/logger";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { normalizeTransactionHash } from "@/lib/quests/txHash";
import {
  isVendorBlockchainTaskType,
  isVendorTxTaskType,
} from "@/lib/quests/vendorTaskTypes";
import { registerQuestTransaction } from "@/lib/quests/verification/replay-prevention";
import { sendQuestReviewNotification } from "@/lib/email/admin-notifications";

const log = getLogger("api:quests:complete-task");

type FarcasterLinkedAccount = Extract<
  LinkedAccountWithMetadata,
  { type: "farcaster" }
>;
type WalletLinkedAccount = Extract<
  LinkedAccountWithMetadata,
  { type: "wallet" }
>;

function isFarcasterLinkedAccount(
  account: LinkedAccountWithMetadata,
): account is FarcasterLinkedAccount {
  return account.type === "farcaster" && typeof account.fid === "number";
}

function isExternalWalletLinkedAccount(
  account: LinkedAccountWithMetadata,
): account is WalletLinkedAccount {
  return (
    account.type === "wallet" && isExternalWallet(account.walletClientType)
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    userId: _ignoreUserId,
    questId,
    taskId,
    verificationData: clientVerificationData,
    inputData,
  } = req.body;

  if (!questId || !taskId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const supabase = createAdminClient();

    // Verify Privy user from token in header or cookie
    const authUser = await getPrivyUser(req);
    if (!authUser?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const effectiveUserId = authUser.id;

    // Get quest details to check prerequisites
    const { data: quest, error: questError } = await supabase
      .from("quests")
      .select(
        "prerequisite_quest_id, prerequisite_quest_lock_address, requires_prerequisite_key",
      )
      .eq("id", questId)
      .single();

    if (questError || !quest) {
      log.error("Error fetching quest:", questError);
      return res.status(404).json({ error: "Quest not found" });
    }

    // Prefer validated active wallet from header (multi-wallet safe), fallback to stored profile wallet.
    const rawActiveWalletHeader = req.headers?.["x-active-wallet"];
    if (Array.isArray(rawActiveWalletHeader)) {
      return res
        .status(400)
        .json({ error: "Multiple X-Active-Wallet headers provided" });
    }

    let activeWalletFromHeader: string | null = null;
    try {
      activeWalletFromHeader = await extractAndValidateWalletFromHeader({
        userId: effectiveUserId,
        activeWalletHeader: rawActiveWalletHeader,
        context: "quest-task-completion",
        required: false,
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

    // Check prerequisites before allowing task completion
    const userWallet =
      activeWalletFromHeader ||
      (await getUserPrimaryWallet(supabase, effectiveUserId));
    const prereqCheck = await checkQuestPrerequisites(
      supabase,
      effectiveUserId,
      userWallet,
      {
        prerequisite_quest_id: quest.prerequisite_quest_id,
        prerequisite_quest_lock_address: quest.prerequisite_quest_lock_address,
        requires_prerequisite_key: quest.requires_prerequisite_key,
      },
    );

    if (!prereqCheck.canProceed) {
      return res.status(403).json({
        error: prereqCheck.reason || "Prerequisites not met",
        prerequisiteState: prereqCheck.prerequisiteState,
      });
    }

    // Check if task has an existing completion
    const { data: existingCompletion } = await supabase
      .from("user_task_completions")
      .select("*")
      .eq("user_id", effectiveUserId)
      .eq("task_id", taskId)
      .single();

    // Allow resubmission if status is 'retry', 'failed', or 'pending' (edit before review)
    if (existingCompletion) {
      const canResubmit = ["retry", "failed", "pending"].includes(
        existingCompletion.submission_status,
      );

      if (!canResubmit) {
        return res.status(400).json({
          error: "Task already completed",
          currentStatus: existingCompletion.submission_status,
        });
      }
    }

    // Get the task details to check type and review requirements
    const { data: task, error: taskError } = await supabase
      .from("quest_tasks")
      .select(
        "requires_admin_review, input_required, task_type, verification_method, task_config",
      )
      .eq("id", taskId)
      .single();

    if (taskError) {
      log.error("Error fetching task:", taskError);
      return res.status(500).json({ error: "Failed to fetch task details" });
    }

    // Build verification data (server-authored only)
    let verificationData: Record<string, unknown> | null = null;
    const rawClientTxHash =
      clientVerificationData && typeof clientVerificationData === "object"
        ? (clientVerificationData as { transactionHash?: string })
            .transactionHash
        : undefined;
    const clientTxHash =
      typeof rawClientTxHash === "string" && rawClientTxHash.trim()
        ? normalizeTransactionHash(rawClientTxHash)
        : undefined;

    const strategy = task?.task_type
      ? getVerificationStrategy(task.task_type)
      : undefined;
    const requiresBlockchainVerification = Boolean(
      task &&
      (task.verification_method === "blockchain" ||
        isVendorBlockchainTaskType(task.task_type)),
    );

    if (requiresBlockchainVerification && !strategy) {
      return res.status(400).json({
        error: "Unsupported verification method for task type",
        code: "UNSUPPORTED_VERIFICATION",
      });
    }

    let pendingTxRegistration: {
      txHash: string;
      taskType: string;
      metadata: {
        amount: string | null;
        eventName: string | null;
        blockNumber: string | null;
        logIndex: number | null;
      };
    } | null = null;

    if (requiresBlockchainVerification && strategy) {
      if (!userWallet) {
        return res.status(400).json({ error: "Wallet not linked" });
      }

      const result = await strategy.verify(
        task.task_type,
        { transactionHash: clientTxHash },
        effectiveUserId,
        userWallet,
        { taskConfig: task.task_config || null, taskId },
      );

      if (!result.success) {
        return res.status(400).json({
          error: result.error || "Verification failed",
          code: result.code || "VERIFICATION_FAILED",
        });
      }

      const isTxBasedTask =
        isVendorTxTaskType(task.task_type) || task.task_type === "deploy_lock";

      verificationData = {
        ...result.metadata,
        txHash: isTxBasedTask ? clientTxHash || null : null,
        verificationMethod: "blockchain",
      };

      if (isTxBasedTask && clientTxHash) {
        const metadata = result.metadata || {};
        pendingTxRegistration = {
          txHash: clientTxHash,
          taskType: task.task_type,
          metadata: {
            amount:
              typeof metadata.amount === "string" ? metadata.amount : null,
            eventName:
              task.task_type === "deploy_lock"
                ? "NewLock"
                : typeof metadata.eventName === "string"
                  ? metadata.eventName
                  : null,
            blockNumber:
              typeof metadata.blockNumber === "string"
                ? metadata.blockNumber
                : null,
            logIndex:
              typeof metadata.logIndex === "number" ? metadata.logIndex : null,
          },
        };
      }
    }

    if (pendingTxRegistration) {
      // Intentionally register before persisting completion to claim tx hash early
      // and prevent replay attacks. Tradeoff: if completion INSERT/UPDATE fails
      // afterward, the tx remains claimed (orphaned) and cannot be retried.
      const registerData = await registerQuestTransaction(supabase, {
        txHash: pendingTxRegistration.txHash,
        userId: effectiveUserId,
        taskId,
        taskType: pendingTxRegistration.taskType,
        metadata: pendingTxRegistration.metadata,
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
            "This transaction has already been used to complete a quest task",
          code: "TX_ALREADY_USED",
        });
      }
    }

    // Determine initial status
    const initialStatus = task?.requires_admin_review ? "pending" : "completed";

    if (task?.task_type === "link_farcaster") {
      // Verify Farcaster linkage via Privy server SDK and use server-trusted data
      const privy = createPrivyClient();
      const profile: User = await privy.getUserById(effectiveUserId);
      const farcasterAccount = profile?.linkedAccounts?.find(
        isFarcasterLinkedAccount,
      );
      if (!farcasterAccount) {
        return res
          .status(400)
          .json({ error: "Farcaster not linked to your Privy account" });
      }
      verificationData = {
        fid: farcasterAccount.fid,
        username: farcasterAccount.username,
      };
    }

    if (task?.task_type === "link_wallet") {
      // Verify external wallet linkage via Privy server SDK and use server-trusted data
      const privy = createPrivyClient();
      const profile: User = await privy.getUserById(effectiveUserId);
      const externalWallet = profile?.linkedAccounts?.find(
        isExternalWalletLinkedAccount,
      );
      if (!externalWallet) {
        return res.status(400).json({
          error:
            "External wallet not linked. Please link an Ethereum wallet to complete this quest.",
        });
      }
      verificationData = {
        walletAddress: externalWallet.address,
        walletClientType: externalWallet.walletClientType,
      };
    }

    if (task?.task_type === "link_telegram") {
      // Verify Telegram notifications are enabled via user_profiles (not Privy)
      // Use maybeSingle() so "no profile" returns { data: null, error: null }
      // instead of a PGRST116 error — cleanly separates "not found" from DB errors.
      const { data: tgProfile, error: tgError } = await supabase
        .from("user_profiles")
        .select("telegram_chat_id, telegram_notifications_enabled")
        .eq("privy_user_id", effectiveUserId)
        .maybeSingle();

      if (tgError) {
        log.error("Failed to query user profile for Telegram check", {
          error: tgError,
          userId: effectiveUserId,
        });
        return res
          .status(500)
          .json({ error: "Failed to verify Telegram status" });
      }

      if (
        !tgProfile?.telegram_chat_id ||
        !tgProfile?.telegram_notifications_enabled
      ) {
        return res.status(400).json({
          error: "Please enable Telegram notifications in your profile first.",
        });
      }
      verificationData = {
        telegramChatId: tgProfile.telegram_chat_id,
      };
    }

    // Complete the task (INSERT new or UPDATE existing for resubmission)
    let completionError;

    if (existingCompletion) {
      // UPDATE existing completion for retry/failed cases
      const { error } = await supabase
        .from("user_task_completions")
        .update({
          verification_data: verificationData,
          submission_data: inputData,
          submission_status: initialStatus,
          admin_feedback: null, // Clear previous feedback
          reviewed_at: null, // Clear review timestamp
          reviewed_by: null, // Clear reviewer
          completed_at: new Date().toISOString(), // Update submission time
        })
        .eq("id", existingCompletion.id);
      completionError = error;
    } else {
      // INSERT new completion
      const { error } = await supabase.from("user_task_completions").insert({
        user_id: effectiveUserId,
        quest_id: questId,
        task_id: taskId,
        verification_data: verificationData,
        submission_data: inputData,
        submission_status: initialStatus,
        reward_claimed: false,
      });
      completionError = error;
    }

    if (completionError) {
      log.error("Error completing task:", completionError);
      return res.status(500).json({ error: "Failed to complete task" });
    }

    // Send admin notification if review required (only on NEW submissions, not updates)
    if (
      task.requires_admin_review &&
      initialStatus === "pending" &&
      !existingCompletion
    ) {
      sendQuestReviewNotification(taskId, effectiveUserId, questId).catch(
        (err) =>
          log.error("Failed to send quest review email", {
            err,
            taskId,
            userId: effectiveUserId,
          }),
      );
    }

    // Update quest progress only if task is completed (not pending review)
    if (initialStatus === "completed") {
      // Use the database function to recalculate progress
      try {
        await supabase.rpc("recalculate_quest_progress", {
          p_user_id: effectiveUserId,
          p_quest_id: questId,
        });
      } catch (progressError) {
        log.error("Error recalculating progress:", progressError);
        // Don't fail the main operation if progress update fails
      }
    }

    res.status(200).json({
      success: true,
      message:
        initialStatus === "pending"
          ? "Task submitted for review"
          : "Task completed successfully",
    });
  } catch (error) {
    log.error("Error in complete task API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
