import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { sendEmail } from "./mailgun";
import { sendEmailWithDedup } from "./dedup";
import { getAdminReviewNotificationEmail } from "./templates";
import {
  getMilestoneSubmissionContext,
  getQuestSubmissionContext,
} from "./helpers";
import { sendAdminTelegramNotification } from "@/lib/notifications/telegram";

const log = getLogger("email:admin-notifications");

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getAdminReviewEmail(): string {
  return process.env.ADMIN_REVIEW_EMAIL || "info@p2einferno.com";
}

/**
 * Send email notification to admin when a milestone task submission requires review.
 * Uses fire-and-forget pattern - never throws, always returns boolean.
 *
 * @param submissionId - UUID of the task submission
 * @param userId - Privy user ID
 * @param taskId - Task UUID
 * @returns Promise<boolean> - true if email sent successfully, false otherwise
 */
export async function sendMilestoneReviewNotification(
  submissionId: string,
  userId: string,
  taskId: string,
): Promise<boolean> {
  try {
    log.info("Sending milestone review notification", {
      submissionId,
      userId,
      taskId,
    });

    const supabase = createAdminClient();

    // Fetch submission context
    const context = await getMilestoneSubmissionContext(
      supabase,
      submissionId,
      userId,
    );

    if (!context) {
      log.warn("Failed to fetch milestone submission context, skipping email", {
        submissionId,
        userId,
      });
      return false;
    }

    // Build review URL
    const reviewUrl = `${getBaseUrl()}/admin/cohorts/tasks/${taskId}/submissions`;

    // Generate email
    const email = getAdminReviewNotificationEmail({
      taskTitle: context.taskTitle,
      userName: context.userName,
      submissionType: context.submissionType,
      reviewUrl,
    });

    // Send with deduplication
    const adminEmail = getAdminReviewEmail();
    const dedupKey = `milestone_review_${submissionId}`;

    // Send parallel Telegram notification (fire-and-forget)
    sendAdminTelegramNotification(
      "New Milestone Submission",
      `${context.userName} submitted: ${context.taskTitle} (${context.submissionType})`,
      reviewUrl,
      "task_reviewed",
    ).catch((err) =>
      log.error("Failed to send admin Telegram notification", {
        submissionId,
        err,
      }),
    );

    const result = await sendEmailWithDedup(
      "admin_review_notification",
      submissionId,
      adminEmail,
      dedupKey,
      () =>
        sendEmail({
          to: adminEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          tags: ["admin-review", "milestone", "submission"],
        }),
    );

    if (result.sent) {
      log.info("Milestone review email sent successfully", {
        submissionId,
        taskId,
      });
      return true;
    } else if (result.skipped) {
      log.info("Milestone review email skipped (dedup)", {
        submissionId,
        dedupKey,
      });
      return true; // Consider skipped as success (already sent)
    } else {
      log.error("Failed to send milestone review email", {
        submissionId,
        error: result.error,
      });
      return false;
    }
  } catch (err) {
    log.error("Exception in sendMilestoneReviewNotification", {
      submissionId,
      userId,
      taskId,
      err,
    });
    return false;
  }
}

/**
 * Send email notification to admin when a quest task submission requires review.
 * Uses fire-and-forget pattern - never throws, always returns boolean.
 *
 * @param taskId - Quest task UUID
 * @param userId - Privy user ID
 * @param questId - Quest UUID
 * @returns Promise<boolean> - true if email sent successfully, false otherwise
 */
export async function sendQuestReviewNotification(
  taskId: string,
  userId: string,
  questId: string,
): Promise<boolean> {
  try {
    log.info("Sending quest review notification", { taskId, userId, questId });

    const supabase = createAdminClient();

    // Fetch submission context
    const context = await getQuestSubmissionContext(supabase, taskId, userId);

    if (!context) {
      log.warn("Failed to fetch quest submission context, skipping email", {
        taskId,
        userId,
      });
      return false;
    }

    // Build review URL - quest submissions are on quest detail page with tabs
    const reviewUrl = `${getBaseUrl()}/admin/quests/${questId}`;

    // Generate email
    const email = getAdminReviewNotificationEmail({
      taskTitle: context.taskTitle,
      userName: context.userName,
      submissionType: context.submissionType,
      reviewUrl,
    });

    // Send with deduplication
    const adminEmail = getAdminReviewEmail();
    const attemptKey = context.submissionAttemptKey || context.submissionId;
    const dedupKey = attemptKey
      ? `quest_review_${taskId}_${userId}_${attemptKey}`
      : `quest_review_${taskId}_${userId}`;

    if (!attemptKey) {
      log.warn("Quest review dedup missing attempt key; falling back to legacy", {
        taskId,
        userId,
      });
    }

    // Send parallel Telegram notification (fire-and-forget)
    sendAdminTelegramNotification(
      "New Quest Submission",
      `${context.userName} submitted: ${context.taskTitle} (${context.submissionType})`,
      reviewUrl,
      "task_reviewed",
    ).catch((err) =>
      log.error("Failed to send admin Telegram notification", {
        taskId,
        err,
      }),
    );

    const result = await sendEmailWithDedup(
      "admin_review_notification",
      taskId,
      adminEmail,
      dedupKey,
      () =>
        sendEmail({
          to: adminEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          tags: ["admin-review", "quest", "submission"],
        }),
    );

    if (result.sent) {
      log.info("Quest review email sent successfully", { taskId, questId });
      return true;
    } else if (result.skipped) {
      log.info("Quest review email skipped (dedup)", { taskId, dedupKey });
      return true; // Consider skipped as success (already sent)
    } else {
      log.error("Failed to send quest review email", {
        taskId,
        error: result.error,
      });
      return false;
    }
  } catch (err) {
    log.error("Exception in sendQuestReviewNotification", {
      taskId,
      userId,
      questId,
      err,
    });
    return false;
  }
}
