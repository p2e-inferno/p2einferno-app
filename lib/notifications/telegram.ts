import { getLogger } from "@/lib/utils/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

const log = getLogger("notifications:telegram");

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

// Map notification type to emoji
const TYPE_EMOJI: Record<string, string> = {
  task_completed: "\u2705", // ✅
  milestone_completed: "\uD83C\uDFC6", // 🏆
  enrollment_created: "\uD83D\uDCDA", // 📚
  enrollment_status: "\uD83D\uDCCB", // 📋
  application_status: "\uD83D\uDCDD", // 📝
  task_reviewed: "\uD83D\uDCEC", // 📬
  quest_created: "\uD83C\uDD95", // 🆕
  daily_quest_created: "\uD83C\uDD95", // 🆕
  daily_quest_refresh: "\uD83D\uDD04", // 🔄
};

function escapeHtml(text: string): string {
  // Telegram HTML only supports &lt; &gt; &amp; — no &quot;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format a notification into an HTML Telegram message.
 */
export function formatNotificationMessage(
  title: string,
  message: string,
  link: string | null,
  type: string,
): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const emoji = TYPE_EMOJI[type] || "\uD83D\uDD14"; // 🔔 default
  const lines: string[] = [
    `${emoji} <b>${escapeHtml(title)}</b>`,
    "",
    escapeHtml(message),
  ];

  if (link) {
    const fullUrl = link.startsWith("http") ? link : `${baseUrl}${link}`;
    const safeUrl = escapeHtml(fullUrl);
    lines.push("");
    lines.push(`\uD83D\uDD17 <a href="${safeUrl}">View in app</a>`);
  }

  return lines.join("\n");
}

/**
 * Send a message to a Telegram chat via the Bot API.
 */
export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
): Promise<TelegramSendResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    log.error("Missing TELEGRAM_BOT_TOKEN env var");
    return { ok: false, error: "Bot token not configured" };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      log.error("Telegram API error", { status: res.status, body });
      return { ok: false, error: `Telegram API: ${res.status}` };
    }

    return { ok: true };
  } catch (error) {
    log.error("Telegram network error", { error });
    return { ok: false, error: (error as Error).message };
  }
}

// Telegram Bot API allows ~30 messages/sec to different chats.
// We send in batches of 25 with a 1s pause between batches to stay under the limit.
const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

/**
 * Broadcast a Telegram notification to all users with notifications enabled.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * Sends in parallel batches of 25 to respect Telegram's ~30 msgs/sec rate limit
 * while keeping total time manageable for serverless environments.
 * ~5 000 users ≈ 200 batches × 1s ≈ 3–4 min (within Vercel Pro 300s timeout).
 */
export async function broadcastTelegramNotification(
  supabase: SupabaseClient,
  title: string,
  message: string,
  link: string | null,
  type = "quest_created",
): Promise<void> {
  try {
    const text = formatNotificationMessage(title, message, link, type);

    // In development, only send to a single test chat to avoid spamming real users
    const testChatId = process.env.TELEGRAM_TEST_CHAT_ID;
    if (testChatId) {
      log.info("Dev mode: sending broadcast to test chat only", { testChatId });
      const result = await sendTelegramMessage(Number(testChatId), text);
      log.info("Dev broadcast complete", { ok: result.ok, error: result.error });
      return;
    }

    const BROADCAST_LIMIT = 10000;
    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("telegram_chat_id")
      .eq("telegram_notifications_enabled", true)
      .not("telegram_chat_id", "is", null)
      .limit(BROADCAST_LIMIT);

    if (error) {
      log.error("Failed to query Telegram-enabled users", { error });
      return;
    }

    if (users && users.length >= BROADCAST_LIMIT) {
      log.warn("Broadcast hit row limit — some users may not receive notifications", {
        limit: BROADCAST_LIMIT,
        returned: users.length,
      });
    }

    if (!users || users.length === 0) {
      log.info("No Telegram-enabled users for broadcast");
      return;
    }

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((user) => sendTelegramMessage(user.telegram_chat_id, text)),
      );

      for (const result of results) {
        if (result.ok) sent++;
        else failed++;
      }

      // Pause between batches to respect rate limits (skip after last batch)
      if (i + BATCH_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    log.info("Broadcast complete", { sent, failed, total: users.length });
  } catch (error) {
    log.error("Broadcast failed", { error });
  }
}

/**
 * Send a Telegram notification to the admin chat for task review.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * Only sends if ADMIN_TELEGRAM_CHAT_ID is configured.
 *
 * @param title - Notification title (e.g., "New Quest Submission")
 * @param message - Notification message (e.g., "User John submitted Task X")
 * @param reviewUrl - Full URL to review the submission
 * @param type - Notification type for emoji selection (defaults to 'task_reviewed')
 * @returns Promise<boolean> - true if sent successfully, false otherwise
 */
export async function sendAdminTelegramNotification(
  title: string,
  message: string,
  reviewUrl: string,
  type = "task_reviewed",
): Promise<boolean> {
  const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;

  // Skip silently if not configured
  if (!adminChatId) {
    log.debug("Admin Telegram notifications not configured (ADMIN_TELEGRAM_CHAT_ID missing)");
    return false;
  }

  try {
    const text = formatNotificationMessage(title, message, reviewUrl, type);
    const result = await sendTelegramMessage(adminChatId, text);

    if (result.ok) {
      log.info("Admin Telegram notification sent", { title, type });
      return true;
    } else {
      log.error("Failed to send admin Telegram notification", {
        title,
        error: result.error,
      });
      return false;
    }
  } catch (error) {
    log.error("Exception in sendAdminTelegramNotification", { title, error });
    return false;
  }
}
