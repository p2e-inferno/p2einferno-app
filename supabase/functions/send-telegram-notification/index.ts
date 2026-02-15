// Path: supabase/functions/send-telegram-notification/index.ts
// Called by pg_net trigger on notifications INSERT. verify_jwt = false in config.toml.
// Low-risk: only sends Telegram messages, no DB access.

import {
  sendTelegramMessage,
  formatNotificationMessage,
} from "../_shared/telegram-utils.ts";

const log = {
  info: (...args: unknown[]) =>
    console.log("[send-telegram-notification]", ...args),
  warn: (...args: unknown[]) =>
    console.warn("[send-telegram-notification]", ...args),
  error: (...args: unknown[]) =>
    console.error("[send-telegram-notification]", ...args),
};

const BASE_URL =
  Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: {
    chat_id?: number;
    title?: string;
    message?: string;
    link?: string | null;
    type?: string;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { chat_id, title, message, link, type } = payload;

  // Validate required fields
  if (!chat_id) {
    return new Response(JSON.stringify({ error: "Missing chat_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!title && !message) {
    return new Response(
      JSON.stringify({ error: "Missing title or message" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const text = formatNotificationMessage(
    title || "",
    message || "",
    link || null,
    type || "",
    BASE_URL,
  );

  log.info("Sending notification", { chat_id, type: type || "unknown" });

  const result = await sendTelegramMessage(chat_id, text);

  if (!result.ok) {
    log.error("Failed to send", { chat_id, error: result.error });
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
