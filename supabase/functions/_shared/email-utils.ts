/* deno-lint-ignore-file no-explicit-any */
declare const Deno: { env: { get(key: string): string | undefined } };

import { EMAIL_REGEX } from "./constants.ts";

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  return EMAIL_REGEX.test(lowered) ? lowered : null;
}

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

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html, tags = [], testMode } = options;

  if (!EMAIL_REGEX.test(to)) {
    console.error("[EMAIL] Invalid email address:", to);
    return { ok: false, error: "Invalid email address" };
  }

  const MAILGUN_DOMAIN = Deno.env.get("MAILGUN_DOMAIN");
  const MAILGUN_API_KEY = Deno.env.get("MAILGUN_API_KEY");
  const MAILGUN_FROM = Deno.env.get("MAILGUN_FROM");
  const MAILGUN_API_URL = Deno.env.get("MAILGUN_API_URL") ??
    "https://api.mailgun.net";
  const MAILGUN_TEST_MODE = Deno.env.get("MAILGUN_TEST_MODE") === "true";

  if (!MAILGUN_DOMAIN || !MAILGUN_API_KEY || !MAILGUN_FROM) {
    console.error("[EMAIL] Missing Mailgun configuration");
    return { ok: false, error: "Email service not configured" };
  }

  const formData = new FormData();
  formData.append("from", MAILGUN_FROM);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("text", text);
  if (html) formData.append("html", html);
  tags.forEach((tag) => formData.append("o:tag", tag));
  if (testMode || MAILGUN_TEST_MODE) formData.append("o:testmode", "yes");

  try {
    const response = await fetch(
      `${MAILGUN_API_URL}/v3/${MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[EMAIL] Mailgun API error:", response.status, errorText);
      return { ok: false, error: `Mailgun error: ${response.status}` };
    }

    const data = await response.json();
    console.log("[EMAIL] Email sent:", { to, messageId: data.id });
    return { ok: true, messageId: data.id };
  } catch (error) {
    console.error("[EMAIL] Network error:", error);
    return { ok: false, error: (error as Error).message };
  }
}

const BRAND_COLOR = "#E4532A";
const BRAND_DARK = "#1C1A19";
const BG_COLOR = "#F5F2EE";
const CARD_BG = "#FFFFFF";
const BORDER_COLOR = "#EFE7E0";
const MUTED = "#6B5E55";
const ACCENT = "#F9E7DB";

function getBaseUrl(): string {
  return Deno.env.get("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

function wrapHtml(title: string, body: string): string {
  const logoUrl = `${getBaseUrl()}/logos/p2e_inferno_logo.png`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;background:${BG_COLOR};font-family:Inter,Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG_COLOR};padding:32px 0;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:640px;background:${CARD_BG};border-radius:16px;overflow:hidden;border:1px solid ${BORDER_COLOR};">
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid ${BORDER_COLOR};">
              <table width="100%" role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left">
                    <img src="${logoUrl}" width="140" alt="P2E Inferno" style="display:block;border:0;outline:none;" />
                  </td>
                  <td align="right" style="font-size:12px;color:${MUTED};">P2E INFERNO</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:32px 32px 12px;">${body}</td></tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="height:1px;background:${BORDER_COLOR};margin:24px 0;"></div>
              <p style="margin:0;font-size:12px;color:${MUTED};text-align:center;">
                &copy; ${new Date().getFullYear()} P2E Inferno. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function getPaymentSuccessEmail(params: {
  cohortName: string;
  amount: number;
  currency: string;
}) {
  const { cohortName, amount, currency } = params;

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Payment confirmed</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your payment was successful. Your access is now active.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:12px;color:${MUTED};text-transform:uppercase;">Bootcamp</p>
      <p style="margin:0 0 14px;font-size:18px;color:${BRAND_DARK};font-weight:600;">${cohortName}</p>
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">Amount: <strong>${currency} ${amount}</strong></p>
    </div>
  `;

  return {
    subject: `Payment Confirmed: ${cohortName}`,
    text: `Payment confirmed for ${cohortName}. Amount: ${currency} ${amount}`,
    html: wrapHtml("Payment Confirmed", body),
  };
}
