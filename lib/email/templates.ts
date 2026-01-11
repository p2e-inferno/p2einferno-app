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
  const lobbyUrl = `${getBaseUrl()}/lobby`;

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
    <a href="${lobbyUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">
      Go to Lobby
    </a>
  `;

  return {
    subject: "Welcome to P2E Inferno",
    text: `Hi ${displayName}, welcome to P2E Inferno. Visit your lobby: ${lobbyUrl}`,
    html: wrapHtml("Welcome", body),
  };
}
