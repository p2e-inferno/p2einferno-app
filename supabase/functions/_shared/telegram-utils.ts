/* deno-lint-ignore-file no-explicit-any */
declare const Deno: { env: { get(key: string): string | undefined } };

export interface TelegramSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Send a message to a Telegram chat via the Bot API.
 * Thin wrapper around https://api.telegram.org/bot<TOKEN>/sendMessage.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  parseMode: "HTML" | "MarkdownV2" = "HTML",
): Promise<TelegramSendResult> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    console.error("[TELEGRAM] Missing TELEGRAM_BOT_TOKEN env var");
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
          parse_mode: parseMode,
          disable_web_page_preview: false,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("[TELEGRAM] API error:", res.status, body);
      return { ok: false, error: `Telegram API: ${res.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[TELEGRAM] Network error:", error);
    return { ok: false, error: (error as Error).message };
  }
}

// Map notification type to emoji
const TYPE_EMOJI: Record<string, string> = {
  task_completed: "\u2705",       // ✅
  milestone_completed: "\uD83C\uDFC6", // 🏆
  enrollment_created: "\uD83D\uDCDA",  // 📚
  enrollment_status: "\uD83D\uDCCB",   // 📋
  application_status: "\uD83D\uDCDD",  // 📝
  task_reviewed: "\uD83D\uDCEC",       // 📬
  quest_created: "\uD83C\uDD95",       // 🆕
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
  baseUrl: string,
): string {
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
