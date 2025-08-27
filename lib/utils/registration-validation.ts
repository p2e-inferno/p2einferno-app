import type { Cohort } from "@/lib/supabase/types";

export interface RegistrationStatus {
  isOpen: boolean;
  reason?: string;
  timeRemaining?: string;
  spotsRemaining: number;
  isDeadlinePassed: boolean;
  isFull: boolean;
  statusColor: 'green' | 'blue' | 'red';
  statusIcon: string;
  statusText: string;
}

/**
 * Calculate time remaining until registration deadline
 */
export function calculateTimeRemaining(deadline: string): string {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - now.getTime();

  if (diff <= 0) return "Registration closed";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} remaining`;
  }

  return `${hours} hour${hours > 1 ? "s" : ""} remaining`;
}

/**
 * Get comprehensive registration status for a cohort
 */
export function getCohortRegistrationStatus(cohort: Cohort, isUserEnrolled = false): RegistrationStatus {
  const now = new Date();
  const deadlineDate = new Date(cohort.registration_deadline);
  const spotsRemaining = cohort.max_participants - cohort.current_participants;
  
  // Check if registration deadline has passed
  const isDeadlinePassed = deadlineDate.getTime() <= now.getTime();
  
  // Check if spots are full
  const isFull = spotsRemaining <= 0;
  
  // Check if cohort status is open
  const isStatusOpen = cohort.status === "open";
  
  // Registration is only open if: cohort status is open, deadline hasn't passed, and spots available
  const isRegistrationOpen = isStatusOpen && !isDeadlinePassed && !isFull;
  
  const timeRemaining = calculateTimeRemaining(cohort.registration_deadline);
  
  // Determine status color, icon, and text
  let statusColor: 'green' | 'blue' | 'red' = 'red';
  let statusIcon = '🔴';
  let statusText = 'Closed';
  
  if (isUserEnrolled) {
    statusColor = 'green';
    statusIcon = '✅';
    statusText = 'Enrolled';
  } else if (isRegistrationOpen) {
    statusColor = 'green';
    statusIcon = '🟢';
    statusText = `Open • ${timeRemaining}`;
  } else if (cohort.status === "upcoming") {
    statusColor = 'blue';
    statusIcon = '🔵';
    statusText = 'Coming Soon';
  } else if (isDeadlinePassed) {
    statusText = 'Registration Closed';
  } else if (isFull) {
    statusText = 'Spots Full';
  }
  
  // Determine reason for closure
  let reason: string | undefined;
  if (!isRegistrationOpen && !isUserEnrolled) {
    if (!isStatusOpen) {
      reason = cohort.status === "upcoming" ? "Registration has not started yet" : "Registration is closed";
    } else if (isDeadlinePassed) {
      reason = "Registration deadline has passed";
    } else if (isFull) {
      reason = "No spots available - cohort is full";
    }
  }
  
  return {
    isOpen: isRegistrationOpen,
    reason,
    timeRemaining,
    spotsRemaining,
    isDeadlinePassed,
    isFull,
    statusColor,
    statusIcon,
    statusText,
  };
}

/**
 * Simple check if registration is open for a cohort
 */
export function isRegistrationOpen(cohort: Cohort): { isOpen: boolean; reason?: string; timeRemaining?: string } {
  const status = getCohortRegistrationStatus(cohort);
  return {
    isOpen: status.isOpen,
    reason: status.reason,
    timeRemaining: status.timeRemaining,
  };
}