import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/notifications/telegram";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:webhooks:telegram");

/**
 * Telegram bot webhook handler.
 * Receives updates from Telegram servers, handles /start activation flow.
 * Auth: X-Telegram-Bot-Api-Secret-Token header (set via setWebhook API).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end("Method Not Allowed");
  }

  // Verify Telegram webhook secret
  const secretToken = req.headers["x-telegram-bot-api-secret-token"];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!expectedSecret || secretToken !== expectedSecret) {
    log.warn("Invalid or missing webhook secret");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const update = req.body;

  // Only handle message updates
  if (!update?.message) {
    return res.status(200).json({ ok: true });
  }

  const { message } = update;
  const chatId = message.chat?.id;
  const text = message.text || "";

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  // Handle /start command
  if (text.startsWith("/start")) {
    const token = text.replace("/start", "").trim();

    if (!token) {
      await sendTelegramMessage(
        chatId,
        "Welcome to P2E Inferno! To enable notifications, click the 'Enable Telegram' button on your profile page.",
      );
      return res.status(200).json({ ok: true });
    }

    await handleStartCommand(chatId, token, res);
    return;
  }

  // Handle other messages with help text
  await sendTelegramMessage(
    chatId,
    "I'm the P2E Inferno notification bot. To enable notifications, visit your profile page and click 'Enable Telegram Notifications'.",
  );

  return res.status(200).json({ ok: true });
}

async function handleStartCommand(
  chatId: number,
  token: string,
  res: NextApiResponse,
) {
  const supabase = createAdminClient();

  try {
    // Look up the activation token
    const { data: tokenRecord, error: tokenError } = await supabase
      .from("telegram_activation_tokens")
      .select("id, user_profile_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (tokenError || !tokenRecord) {
      log.warn("Token not found", { token: token.substring(0, 8) + "..." });
      await sendTelegramMessage(
        chatId,
        "This activation link is invalid. Please generate a new one from your profile page.",
      );
      return res.status(200).json({ ok: true });
    }

    // Check if token is already used
    if (tokenRecord.used_at) {
      await sendTelegramMessage(
        chatId,
        "This activation link has already been used. If you need to re-enable notifications, visit your profile page.",
      );
      return res.status(200).json({ ok: true });
    }

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await sendTelegramMessage(
        chatId,
        "This activation link has expired. Please generate a new one from your profile page.",
      );
      return res.status(200).json({ ok: true });
    }

    // Mark token as used — .select().single() returns error when 0 rows updated,
    // catching the race condition where a concurrent request already claimed this token.
    const { data: markData, error: markError } = await supabase
      .from("telegram_activation_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", tokenRecord.id)
      .is("used_at", null)
      .select("id")
      .single();

    if (markError || !markData) {
      log.warn("Token already claimed (race condition or DB error)", { error: markError });
      await sendTelegramMessage(
        chatId,
        "This activation link has already been used. If you need to re-enable notifications, visit your profile page.",
      );
      return res.status(200).json({ ok: true });
    }

    // Update user profile with Telegram chat ID
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({
        telegram_chat_id: chatId,
        telegram_notifications_enabled: true,
      })
      .eq("id", tokenRecord.user_profile_id);

    if (updateError) {
      log.error("Failed to update user profile", { error: updateError });
      await sendTelegramMessage(
        chatId,
        "Something went wrong while enabling notifications. Please try again.",
      );
      return res.status(200).json({ ok: true });
    }

    log.info("Telegram notifications enabled", {
      userProfileId: tokenRecord.user_profile_id,
      chatId,
    });

    await sendTelegramMessage(
      chatId,
      "\u2705 Notifications enabled! You'll receive updates for quest approvals, completions, milestone progress, and more.\n\nTo disable notifications, visit your profile page.",
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    log.error("Error handling /start command", { error });
    await sendTelegramMessage(
      chatId,
      "Something went wrong. Please try again later.",
    );
    return res.status(200).json({ ok: true });
  }
}
