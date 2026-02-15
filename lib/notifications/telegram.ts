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
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * Broadcast a Telegram notification to all users with notifications enabled.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function broadcastTelegramNotification(
  supabase: SupabaseClient,
  title: string,
  message: string,
  link: string | null,
  type = "quest_created",
): Promise<void> {
  try {
    const { data: users, error } = await supabase
      .from("user_profiles")
      .select("telegram_chat_id")
      .eq("telegram_notifications_enabled", true)
      .not("telegram_chat_id", "is", null);

    if (error) {
      log.error("Failed to query Telegram-enabled users", { error });
      return;
    }

    if (!users || users.length === 0) {
      log.info("No Telegram-enabled users for broadcast");
      return;
    }

    const text = formatNotificationMessage(title, message, link, type);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const result = await sendTelegramMessage(user.telegram_chat_id, text);
      if (result.ok) {
        sent++;
      } else {
        failed++;
      }

      // Respect Telegram rate limits (~30 msgs/sec)
      if (users.length > 20) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    log.info("Broadcast complete", { sent, failed, total: users.length });
  } catch (error) {
    log.error("Broadcast failed", { error });
  }
}
