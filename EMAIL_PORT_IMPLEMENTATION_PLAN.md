# Email Notification Port Plan (TeeRex -> P2E Inferno)

This plan ports TeeRex’s Mailgun-based email sending into P2E Inferno and wires it to the actual transaction/withdrawal/subscription/signup success points already in this repo.

The goal is: **send emails when**:
- financial transactions succeed (Paystack + blockchain payments)
- subscription renewal succeeds
- withdrawals succeed
- a user profile is created for the first time

The plan is **implementation‑ready** and uses **P2E Inferno conventions** (Next.js API routes, `createAdminClient`, `getLogger`, etc.).

---

## 1) New Server Utilities (Mailgun + Templates)

### 1.1 `lib/email/mailgun.ts`
**Purpose:** Node‑side Mailgun sender (port of TeeRex `sendEmail` but compatible with Next.js API routes).

```ts
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:mailgun");

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tags?: string[];
  testMode?: boolean;
}

export async function sendEmail(options: EmailOptions) {
  const { to, subject, text, html, tags = [], testMode } = options;

  const domain = process.env.MAILGUN_DOMAIN;
  const apiKey = process.env.MAILGUN_API_KEY;
  const from = process.env.MAILGUN_FROM;
  const apiUrl = process.env.MAILGUN_API_URL || "https://api.mailgun.net";
  const envTest = process.env.MAILGUN_TEST_MODE === "true";

  if (!domain || !apiKey || !from) {
    log.error("Mailgun not configured", { domain, hasKey: !!apiKey, from });
    return { ok: false, error: "Email service not configured" };
  }

  const form = new FormData();
  form.append("from", from);
  form.append("to", to);
  form.append("subject", subject);
  form.append("text", text);
  if (html) form.append("html", html);
  tags.forEach((t) => form.append("o:tag", t));
  if (testMode || envTest) form.append("o:testmode", "yes");

  const res = await fetch(`${apiUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    log.error("Mailgun error", { status: res.status, body });
    return { ok: false, error: `Mailgun error: ${res.status}` };
  }

  const data = await res.json();
  return { ok: true, messageId: data.id };
}
```

### 1.2 `lib/email/templates.ts`
**Purpose:** P2E‑branded templates (HTML wrapper + event‑specific content).

Use the **existing asset**: `public/logos/p2e_inferno_logo.png`.

```ts
const BRAND_COLOR = "#E4532A";
const BRAND_DARK = "#1C1A19";
const BG_COLOR = "#F5F2EE";
const CARD_BG = "#FFFFFF";
const BORDER_COLOR = "#EFE7E0";
const MUTED = "#6B5E55";
const ACCENT = "#F9E7DB";

function wrapHtml(title: string, body: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const logoUrl = `${baseUrl}/logos/p2e_inferno_logo.png`;

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
                        <img src="${logoUrl}" width="140" alt="P2E Inferno" style="display:block;border:0;outline:none;text-decoration:none;" />
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

export function getPaymentSuccessEmail(params: {
  cohortName: string;
  amount: number;
  currency: string;
  receiptUrl?: string;
}) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Payment confirmed</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your payment was successful. Your access is now active.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0 0 6px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;">Bootcamp</p>
      <p style="margin:0 0 14px;font-size:18px;color:${BRAND_DARK};font-weight:600;">${params.cohortName}</p>
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Amount: <strong>${params.currency} ${params.amount}</strong>
      </p>
    </div>
    ${params.receiptUrl ? `
      <a href="${params.receiptUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">
        View receipt
      </a>
    ` : ""}
  `;
  return {
    subject: `Payment Confirmed: ${params.cohortName}`,
    text: `Payment confirmed for ${params.cohortName}. Amount: ${params.currency} ${params.amount}`,
    html: wrapHtml("Payment Confirmed", body),
  };
}

export function getRenewalEmail(params: { durationDays: number }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Subscription renewed</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your subscription has been extended successfully.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;">
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Renewal duration: <strong>${params.durationDays} days</strong>
      </p>
    </div>
  `;
  return {
    subject: "Subscription Renewed",
    text: `Your subscription was renewed for ${params.durationDays} days.`,
    html: wrapHtml("Subscription Renewed", body),
  };
}

