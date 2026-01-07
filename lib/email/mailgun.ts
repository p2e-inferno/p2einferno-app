import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:mailgun");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
  testMode?: boolean;
}

export interface EmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalize and validate an email address.
 * Returns lowercased/trimmed email or null if invalid.
 */
export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  return EMAIL_REGEX.test(lowered) ? lowered : null;
}

/**
 * Send email via Mailgun API.
 */
export async function sendEmail(
  options: EmailOptions,
): Promise<EmailResult> {
  const { to, subject, text, html, tags = [], testMode } = options;

  const normalizedTo = normalizeEmail(to);
  if (!normalizedTo) {
    log.error("Invalid email address", { to });
    return { ok: false, error: "Invalid email address" };
  }

  const domain = process.env.MAILGUN_DOMAIN;
  const apiKey = process.env.MAILGUN_API_KEY;
  const from = process.env.MAILGUN_FROM;
  const apiUrl = process.env.MAILGUN_API_URL || "https://api.mailgun.net";
  const envTestMode = process.env.MAILGUN_TEST_MODE === "true";

  if (!domain || !apiKey || !from) {
    log.error("Mailgun not configured", {
      hasDomain: !!domain,
      hasKey: !!apiKey,
      hasFrom: !!from,
    });
    return { ok: false, error: "Email service not configured" };
  }

  const form = new FormData();
  form.append("from", from);
  form.append("to", normalizedTo);
  form.append("subject", subject);
  form.append("text", text);
  if (html) form.append("html", html);
  tags.forEach((tag) => form.append("o:tag", tag));
  if (testMode || envTestMode) form.append("o:testmode", "yes");

  try {
    const res = await fetch(`${apiUrl}/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      },
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      log.error("Mailgun API error", { status: res.status, body });
      return { ok: false, error: `Mailgun error: ${res.status}` };
    }

    const data = await res.json();
    log.info("Email sent successfully", {
      to: normalizedTo,
      messageId: data.id,
      testMode: testMode || envTestMode,
    });
    return { ok: true, messageId: data.id };
  } catch (error) {
    log.error("Network error sending email", { error });
    return { ok: false, error: (error as Error).message };
  }
}
