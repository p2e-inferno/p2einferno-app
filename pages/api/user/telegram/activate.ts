import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:telegram:activate");

const TOKEN_EXPIRY_MINUTES = 15;

/**
 * API for managing Telegram notification activation.
 * GET  - Check notification status
 * POST - Generate activation token (deep link)
 * DELETE - Disable notifications
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const user = await getPrivyUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = createAdminClient();

  // Look up user profile
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, telegram_chat_id, telegram_notifications_enabled")
    .eq("privy_user_id", user.id)
    .single();

  if (profileError || !profile) {
    log.error("Profile lookup failed", { error: profileError });
    return res.status(404).json({ error: "User profile not found" });
  }

  switch (req.method) {
    case "GET":
      return handleGet(profile, res);
    case "POST":
      return handlePost(profile, supabase, res);
    case "DELETE":
      return handleDelete(profile, supabase, res);
    default:
      res.setHeader("Allow", ["GET", "POST", "DELETE"]);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

function handleGet(
  profile: {
    telegram_chat_id: number | null;
    telegram_notifications_enabled: boolean;
  },
  res: NextApiResponse,
) {
  return res.status(200).json({
    enabled: profile.telegram_notifications_enabled,
    linked: profile.telegram_chat_id != null,
  });
}

async function handlePost(
  profile: { id: string },
  supabase: ReturnType<typeof createAdminClient>,
  res: NextApiResponse,
) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    log.error("Missing NEXT_PUBLIC_TELEGRAM_BOT_USERNAME env var");
    return res.status(500).json({ error: "Telegram bot not configured" });
  }

  try {
    // Invalidate any existing unused tokens for this user
    const { error: invalidateError } = await supabase
      .from("telegram_activation_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_profile_id", profile.id)
      .is("used_at", null);

    if (invalidateError) {
      log.warn("Failed to invalidate old tokens", { error: invalidateError });
    }

    // Generate a cryptographically secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000,
    ).toISOString();

    // Insert new activation token
    const { error: insertError } = await supabase
      .from("telegram_activation_tokens")
      .insert({
        user_profile_id: profile.id,
        token,
        expires_at: expiresAt,
      });

    if (insertError) {
      log.error("Failed to create activation token", { error: insertError });
      return res
        .status(500)
        .json({ error: "Failed to generate activation link" });
    }

    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    log.info("Activation token generated", { userProfileId: profile.id });

    return res.status(200).json({ deepLink });
  } catch (error) {
    log.error("Error generating activation token", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handleDelete(
  profile: { id: string },
  supabase: ReturnType<typeof createAdminClient>,
  res: NextApiResponse,
) {
  try {
    const { error } = await supabase
      .from("user_profiles")
      .update({
        telegram_notifications_enabled: false,
        telegram_chat_id: null,
      })
      .eq("id", profile.id);

    if (error) {
      log.error("Failed to disable Telegram notifications", { error });
      return res.status(500).json({ error: "Failed to disable notifications" });
    }

    log.info("Telegram notifications disabled", { userProfileId: profile.id });
    return res.status(200).json({ success: true });
  } catch (error) {
    log.error("Error disabling Telegram notifications", { error });
    return res.status(500).json({ error: "Internal server error" });
  }
}