export function getWithdrawalEmail(params: { amount: number; txHash?: string }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Withdrawal complete</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Your DG withdrawal has been processed successfully.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Amount: <strong>${params.amount} DG</strong>
      </p>
      ${params.txHash ? `<p style="margin:8px 0 0;font-size:12px;color:${MUTED};word-break:break-all;">Tx: ${params.txHash}</p>` : ""}
    </div>
  `;
  return {
    subject: "Withdrawal Complete",
    text: `Your withdrawal of ${params.amount} DG is complete.`,
    html: wrapHtml("Withdrawal Complete", body),
  };
}

export function getWelcomeEmail(params: { displayName: string }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;color:${BRAND_DARK};">Welcome to P2E Inferno</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:22px;">
      Hi ${params.displayName}, your account is ready. Start exploring bootcamps, quests, and rewards.
    </p>
    <div style="background:${ACCENT};border-radius:12px;padding:16px 18px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:${BRAND_DARK};">
        Pro tip: Complete your profile to unlock early perks.
      </p>
    </div>
  `;
  return {
    subject: "Welcome to P2E Inferno",
    text: `Hi ${params.displayName}, welcome to P2E Inferno.`,
    html: wrapHtml("Welcome", body),
  };
}
```

---

## 2) Email Trigger Placement (Concrete Insertion Points)

### 2.1 Payment (Paystack success)
**File:** `pages/api/payment/webhook.ts`

Trigger after `handle_successful_payment` succeeds.

```ts
import { sendEmail } from "@/lib/email/mailgun";
import { getPaymentSuccessEmail } from "@/lib/email/templates";

// inside handleSuccessfulCharge after successful payment
const { data: app } = await supabase
  .from("applications")
  .select("user_email, cohorts(name)")
  .eq("id", applicationId)
  .single();

const email = app?.user_email?.trim()?.toLowerCase();
if (email) {
  const tpl = getPaymentSuccessEmail({
    cohortName: app.cohorts?.name || "Bootcamp",
    amount: paymentData.amount / 100,
    currency: "NGN",
  });
  await sendEmail({ to: email, ...tpl, tags: ["payment-success", "paystack"] });
}
```

### 2.2 Payment (Manual verification)
**File:** `pages/api/payment/verify/[reference].ts`

Trigger after `handle_successful_payment` succeeds in `processPaymentManually`.

```ts
import { sendEmail } from "@/lib/email/mailgun";
import { getPaymentSuccessEmail } from "@/lib/email/templates";

const { data: app } = await supabase
  .from("applications")
  .select("user_email, cohorts(name)")
  .eq("id", applicationId)
  .single();

const email = app?.user_email?.trim()?.toLowerCase();
if (email) {
  await sendEmail({
    to: email,
    ...getPaymentSuccessEmail({
      cohortName: app.cohorts?.name || "Bootcamp",
      amount: paystackData.data.amount / 100,
      currency: "NGN",
    }),
    tags: ["payment-success", "manual-verify"],
  });
}
```

### 2.3 Payment (Blockchain verification)
**File:** `supabase/functions/verify-blockchain-payment/index.ts`

Edge function can reuse TeeRex pattern in Deno.

```ts
import { sendEmail, getPaymentSuccessEmail } from "../_shared/email-utils.ts";

// after handle_successful_payment succeeds
const { data: app } = await supabaseAdmin
  .from("applications")
  .select("user_email, cohorts(name)")
  .eq("id", applicationId)
  .single();

const email = app?.user_email?.trim()?.toLowerCase();
if (email) {
  const tpl = getPaymentSuccessEmail(app.cohorts?.name || "Bootcamp", "USDT payment confirmed");
  await sendEmail({ to: email, ...tpl, tags: ["payment-success", "blockchain"] });
}
```

### 2.4 Subscription Renewal (XP)
**File:** `pages/api/subscriptions/renew-with-xp.ts`

Trigger after the success path (after updates to `subscription_renewal_attempts` and `user_activation_grants`).

```ts
import { sendEmail } from "@/lib/email/mailgun";
import { getRenewalEmail } from "@/lib/email/templates";

