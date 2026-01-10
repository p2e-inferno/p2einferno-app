# Email Notification Port Plan V2 (TeeRex → P2E Inferno)

This revised plan addresses all issues identified in the plan validation review. It ports TeeRex's Mailgun-based email system into P2E Inferno with proper Deno/Node.js compatibility, deduplication, and error recovery.

---

## Table of Contents

1. [Phase 1: Infrastructure (Node.js)](#phase-1-infrastructure-nodejs)
2. [Phase 2: Edge Function Support (Deno)](#phase-2-edge-function-support-deno)
3. [Phase 3: Database Schema](#phase-3-database-schema)
4. [Phase 4: Integration Points](#phase-4-integration-points)
5. [Phase 5: Testing](#phase-5-testing)
6. [Phase 6: Environment Variables](#phase-6-environment-variables)
7. [Validation Checklist](#validation-checklist)

---

## Phase 1: Infrastructure (Node.js)

### 1.1 `lib/email/mailgun.ts`

Node.js Mailgun client for Next.js API routes.

```ts
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
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  return EMAIL_REGEX.test(lowered) ? lowered : null;
}

/**
 * Send email via Mailgun API
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, text, html, tags = [], testMode } = options;

  // Validate email format
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
      hasFrom: !!from
    });
    return { ok: false, error: "Email service not configured" };
  }

  const form = new FormData();
  form.append("from", from);
  form.append("to", normalizedTo);
  form.append("subject", subject);
  form.append("text", text);
  if (html) form.append("html", html);
  tags.forEach((t) => form.append("o:tag", t));
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
```

---

### 1.2 `lib/email/templates.ts`

P2E Inferno branded email templates.

```ts
// Brand colors from P2E Inferno design system
const BRAND_COLOR = "#E4532A";
const BRAND_DARK = "#1C1A19";
const BG_COLOR = "#F5F2EE";
const CARD_BG = "#FFFFFF";
const BORDER_COLOR = "#EFE7E0";
const MUTED = "#6B5E55";
const ACCENT = "#F9E7DB";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
                  <td align="right" style="font-size:12px;color:${MUTED};">
                    P2E INFERNO
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 12px;">${body}</td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="height:1px;background:${BORDER_COLOR};margin:24px 0;"></div>
              <p style="margin:0;font-size:12px;color:${MUTED};text-align:center;">
                &copy; ${new Date().getFullYear()} P2E Inferno. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <table width="100%" role="presentation" cellspacing="0" cellpadding="0" style="max-width:640px;">
          <tr>
            <td style="padding:12px 0 0;text-align:center;font-size:11px;color:${MUTED};">
              This is a transactional email. If you did not initiate this action, contact support.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============ Template Functions ============

export interface PaymentSuccessParams {
  cohortName: string;
  amount: number;
  currency: string;
  receiptUrl?: string;
}

export function getPaymentSuccessEmail(params: PaymentSuccessParams) {
  const { cohortName, amount, currency, receiptUrl } = params;

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Payment confirmed</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your payment was successful. Your access is now active.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;">Bootcamp</p>
      <p style="margin:0 0 14px;font-size:18px;color:${BRAND_DARK};font-weight:600;">${cohortName}</p>
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Amount: <strong>${currency} ${amount.toLocaleString()}</strong>
      </p>
    </div>
    ${receiptUrl ? `
      <a href="${receiptUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">
        View receipt
      </a>
    ` : ""}
  `;

  return {
    subject: `Payment Confirmed: ${cohortName}`,
    text: `Payment confirmed for ${cohortName}. Amount: ${currency} ${amount}`,
    html: wrapHtml("Payment Confirmed", body),
  };
}

export interface RenewalParams {
  durationDays: number;
  newExpiration?: string;
}

export function getRenewalEmail(params: RenewalParams) {
  const { durationDays, newExpiration } = params;

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Subscription renewed</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your subscription has been extended successfully.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;">
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_DARK};">
        Renewal duration: <strong>${durationDays} days</strong>
      </p>
      ${newExpiration ? `
        <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
          New expiration: <strong>${new Date(newExpiration).toLocaleDateString()}</strong>
        </p>
      ` : ""}
    </div>
  `;

  return {
    subject: "Subscription Renewed",
    text: `Your subscription was renewed for ${durationDays} days.${newExpiration ? ` New expiration: ${newExpiration}` : ""}`,
    html: wrapHtml("Subscription Renewed", body),
  };
}

export interface WithdrawalParams {
  amount: number;
  txHash?: string;
  chainId?: number;
}

export function getWithdrawalEmail(params: WithdrawalParams) {
  const { amount, txHash, chainId } = params;
  const explorerDomainByChain: Record<number, string> = {
    1: "etherscan.io",
    8453: "basescan.org",
    84532: "sepolia.basescan.org",
    11155111: "sepolia.etherscan.io",
  };
  const explorerDomain = chainId ? explorerDomainByChain[chainId] : undefined;
  const explorerUrl = txHash && explorerDomain
    ? `https://${explorerDomain}/tx/${txHash}`
    : null;

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Withdrawal complete</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your DG withdrawal has been processed successfully.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Amount: <strong>${amount} DG</strong>
      </p>
      ${txHash ? `
        <p style="margin:8px 0 0;font-size:12px;color:${MUTED};word-break:break-all;">
          Tx: ${txHash}
        </p>
      ` : ""}
    </div>
    ${explorerUrl ? `
      <a href="${explorerUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">
        View on Explorer
      </a>
    ` : ""}
  `;

  return {
    subject: "Withdrawal Complete",
    text: `Your withdrawal of ${amount} DG is complete.${txHash ? ` Transaction: ${txHash}` : ""}`,
    html: wrapHtml("Withdrawal Complete", body),
  };
}

export interface WelcomeParams {
  displayName: string;
}

export function getWelcomeEmail(params: WelcomeParams) {
  const { displayName } = params;
  const dashboardUrl = `${getBaseUrl()}/dashboard`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Welcome to P2E Inferno</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Hi ${displayName}, your account is ready. Start exploring bootcamps, quests, and rewards.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        💡 Pro tip: Complete your profile and daily check-ins to unlock early perks.
      </p>
    </div>
    <a href="${dashboardUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">
      Go to Dashboard
    </a>
  `;

  return {
    subject: "Welcome to P2E Inferno",
    text: `Hi ${displayName}, welcome to P2E Inferno. Visit your dashboard: ${dashboardUrl}`,
    html: wrapHtml("Welcome", body),
  };
}
```

---

### 1.3 `lib/email/helpers.ts`

Shared query helpers for fetching email context.

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./mailgun";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:helpers");

export interface PaymentEmailContext {
  email: string;
  cohortName: string;
  amount?: number;
  currency?: string;
}

/**
 * Fetch email context for payment-related emails.
 * Returns null if user email is missing or invalid.
 */
export async function getPaymentEmailContext(
  supabase: SupabaseClient,
  applicationId: string
): Promise<PaymentEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("user_email, cohort:cohort_id ( name )")
      .eq("id", applicationId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch payment email context", { applicationId, error });
      return null;
    }

    const email = normalizeEmail(data.user_email);
    if (!email) {
      log.warn("No valid email for application", { applicationId });
      return null;
    }

    const cohort = Array.isArray(data.cohort) ? data.cohort[0] : data.cohort;

    return {
      email,
      cohortName: cohort?.name || "Bootcamp",
    };
  } catch (err) {
    log.error("Exception fetching payment email context", { applicationId, err });
    return null;
  }
}

export interface UserEmailContext {
  email: string;
  displayName?: string;
}

/**
 * Fetch user email from profile by privy_user_id.
 */
export async function getUserEmailContext(
  supabase: SupabaseClient,
  privyUserId: string
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("privy_user_id", privyUserId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email context", { privyUserId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email context", { privyUserId, err });
    return null;
  }
}

/**
 * Fetch user email from profile by user_profile_id (UUID).
 */
export async function getUserEmailContextById(
  supabase: SupabaseClient,
  userProfileId: string
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("id", userProfileId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email by profile ID", { userProfileId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email by profile ID", { userProfileId, err });
    return null;
  }
}
```

---

### 1.4 `lib/email/dedup.ts`

Email deduplication to prevent duplicate sends (atomic claim + update).
Use `dedupKey` to control semantics:
- **Welcome**: `profile:${userProfileId}` (prevents re-sends if email changes)
- **Payments**: `payment:${recipientEmail}` (per-recipient per application)
- **Withdrawals**: `withdrawal:${withdrawalId}` (single send)

```ts
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
  dedupKey: string
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
  messageId?: string
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
  errorMessage?: string
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

  // Optional: enqueue for retry processing
  // await supabase.from("email_send_queue").insert({
  //   event_type: eventType,
  //   target_id: targetId,
  //   recipient_email: recipientEmail.toLowerCase(),
  //   template_name: eventType,
  //   template_data: {},
  //   error_message: errorMessage || "send_failed",
  //   next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  // });
}

/**
 * High-level helper: atomically claim -> send -> mark sent/failed.
 */
export async function sendEmailWithDedup(
  eventType: string,
  targetId: string,
  recipientEmail: string,
  dedupKey: string,
  sendFn: () => Promise<{ ok: boolean; messageId?: string }>
): Promise<{ sent: boolean; skipped: boolean; error?: string }> {
  const canSend = await claimEmailSend(eventType, targetId, recipientEmail, dedupKey);

  if (!canSend) {
    log.info("Email already claimed/sent, skipping", { eventType, targetId, dedupKey });
    return { sent: false, skipped: true };
  }

  const result = await sendFn();

  if (result.ok) {
    await recordEmailSent(eventType, targetId, recipientEmail, dedupKey, result.messageId);
    return { sent: true, skipped: false };
  }

  await recordEmailFailed(eventType, targetId, recipientEmail, dedupKey, "send_failed");
  return { sent: false, skipped: false, error: "Send failed" };
}
```

---

### 1.5 `lib/email/index.ts`

Barrel export for convenience.

```ts
// Core
export { sendEmail, normalizeEmail, type EmailOptions, type EmailResult } from "./mailgun";

// Templates
export {
  getPaymentSuccessEmail,
  getRenewalEmail,
  getWithdrawalEmail,
  getWelcomeEmail,
  type PaymentSuccessParams,
  type RenewalParams,
  type WithdrawalParams,
  type WelcomeParams,
} from "./templates";

// Helpers
export {
  getPaymentEmailContext,
  getUserEmailContext,
  getUserEmailContextById,
  type PaymentEmailContext,
  type UserEmailContext,
} from "./helpers";

// Deduplication
export {
  claimEmailSend,
  recordEmailSent,
  recordEmailFailed,
  sendEmailWithDedup,
} from "./dedup";
```

---

## Phase 2: Edge Function Support (Deno)

### 2.1 `supabase/functions/_shared/constants.ts`

```ts
/* deno-lint-ignore-file no-explicit-any */
declare const Deno: { env: { get(key: string): string | undefined } };

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || Deno.env.get("NEXT_SUPABASE_SERVICE_ROLE_KEY")!;

// Email validation regex
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

---

### 2.2 `supabase/functions/_shared/email-utils.ts`

Deno-compatible Mailgun client with P2E Inferno branding.

```ts
/* deno-lint-ignore-file no-explicit-any */
declare const Deno: { env: { get(key: string): string | undefined } };

import { EMAIL_REGEX } from "./constants.ts";

// ============ Core Email Functions ============

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
  const MAILGUN_API_URL = Deno.env.get("MAILGUN_API_URL") ?? "https://api.mailgun.net";
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
    // Use btoa() for Deno compatibility (not Buffer.from)
    const response = await fetch(`${MAILGUN_API_URL}/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${MAILGUN_API_KEY}`)}`,
      },
      body: formData,
    });

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

// ============ P2E Inferno Branded Templates ============

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
```

---

## Phase 3: Database Schema

### 3.1 Migration: `supabase/migrations/XXX_email_events.sql`

```sql
-- Email deduplication and tracking table
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  target_id UUID,
  recipient_email TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS email_events_unique
  ON email_events (event_type, target_id, dedup_key);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_email_events_lookup
  ON email_events (event_type, target_id, status);

-- Index for monitoring/cleanup
CREATE INDEX IF NOT EXISTS idx_email_events_sent_at
  ON email_events (sent_at DESC);

-- RLS policies
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access (no user access needed)
CREATE POLICY "Service role full access" ON email_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Function security
COMMENT ON TABLE email_events IS 'Tracks sent transactional emails for deduplication';
```

### 3.2 Optional: Failed Email Queue (for recovery)

```sql
-- Optional: Queue for failed emails to enable retry
CREATE TABLE IF NOT EXISTS email_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  target_id UUID,
  recipient_email TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_data JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_queue_pending
  ON email_send_queue (next_retry_at)
  WHERE processed_at IS NULL AND retry_count < 3;

ALTER TABLE email_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON email_send_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**Retry processor (recommended):**
- Option A: Supabase scheduled function (cron) `process-email-queue` runs every 5–10 minutes, sends pending emails, increments retry_count, and sets processed_at.
- Option B: Admin-only Next.js API route (`/api/admin/email/retry-queue`) for manual replays.

---

## Phase 4: Integration Points

### 4.1 Payment Webhook (`pages/api/payment/webhook.ts`)

Add after `handle_successful_payment` succeeds (around line 77):

```ts
import { sendEmail, getPaymentSuccessEmail, getPaymentEmailContext, sendEmailWithDedup } from "@/lib/email";

// Inside handleSuccessfulCharge, after successful payment processing:
if (data?.[0]?.success) {
  log.info("Payment processed successfully:", data[0].message);

  // ... existing transaction update code ...

  // Send payment confirmation email (non-blocking)
  try {
    const emailCtx = await getPaymentEmailContext(supabase, applicationId);
    if (emailCtx) {
      const tpl = getPaymentSuccessEmail({
        cohortName: emailCtx.cohortName,
        amount: paymentData.amount / 100,
        currency: "NGN",
      });

      await sendEmailWithDedup(
        "payment-success",
        applicationId,
        emailCtx.email,
        `payment:${emailCtx.email}`,
        () => sendEmail({ to: emailCtx.email, ...tpl, tags: ["payment-success", "paystack-webhook"] })
      );
    }
  } catch (emailErr) {
    log.error("Failed to send payment confirmation email", { applicationId, emailErr });
    // Don't fail the webhook response
  }
}
```

### 4.2 Payment Manual Verify (`pages/api/payment/verify/[reference].ts`)

Add after `processPaymentManually` succeeds (around line 535):

```ts
import { sendEmail, getPaymentSuccessEmail, getPaymentEmailContext, sendEmailWithDedup } from "@/lib/email";

// After processPaymentManually succeeds:
try {
  const emailCtx = await getPaymentEmailContext(supabase, applicationId);
  if (emailCtx) {
    const tpl = getPaymentSuccessEmail({
      cohortName: emailCtx.cohortName,
      amount: paystackData.data.amount / 100,
      currency: "NGN",
    });

    await sendEmailWithDedup(
      "payment-success",
      applicationId,
      emailCtx.email,
      `payment:${emailCtx.email}`,
      () => sendEmail({ to: emailCtx.email, ...tpl, tags: ["payment-success", "manual-verify"] })
    );
  }
} catch (emailErr) {
  log.error("Failed to send payment email", { emailErr });
}
```

### 4.3 Subscription Renewal (`pages/api/subscriptions/renew-with-xp.ts`)

First, update the user profile query (line 94) to include email:

```ts
const { data: userProfile, error: userError } = await supabase
  .from("user_profiles")
  .select("id, experience_points, email")  // Add email
  .eq("privy_user_id", privy.id)
  .single();
```

Then add after successful renewal (around line 560):

```ts
import { sendEmail, getRenewalEmail, sendEmailWithDedup, normalizeEmail } from "@/lib/email";

// After renewal success, before returning response:
try {
  const email = normalizeEmail(userProfile?.email);
  if (email) {
    const tpl = getRenewalEmail({
      durationDays: body.duration,
      newExpiration: new Date(Number(verifiedExpiration) * 1000).toISOString(),
    });

    await sendEmailWithDedup(
      "subscription-renewal",
      renewalAttemptId,
      email,
      `renewal:${renewalAttemptId}`,
      () => sendEmail({ to: email, ...tpl, tags: ["subscription-renewal", "xp"] })
    );
  }
} catch (emailErr) {
  log.error("Failed to send renewal email", { renewalAttemptId, emailErr });
}
```

### 4.4 Withdrawal (`app/api/token/withdraw/route.ts`)

Add after `complete_withdrawal` succeeds (around line 203):

```ts
import { sendEmail, getWithdrawalEmail, getUserEmailContext, sendEmailWithDedup } from "@/lib/email";

// After complete_withdrawal succeeds:
try {
  const emailCtx = await getUserEmailContext(supabase, user.id);
  if (emailCtx?.email) {
    const tpl = getWithdrawalEmail({
      amount: Number(amountDG),
      txHash: transferResult.transactionHash,
      chainId: chainId,
    });

    await sendEmailWithDedup(
      "withdrawal-complete",
      withdrawalId,
      emailCtx.email,
      `withdrawal:${withdrawalId}`,
      () => sendEmail({ to: emailCtx.email, ...tpl, tags: ["withdrawal"] })
    );
  }
} catch (emailErr) {
  log.error("Failed to send withdrawal email", { withdrawalId, emailErr });
}
```

### 4.5 Welcome Email (`pages/api/user/profile.ts`)

Replace the existing `isNewProfile` detection with a more robust approach (around line 144):

```ts
import { sendEmail, getWelcomeEmail, sendEmailWithDedup, normalizeEmail } from "@/lib/email";

// After upsert completes:
const email = normalizeEmail(data.email);

// Use dedup check instead of timestamp comparison for reliability
if (email) {
  try {
    const { sent } = await sendEmailWithDedup(
      "welcome",
      data.id,  // user_profile_id as target
      email,
      `profile:${data.id}`,
      () => {
        const tpl = getWelcomeEmail({
          displayName: data.display_name || "there",
        });
        return sendEmail({ to: email, ...tpl, tags: ["welcome"] });
      }
    );

    if (sent) {
      log.info("Welcome email sent to new user", { userId: data.id });
    }
  } catch (emailErr) {
    log.error("Failed to send welcome email", { userId: data.id, emailErr });
  }
}
```

### 4.6 Blockchain Payment Edge Function

Update `supabase/functions/verify-blockchain-payment/index.ts` (after line 136):

```ts
import { sendEmail, getPaymentSuccessEmail, normalizeEmail } from "../_shared/email-utils.ts";

// After handle_successful_payment succeeds:
if (!rpcError) {
  // Fetch user email for notification
  const { data: appData } = await supabaseAdmin
    .from("applications")
    .select("user_email, cohort:cohort_id ( name )")
    .eq("id", applicationId)
    .single();

  const email = normalizeEmail(appData?.user_email);
  if (email) {
    const cohort = Array.isArray(appData.cohort) ? appData.cohort[0] : appData.cohort;
    const tpl = getPaymentSuccessEmail({
      cohortName: cohort?.name || "Bootcamp",
      amount: 0, // Amount would need to be fetched from transaction
      currency: "USDT",
    });

    const dedupKey = `payment:${email}`;
    const { error: claimError } = await supabaseAdmin
      .from("email_events")
      .insert({
        event_type: "payment-success",
        target_id: applicationId,
        recipient_email: email,
        dedup_key: dedupKey,
        status: "pending",
      });

    if (!claimError) {
      const result = await sendEmail({
        to: email,
        ...tpl,
        tags: ["payment-success", "blockchain"],
      });

      if (result.ok) {
        await supabaseAdmin
          .from("email_events")
          .update({ status: "sent", message_id: result.messageId, sent_at: new Date().toISOString() })
          .eq("event_type", "payment-success")
          .eq("target_id", applicationId)
          .eq("recipient_email", email)
          .eq("dedup_key", dedupKey);
      } else {
        await supabaseAdmin
          .from("email_events")
          .update({ status: "failed", error_message: result.error || "send_failed" })
          .eq("event_type", "payment-success")
          .eq("target_id", applicationId)
          .eq("recipient_email", email)
          .eq("dedup_key", dedupKey);
      }
    }
  }
}
```

---

## Phase 5: Testing

### 5.1 Unit Tests

#### `__tests__/unit/lib/email/templates.test.ts`

```ts
import {
  getPaymentSuccessEmail,
  getRenewalEmail,
  getWithdrawalEmail,
  getWelcomeEmail,
} from "@/lib/email/templates";

describe("Email Templates", () => {
  describe("getPaymentSuccessEmail", () => {
    it("returns subject, text, and html", () => {
      const result = getPaymentSuccessEmail({
        cohortName: "Web3 Bootcamp",
        amount: 50000,
        currency: "NGN",
      });

      expect(result.subject).toBe("Payment Confirmed: Web3 Bootcamp");
      expect(result.text).toContain("Web3 Bootcamp");
      expect(result.text).toContain("NGN 50000");
      expect(result.html).toContain("Payment confirmed");
      expect(result.html).toContain("Web3 Bootcamp");
    });

    it("includes receipt URL when provided", () => {
      const result = getPaymentSuccessEmail({
        cohortName: "Test",
        amount: 100,
        currency: "USD",
        receiptUrl: "https://example.com/receipt",
      });

      expect(result.html).toContain("https://example.com/receipt");
      expect(result.html).toContain("View receipt");
    });
  });

  describe("getRenewalEmail", () => {
    it("returns correct content for 30-day renewal", () => {
      const result = getRenewalEmail({ durationDays: 30 });

      expect(result.subject).toBe("Subscription Renewed");
      expect(result.text).toContain("30 days");
    });
  });

  describe("getWithdrawalEmail", () => {
    it("includes transaction hash when provided", () => {
      const result = getWithdrawalEmail({
        amount: 100,
        txHash: "0x123abc",
        chainId: 8453,
      });

      expect(result.html).toContain("0x123abc");
      expect(result.html).toContain("basescan.org");
    });
  });

  describe("getWelcomeEmail", () => {
    it("personalizes with display name", () => {
      const result = getWelcomeEmail({ displayName: "John" });

      expect(result.text).toContain("Hi John");
      expect(result.html).toContain("Hi John");
    });
  });
});
```

#### `__tests__/unit/lib/email/mailgun.test.ts`

```ts
import { normalizeEmail } from "@/lib/email/mailgun";

describe("normalizeEmail", () => {
  it("returns null for empty values", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("lowercases and trims valid emails", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("returns null for invalid emails", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("missing@domain")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
  });
});
```

#### `__tests__/unit/lib/email/dedup.test.ts`

```ts
import { claimEmailSend } from "@/lib/email/dedup";

// Mock Supabase client
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
      upsert: jest.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

describe("Email Deduplication", () => {
  it("claimEmailSend returns true when no prior record exists", async () => {
    const result = await claimEmailSend("payment-success", "uuid-123", "test@example.com", "payment:test@example.com");
    expect(result).toBe(true);
  });
});
```

### 5.2 Test File Locations

Following existing project conventions:

| Test Type | Location |
|-----------|----------|
| Unit tests | `__tests__/unit/lib/email/*.test.ts` |
| Integration | `__tests__/pages/api/payment/webhook.email.spec.ts` |

---

## Phase 6: Environment Variables

### Required Variables

Add to `.env.example` and `.env.local`:

```bash
# Mailgun Configuration
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_API_KEY=key-xxxxxxxxxxxx
MAILGUN_FROM="P2E Inferno <noreply@yourdomain.com>"
MAILGUN_API_URL=https://api.mailgun.net  # Optional, defaults to this
MAILGUN_TEST_MODE=false  # Set to 'true' in dev/staging

# Already exists, ensure set in prod:
NEXT_PUBLIC_APP_URL=https://app.p2einferno.com
```

### Supabase Edge Function Secrets

```bash
# Set via Supabase CLI
supabase secrets set MAILGUN_DOMAIN=mg.yourdomain.com
supabase secrets set MAILGUN_API_KEY=key-xxxxxxxxxxxx
supabase secrets set MAILGUN_FROM="P2E Inferno <noreply@yourdomain.com>"
supabase secrets set NEXT_PUBLIC_APP_URL=https://app.p2einferno.com
```

---

## Validation Checklist

### Pre-Implementation

- [ ] Mailgun account created and domain verified
- [ ] Environment variables added to `.env.local`
- [ ] Edge function secrets configured in Supabase

### Phase 1: Infrastructure

- [ ] `lib/email/mailgun.ts` created
- [ ] `lib/email/templates.ts` created
- [ ] `lib/email/helpers.ts` created
- [ ] `lib/email/dedup.ts` created
- [ ] `lib/email/index.ts` barrel export created

### Phase 2: Edge Functions

- [ ] `supabase/functions/_shared/constants.ts` created
- [ ] `supabase/functions/_shared/email-utils.ts` created

### Phase 3: Database

- [ ] Migration for `email_events` table created
- [ ] Migration applied locally: `supabase db reset` or `supabase migration up --local`
- [ ] Types regenerated: `npm run db:types`

### Phase 4: Integration

- [ ] Payment webhook email trigger added
- [ ] Payment verify email trigger added
- [ ] Subscription renewal email trigger added
- [ ] Withdrawal email trigger added
- [ ] Welcome email trigger added (with dedup-based detection)
- [ ] Blockchain payment edge function updated

### Phase 5: Testing

- [ ] Template unit tests pass
- [ ] Mailgun client unit tests pass
- [ ] Dedup unit tests pass
- [ ] Manual test: Payment flow sends email
- [ ] Manual test: Renewal flow sends email
- [ ] Manual test: Withdrawal flow sends email
- [ ] Manual test: New signup sends welcome email
- [ ] Manual test: Duplicate triggers don't send duplicate emails

### Phase 6: Documentation

- [ ] `.env.example` updated
- [ ] README or docs updated with email configuration

---

## Implementation Order

1. **Day 1**: Phase 1 (Infrastructure) + Phase 3 (Database migration)
2. **Day 2**: Phase 2 (Edge function support) + Phase 5 (Tests)
3. **Day 3**: Phase 4 (Integration points) + Manual testing
4. **Day 4**: Phase 6 (Documentation) + Final review

---

## Rollback Plan

If issues arise:

1. **Disable sending**: Set `MAILGUN_TEST_MODE=true` to queue emails without delivery
2. **Remove triggers**: Comment out email send blocks in integration points
3. **Drop table**: `DROP TABLE IF EXISTS email_events;` (only if needed)

Email sending is designed to be non-blocking, so failures won't affect core transaction flows.
