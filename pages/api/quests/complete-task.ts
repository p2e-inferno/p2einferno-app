import { NextApiRequest, NextApiResponse } from "next";
import type { LinkedAccountWithMetadata, User } from "@privy-io/server-auth";
import { CHAIN_ID } from "@/lib/blockchain/config";
import { createAdminClient } from "@/lib/supabase/server";
import {
  getPrivyUser,
  extractAndValidateWalletFromHeader,
  walletValidationErrorToHttpStatus,
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
  isTxHashRequiredTaskType,
} from "@/lib/quests/vendorTaskTypes";
import { sendQuestReviewNotification } from "@/lib/email/admin-notifications";
import {
  substituteContextTokens,
  promptRequiresPrivyFetch,
} from "@/lib/ai/verification/text";
import {
  asQuestTaskConfig,
  getTaskConfigString,
  getWalletMatchMode,
} from "@/lib/quests/task-config";

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

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringProperty(
  value: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
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
      const status = walletValidationErrorToHttpStatus(walletErr);
      const safeStatus = status === 500 ? 400 : status;
      const message =
        walletErr instanceof Error
          ? walletErr.message
          : "Invalid X-Active-Wallet header";
      return res.status(safeStatus).json({ error: message });
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
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Build verification data (server-authored only)
    let verificationData: Record<string, unknown> | null = null;
    const clientVerificationRecord = asObjectRecord(clientVerificationData);
    const taskConfig = asQuestTaskConfig(task.task_config);
    const rawClientTxHash = getStringProperty(
      clientVerificationRecord,
      "transactionHash",
    );
    const clientTxHash =
      typeof rawClientTxHash === "string" && rawClientTxHash.trim()
        ? normalizeTransactionHash(rawClientTxHash)
        : undefined;

    const strategy = getVerificationStrategy(task.task_type);
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

    // Basic input validation for proof submissions to prevent bypasses via crafted requests.
    if (task.task_type === "submit_proof") {
      const proofUrlFromClient =
        typeof getStringProperty(clientVerificationRecord, "inputData") ===
        "string"
          ? String(
              getStringProperty(clientVerificationRecord, "inputData"),
            ).trim()
          : typeof inputData === "string"
            ? inputData.trim()
            : "";
      if (!proofUrlFromClient) {
        return res.status(400).json({
          error: "Screenshot proof URL is required",
          code: "PROOF_URL_REQUIRED",
        });
      }
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

      const isTxBasedTask = isTxHashRequiredTaskType(task.task_type);

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
              typeof metadata.amount === "string"
                ? metadata.amount
                : typeof metadata.inputAmount === "string"
                  ? metadata.inputAmount
                  : null,
            eventName:
              task.task_type === "deploy_lock"
                ? "NewLock"
                : task.task_type === "uniswap_swap"
                  ? "Swap"
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

    // General automatic server-side verification (DB/service queries, no user input)
    // Covers task types like gooddollar_verified, in_app_pullout, daily_checkin
    // when verification_method is not "blockchain".
    const requiresGeneralVerification = Boolean(
      strategy &&
      !requiresBlockchainVerification &&
      task.task_type !== "submit_proof" &&
      task.task_type !== "submit_text",
    );

    if (requiresGeneralVerification && strategy) {
      const result = await strategy.verify(
        task.task_type,
        {},
        effectiveUserId,
        userWallet || "",
        { taskConfig: task.task_config || null, taskId },
      );

      if (!result.success) {
        return res.status(400).json({
          error: result.error || "Verification failed",
          code: result.code || "VERIFICATION_FAILED",
        });
      }

      verificationData = {
        ...(result.metadata || {}),
        verificationMethod: "automatic",
      };
    }

    // AI verification for submit_proof tasks with AI config
    let aiApproved = false;
    let aiDeferred = false;
    let aiRetry = false;
    let aiRetryFeedback: string | null = null;
    const requiresAIVerification = Boolean(
      strategy &&
      !requiresBlockchainVerification &&
      task.task_type === "submit_proof",
    );

    if (requiresAIVerification && strategy) {
      const proofUrl =
        typeof getStringProperty(clientVerificationRecord, "inputData") ===
        "string"
          ? String(
              getStringProperty(clientVerificationRecord, "inputData"),
            ).trim()
          : typeof inputData === "string"
            ? inputData.trim()
            : null;

      const aiInput = {
        ...(clientVerificationRecord || {}),
        ...(typeof inputData === "object" && inputData ? inputData : {}),
      } as Record<string, unknown>;

      const result = await strategy.verify(
        task.task_type,
        aiInput,
        effectiveUserId,
        userWallet || "",
        { taskConfig: task.task_config || null, taskId },
      );

      if (!result.success && result.code === "AI_IMAGE_REQUIRED") {
        return res.status(400).json({
          error: result.error || "Screenshot proof is required",
          code: "AI_IMAGE_REQUIRED",
        });
      }

      if (result.success) {
        aiApproved = true;
        verificationData = {
          ...(clientVerificationRecord || {}),
          ...(proofUrl ? { proofUrl } : {}),
          ...(result.metadata || {}),
          verificationMethod: "ai",
        };
      } else if (
        result.code === "AI_RETRY" ||
        result.code === "AI_LOW_CONFIDENCE"
      ) {
        aiRetry = true;
        aiRetryFeedback = result.error || "Please resubmit your proof";
        verificationData = {
          ...(clientVerificationRecord || {}),
          ...(proofUrl ? { proofUrl } : {}),
          ...(result.metadata || {}),
          verificationMethod: "ai",
          aiRetry: true,
        };
      } else if (result.code !== "AI_NOT_CONFIGURED") {
        aiDeferred = true;
        // AI ran but didn't approve — store metadata for admin context
        verificationData = {
          ...(clientVerificationRecord || {}),
          ...(proofUrl ? { proofUrl } : {}),
          ...(result.metadata || {}),
          verificationMethod: "ai",
          aiDeferred: true,
        };
      }
      // If AI_NOT_CONFIGURED, verificationData stays null — normal manual flow
    }

    // AI verification for submit_text tasks with AI config
    const requiresAITextVerification = Boolean(
      strategy &&
      !requiresBlockchainVerification &&
      task.task_type === "submit_text",
    );

    if (requiresAITextVerification && strategy) {
      const submittedText =
        typeof inputData === "string" ? inputData.trim() : "";

      const rawPrompt = getTaskConfigString(
        taskConfig,
        "ai_verification_prompt",
      );

      // Build token map — {wallet} is always available without a Privy call
      const tokenMap: Record<string, string> = {
        wallet: userWallet || "[not linked]",
      };

      // Conditionally fetch full Privy profile when social/account tokens are in the prompt
      if (rawPrompt && promptRequiresPrivyFetch(rawPrompt)) {
        const walletMatchMode = getWalletMatchMode(taskConfig);

        try {
          const privy = createPrivyClient();
          const profile: User = await privy.getUserById(effectiveUserId);
          const accounts = profile?.linkedAccounts ?? [];

          // External wallets
          const externalWallets = accounts
            .filter(isExternalWalletLinkedAccount)
            .map((a) => a.address)
            .filter(Boolean);
          tokenMap.linked_wallets =
            walletMatchMode === "any_linked" && externalWallets.length > 0
              ? externalWallets.join(", ")
              : "[not linked]";

          // Email
          const emailAccount = accounts.find((a) => a.type === "email");
          tokenMap.email =
            getStringProperty(asObjectRecord(emailAccount), "address") ||
            "[not linked]";

          // Twitter/X
          const twitterAccount = accounts.find(
            (a) => a.type === "twitter_oauth",
          );
          tokenMap.x_username =
            getStringProperty(asObjectRecord(twitterAccount), "username") ||
            "[not linked]";

          // Discord
          const discordAccount = accounts.find(
            (a) => a.type === "discord_oauth",
          );
          tokenMap.discord_username =
            getStringProperty(asObjectRecord(discordAccount), "username") ||
            "[not linked]";

          // GitHub
          const githubAccount = accounts.find((a) => a.type === "github_oauth");
          tokenMap.github_username =
            getStringProperty(asObjectRecord(githubAccount), "username") ||
            "[not linked]";

          // Farcaster
          const farcasterLinked = accounts.find(isFarcasterLinkedAccount);
          tokenMap.farcaster_username =
            farcasterLinked?.username || "[not linked]";
          tokenMap.farcaster_fid = farcasterLinked
            ? String(farcasterLinked.fid)
            : "[not linked]";

          // Telegram
          const telegramAccount = accounts.find((a) => a.type === "telegram");
          tokenMap.telegram_username =
            getStringProperty(asObjectRecord(telegramAccount), "username") ||
            "[not linked]";
        } catch (err: unknown) {
          log.warn(
            "Failed to fetch Privy profile for text token substitution",
            {
              userId: effectiveUserId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
          // Proceed with only {wallet} resolved; social tokens remain [not linked]
        }
      }

      const resolvedPrompt = rawPrompt
        ? substituteContextTokens(rawPrompt, tokenMap)
        : "";

      const result = await strategy.verify(
        task.task_type,
        { inputData: submittedText, resolvedPrompt },
        effectiveUserId,
        userWallet || "",
        { taskConfig: task.task_config || null, taskId },
      );

      if (!result.success && result.code === "AI_TEXT_REQUIRED") {
        return res.status(400).json({
          error: result.error || "Text submission is required",
          code: "AI_TEXT_REQUIRED",
        });
      }

      if (result.success) {
        aiApproved = true;
        verificationData = {
          submittedText,
          ...(result.metadata || {}),
          verificationMethod: "ai",
        };
      } else if (
        result.code === "AI_RETRY" ||
        result.code === "AI_LOW_CONFIDENCE"
      ) {
        aiRetry = true;
        aiRetryFeedback = result.error || "Please resubmit your answer";
        verificationData = {
          submittedText,
          ...(result.metadata || {}),
          verificationMethod: "ai",
          aiRetry: true,
        };
      } else if (result.code !== "AI_NOT_CONFIGURED") {
        aiDeferred = true;
        verificationData = {
          submittedText,
          ...(result.metadata || {}),
          verificationMethod: "ai",
          aiDeferred: true,
        };
      }
      // If AI_NOT_CONFIGURED, verificationData stays null — normal manual flow
    }

    // Determine initial status
    // AI-approved tasks bypass admin review. If AI ran and deferred, always send to admin review.
    const initialStatus = aiApproved
      ? "completed"
      : aiRetry
        ? "retry"
        : aiDeferred
          ? "pending"
          : task.requires_admin_review
            ? "pending"
            : "completed";

    if (task.task_type === "link_farcaster") {
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

    if (task.task_type === "link_wallet") {
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

    if (task.task_type === "link_telegram") {
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

    if (pendingTxRegistration) {
      const parsedBlockNumber =
        pendingTxRegistration.metadata.blockNumber !== null
          ? Number(pendingTxRegistration.metadata.blockNumber)
          : null;
      const { data: atomicResult, error: atomicError } = await supabase.rpc(
        "complete_quest_task_with_tx",
        {
          p_user_id: effectiveUserId,
          p_quest_id: questId,
          p_task_id: taskId,
          p_existing_completion_id: existingCompletion?.id ?? null,
          p_verification_data: verificationData,
          p_submission_data: inputData ?? null,
          p_submission_status: initialStatus,
          p_admin_feedback: initialStatus === "retry" ? aiRetryFeedback : null,
          p_chain_id: CHAIN_ID,
          p_tx_hash: pendingTxRegistration.txHash,
          p_task_type: pendingTxRegistration.taskType,
          p_verified_amount: pendingTxRegistration.metadata.amount,
          p_event_name: pendingTxRegistration.metadata.eventName,
          p_block_number:
            typeof parsedBlockNumber === "number" &&
            Number.isFinite(parsedBlockNumber)
              ? parsedBlockNumber
              : null,
          p_log_index: pendingTxRegistration.metadata.logIndex,
        },
      );

      if (atomicError) {
        log.error("Atomic task completion RPC failed", {
          error: atomicError,
          taskId,
          questId,
          userId: effectiveUserId,
        });
        return res.status(500).json({ error: "Failed to complete task" });
      }

      const atomicPayload = atomicResult as {
        success?: boolean;
        kind?: string;
        error?: string;
      } | null;

      if (!atomicPayload?.success) {
        if (atomicPayload?.kind === "tx_conflict") {
          return res.status(400).json({
            error:
              atomicPayload.error ||
              "This transaction has already been used to complete a quest task",
            code: "TX_ALREADY_USED",
          });
        }

        if (atomicPayload?.kind === "not_found") {
          return res.status(409).json({
            error:
              atomicPayload.error ||
              "Task submission could not be updated because it no longer exists",
            code: "TASK_COMPLETION_STALE",
          });
        }

        log.error("Atomic task completion returned failure", {
          atomicPayload,
          taskId,
          questId,
          userId: effectiveUserId,
        });
        return res.status(500).json({ error: "Failed to complete task" });
      }
    } else if (existingCompletion) {
      // UPDATE existing completion for retry/failed cases
      const { error } = await supabase
        .from("user_task_completions")
        .update({
          verification_data: verificationData,
          submission_data: inputData,
          submission_status: initialStatus,
          admin_feedback: initialStatus === "retry" ? aiRetryFeedback : null, // Clear previous feedback unless AI requested retry
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
        admin_feedback: initialStatus === "retry" ? aiRetryFeedback : null,
        reward_claimed: false,
      });
      completionError = error;
    }

    if (completionError) {
      log.error("Error completing task:", completionError);
      return res.status(500).json({ error: "Failed to complete task" });
    }

    // Send notification on first pending submission and on transitions back to pending.
    if (
      initialStatus === "pending" &&
      (!existingCompletion ||
        existingCompletion.submission_status !== "pending")
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
      submissionStatus: initialStatus,
      feedback: initialStatus === "retry" ? aiRetryFeedback : undefined,
      message:
        initialStatus === "pending"
          ? "Task submitted for review"
          : initialStatus === "retry"
            ? "Please adjust your proof and resubmit"
            : "Task completed successfully",
    });
  } catch (error) {
    log.error("Error in complete task API:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