if (userProfile?.email) {
  const tpl = getRenewalEmail({ durationDays: body.duration });
  await sendEmail({
    to: userProfile.email,
    ...tpl,
    tags: ["subscription-renewal", "xp"],
  });
}
```

### 2.5 Withdrawal Success
**File:** `app/api/token/withdraw/route.ts`

Trigger after `complete_withdrawal` in the success branch.

```ts
import { sendEmail } from "@/lib/email/mailgun";
import { getWithdrawalEmail } from "@/lib/email/templates";

const { data: profile } = await supabase
  .from("user_profiles")
  .select("email")
  .eq("privy_user_id", user.id)
  .single();

if (profile?.email) {
  const tpl = getWithdrawalEmail({ amount: Number(amountDG), txHash: transferResult.transactionHash });
  await sendEmail({ to: profile.email, ...tpl, tags: ["withdrawal"] });
}
```

### 2.6 Welcome Email (Profile Creation)
**File:** `pages/api/user/profile.ts` and `pages/api/user/profile-simple.ts`

Trigger when `isNewProfile === true`.

```ts
import { sendEmail } from "@/lib/email/mailgun";
import { getWelcomeEmail } from "@/lib/email/templates";

if (isNewProfile && data.email) {
  const tpl = getWelcomeEmail({ displayName: data.display_name || "there" });
  await sendEmail({ to: data.email, ...tpl, tags: ["welcome"] });
}
```

---

## 3) Deduplication Strategy (Avoid Double Emails)

P2E currently has no email‑sent tracking. Choose one:

**Option A (recommended):** `email_events` table
```sql
create table email_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_id uuid,
  recipient_email text not null,
  created_at timestamptz default now()
);
create unique index email_events_unique
  on email_events (event_type, target_id, recipient_email);
```

**Option B:** add `email_sent_at` column per source table
- `payment_transactions.email_sent_at`
- `subscription_renewal_attempts.email_sent_at`
- `dg_token_withdrawals.email_sent_at`
- `user_profiles.welcome_email_sent_at`

Use this field to skip sending if already set.

---

## 4) Environment Variables Required

- `MAILGUN_DOMAIN`
- `MAILGUN_API_KEY`
- `MAILGUN_FROM`
- `MAILGUN_API_URL` (optional)
- `MAILGUN_TEST_MODE` (optional)
- `NEXT_PUBLIC_APP_URL` (already used; ensure set in prod)

---

## 5) Tests to Add

**Unit**
- `__tests__/lib/email/templates.test.ts`
  - Ensure each template returns subject/text/html
  - Basic smoke test of html wrapper

**Integration (API)**
- `__tests__/pages/api/payment/webhook.email.spec.ts`
- `__tests__/pages/api/subscriptions/renew-with-xp.email.spec.ts`
- `__tests__/app/api/token/withdraw.email.spec.ts`
- `__tests__/pages/api/user/profile.email.spec.ts`

Mock Mailgun (mock `sendEmail`) and assert it is called with correct parameters.

---

## 6) Documentation (Update Existing Docs)

Add a small section in a relevant doc (e.g. `docs/production-readiness-audit.md` or new `docs/email-notifications.md`) describing:
- Required Mailgun env vars
- Email event triggers
- Deduplication strategy

---

## 7) Validation Steps

1. `npm run lint`
2. `npm test`
3. Manually verify:
   - Payment flow triggers email
   - XP renewal triggers email
   - Withdrawal triggers email
   - New profile triggers email

---

## Implementation Notes

- Use `getLogger` for all failures. Email sends should **never** fail the main transaction flow.
- For HTML emails, use the P2E logo at `public/logos/p2e_inferno_logo.png` via `NEXT_PUBLIC_APP_URL`.
- For Deno edge (blockchain verify), the template can remain in `_shared/email-utils.ts` with Deno env access, but branding should be updated to P2E and use the same logo URL construction.
