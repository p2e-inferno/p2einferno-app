import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { createPrivyClient } from "@/lib/utils/privyUtils";
import { getLogger } from "@/lib/utils/logger";
import { isExternalWallet } from "@/lib/utils/wallet-address";
import { getVerificationStrategy } from "@/lib/quests/verification/registry";
import {
  checkQuestPrerequisites,
  getUserPrimaryWallet,
} from "@/lib/quests/prerequisite-checker";
import { registerQuestTransaction } from "@/lib/quests/verification/replay-prevention";
import { sendQuestReviewNotification } from "@/lib/email/admin-notifications";

const log = getLogger("api:quests:complete-task");

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

    // Check prerequisites before allowing task completion
    const userWallet = await getUserPrimaryWallet(supabase, effectiveUserId);
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
    const clientTxHash =
      clientVerificationData && typeof clientVerificationData === "object"
        ? (clientVerificationData as { transactionHash?: string })
            .transactionHash
        : undefined;

    const strategy = task?.task_type
      ? getVerificationStrategy(task.task_type)
      : undefined;

    if (task?.verification_method === "blockchain" && !strategy) {
      return res.status(400).json({
        error: "Unsupported verification method for task type",
        code: "UNSUPPORTED_VERIFICATION",
      });
    }

    if (task?.verification_method === "blockchain" && strategy) {
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

      verificationData = {
        ...result.metadata,
        txHash: clientTxHash || null,
        verificationMethod: "blockchain",
      };

      const isTxBasedTask = [
        "vendor_buy",
        "vendor_sell",
        "vendor_light_up",
        "deploy_lock",
      ].includes(task.task_type);
      if (isTxBasedTask && clientTxHash) {
        const metadata = result.metadata || {};
        const registerData = await registerQuestTransaction(supabase, {
          txHash: clientTxHash,
          userId: effectiveUserId,
          taskId,
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
    }

    // Determine initial status
    const initialStatus = task?.requires_admin_review ? "pending" : "completed";

    if (task?.task_type === "link_farcaster") {
      // Verify Farcaster linkage via Privy server SDK and use server-trusted data
      const privy = createPrivyClient();
      const profile: any = await privy.getUserById(effectiveUserId);
      const farcasterAccount = profile?.linkedAccounts?.find(
        (a: any) => a?.type === "farcaster" && a?.fid,
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
      const profile: any = await privy.getUserById(effectiveUserId);
      const externalWallet = profile?.linkedAccounts?.find(
        (a: any) =>
          a?.type === "wallet" && isExternalWallet(a?.walletClientType),
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
