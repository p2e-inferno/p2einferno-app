/**
 * Unified Status Management System for P2E Inferno
 * Provides type safety and consistency across application lifecycle
 */

// Payment Status - tracks payment processing state
export type PaymentStatus =
  | "pending" // Payment not initiated
  | "processing" // Payment in progress (blockchain confirmation pending)
  | "completed" // Payment confirmed and verified
  | "failed" // Payment failed or rejected
  | "refunded"; // Payment refunded

// Application Status - tracks application review state
export type ApplicationStatus =
  | "draft" // Application being created
  | "submitted" // Application submitted for review
  | "under_review" // Application being reviewed by admin
  | "approved" // Application approved
  | "rejected" // Application rejected
  | "withdrawn"; // Application withdrawn by user

// Enrollment Status - tracks learning journey state
export type EnrollmentStatus =
  | "pending" // Awaiting enrollment (payment completed, not yet enrolled)
  | "active" // Currently enrolled and learning
  | "completed" // Successfully completed the program
  | "dropped" // User dropped out
  | "suspended" // Temporarily suspended
  | "expired"; // Enrollment expired

// User Application Status - combines payment and application states for UI
export type UserApplicationStatus =
  | "draft" // Application being created
  | "payment_pending" // Submitted, awaiting payment
  | "payment_processing" // Payment in progress
  | "payment_failed" // Payment failed
  | "under_review" // Payment completed, under admin review
  | "approved" // Approved, ready for enrollment
  | "enrolled" // Successfully enrolled
  | "rejected" // Application rejected
  | "withdrawn" // Application withdrawn
  | "expired"; // Application expired

// Status hierarchy and transitions
export const STATUS_HIERARCHY = {
  payment: [
    "pending",
    "processing",
    "completed",
    "failed",
    "refunded",
  ] as const,
  application: [
    "draft",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "withdrawn",
  ] as const,
  enrollment: [
    "pending",
    "active",
    "completed",
    "dropped",
    "suspended",
    "expired",
  ] as const,
} as const;

// Valid status transitions
export const VALID_TRANSITIONS = {
  payment: {
    pending: ["processing", "failed"],
    processing: ["completed", "failed"],
    completed: ["refunded"],
    failed: ["pending", "processing"],
    refunded: [],
  },
  application: {
    draft: ["submitted", "withdrawn"],
    submitted: ["under_review", "withdrawn"],
    under_review: ["approved", "rejected"],
    approved: ["rejected"], // Can be reverted
    rejected: ["under_review"], // Can be reconsidered
    withdrawn: [],
  },
  enrollment: {
    pending: ["active", "expired"],
    active: ["completed", "dropped", "suspended"],
    completed: [],
    dropped: ["active"], // Can re-enroll
    suspended: ["active", "dropped"],
    expired: ["active"], // Can be reactivated
  },
} as const;

// Status display configurations
export const STATUS_CONFIG = {
  payment: {
    pending: { label: "Payment Pending", color: "amber", priority: 1 },
    processing: { label: "Processing Payment", color: "blue", priority: 2 },
    completed: { label: "Payment Completed", color: "green", priority: 3 },
    failed: { label: "Payment Failed", color: "red", priority: 0 },
    refunded: { label: "Payment Refunded", color: "gray", priority: 0 },
  },
  application: {
    draft: { label: "Draft", color: "gray", priority: 0 },
    submitted: { label: "Submitted", color: "blue", priority: 1 },
    under_review: { label: "Under Review", color: "amber", priority: 2 },
    approved: { label: "Approved", color: "green", priority: 3 },
    rejected: { label: "Rejected", color: "red", priority: 0 },
    withdrawn: { label: "Withdrawn", color: "gray", priority: 0 },
  },
  enrollment: {
    pending: { label: "Enrollment Pending", color: "amber", priority: 1 },
    active: { label: "Active", color: "green", priority: 3 },
    completed: { label: "Completed", color: "emerald", priority: 4 },
    dropped: { label: "Dropped", color: "red", priority: 0 },
    suspended: { label: "Suspended", color: "orange", priority: 0 },
    expired: { label: "Expired", color: "gray", priority: 0 },
  },
} as const;

// Helper functions
export function canTransition<T extends keyof typeof VALID_TRANSITIONS>(
  type: T,
  from: (typeof VALID_TRANSITIONS)[T] extends Record<infer K, any> ? K : never,
  to: string,
): boolean {
  const validTransitions = (VALID_TRANSITIONS as any)[type][
    from
  ] as readonly string[];
  return validTransitions.includes(to);
}

export function getStatusConfig<T extends keyof typeof STATUS_CONFIG>(
  type: T,
  status: keyof (typeof STATUS_CONFIG)[T],
) {
  return STATUS_CONFIG[type][status];
}

export function getHighestPriorityStatus<T extends keyof typeof STATUS_CONFIG>(
  type: T,
  statuses: (keyof (typeof STATUS_CONFIG)[T])[],
): keyof (typeof STATUS_CONFIG)[T] {
  return statuses.reduce((highest, current) => {
    const currentConfig = STATUS_CONFIG[type][current] as any;
    const highestConfig = STATUS_CONFIG[type][highest] as any;
    const currentPriority = currentConfig.priority;
    const highestPriority = highestConfig.priority;
    return currentPriority > highestPriority ? current : highest;
  });
}

// Compute overall user application status from component statuses
export function computeUserApplicationStatus(
  paymentStatus: PaymentStatus,
  applicationStatus: ApplicationStatus,
  enrollmentStatus?: EnrollmentStatus,
): UserApplicationStatus {
  // Handle enrollment status first (if exists)
  if (enrollmentStatus) {
    if (enrollmentStatus === "active" || enrollmentStatus === "completed") {
      return "enrolled";
    }
  }

  // Handle application status
  if (applicationStatus === "rejected") return "rejected";
  if (applicationStatus === "withdrawn") return "withdrawn";
  if (applicationStatus === "approved" && paymentStatus === "completed") {
    return "approved"; // Ready for enrollment
  }

  // Handle payment status
  if (paymentStatus === "failed") return "payment_failed";
  if (paymentStatus === "processing") return "payment_processing";
  if (paymentStatus === "completed" && applicationStatus !== "approved") {
    return "under_review";
  }

  // Default cases
  if (applicationStatus === "draft") return "draft";
  return "payment_pending";
}
