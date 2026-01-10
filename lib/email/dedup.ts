import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:dedup");

/**
 * Atomically claim a dedup slot (insert-once).
 * Returns true if caller owns the send.
 */
export async function claimEmailSend(
  eventType: string,
  targetId: string,
  recipientEmail: string,
  dedupKey: string,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("email_events").insert({
    event_type: eventType,
    target_id: targetId,
    recipient_email: recipientEmail.toLowerCase(),
    dedup_key: dedupKey,
    status: "pending",
    created_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      log.info("Dedup claim exists, skipping", { eventType, targetId, dedupKey });
      return false;
    }
    log.error("Error claiming email send", { eventType, targetId, error });
    // Fail open but log for monitoring
    return true;
  }

  return true;
}

/**
 * Record that an email was sent successfully.
 */
export async function recordEmailSent(
  eventType: string,
  targetId: string,
  recipientEmail: string,
  dedupKey: string,
  messageId?: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("email_events")
    .update({
      message_id: messageId,
      sent_at: new Date().toISOString(),
      status: "sent",
    })
    .eq("event_type", eventType)
    .eq("target_id", targetId)
    .eq("recipient_email", recipientEmail.toLowerCase())
    .eq("dedup_key", dedupKey);

  if (error) {
    log.error("Error recording email sent", { eventType, targetId, error });
  }
}

/**
 * Record that an email failed to send (for retry queue).
 */
export async function recordEmailFailed(
  eventType: string,
  targetId: string,
  recipientEmail: string,
  dedupKey: string,
  errorMessage?: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("email_events")
    .update({
      status: "failed",
      error_message: errorMessage || "send_failed",
      updated_at: new Date().toISOString(),
    })
    .eq("event_type", eventType)
    .eq("target_id", targetId)
    .eq("recipient_email", recipientEmail.toLowerCase())
    .eq("dedup_key", dedupKey);

  if (error) {
    log.error("Error recording email failure", { eventType, targetId, error });
  }
}

/**
 * High-level helper: atomically claim -> send -> mark sent/failed.
 */
export async function sendEmailWithDedup(
  eventType: string,
  targetId: string,
  recipientEmail: string,
  dedupKey: string,
  sendFn: () => Promise<{ ok: boolean; messageId?: string }>,
): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const canSend = await claimEmailSend(
    eventType,
    targetId,
    recipientEmail,
    dedupKey,
  );

  if (!canSend) {
    log.info("Email already claimed/sent, skipping", {
      eventType,
      targetId,
      dedupKey,
    });
    return { sent: false, skipped: true };
  }

  const result = await sendFn();

  if (result.ok) {
    await recordEmailSent(
      eventType,
      targetId,
      recipientEmail,
      dedupKey,
      result.messageId,
    );
    return { sent: true, skipped: false };
  }

  await recordEmailFailed(
    eventType,
    targetId,
    recipientEmail,
    dedupKey,
    "send_failed",
  );
  return { sent: false, skipped: false, error: "Send failed" };
}
