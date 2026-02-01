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
  getStarterKitEmail,
  getAdminReviewNotificationEmail,
  type PaymentSuccessParams,
  type RenewalParams,
  type WithdrawalParams,
  type WelcomeParams,
  type StarterKitParams,
  type AdminReviewNotificationParams,
} from "./templates";

export {
  getPaymentEmailContext,
  getUserEmailContext,
  getUserEmailContextById,
  getMilestoneSubmissionContext,
  getQuestSubmissionContext,
  type PaymentEmailContext,
  type UserEmailContext,
  type SubmissionReviewContext,
} from "./helpers";

export {
  sendMilestoneReviewNotification,
  sendQuestReviewNotification,
} from "./admin-notifications";

export {
  claimEmailSend,
  recordEmailSent,
  recordEmailFailed,
  sendEmailWithDedup,
} from "./dedup";
