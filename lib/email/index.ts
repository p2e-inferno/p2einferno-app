export {
  sendEmail,
  normalizeEmail,
  type EmailOptions,
  type EmailResult,
} from "./mailgun";

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

export {
  getPaymentEmailContext,
  getUserEmailContext,
  getUserEmailContextById,
  type PaymentEmailContext,
  type UserEmailContext,
} from "./helpers";

export {
  claimEmailSend,
  recordEmailSent,
  recordEmailFailed,
  sendEmailWithDedup,
} from "./dedup";
