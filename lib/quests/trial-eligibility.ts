export type TrialIneligibilityReason =
  | "existing_grant"
  | "trial_already_used";

export interface TrialEligibilityInput {
  hasExistingGrant: boolean;
  hasDGNationKey: boolean;
  hasTrialQuestKey: boolean;
}

export interface TrialEligibilityResult {
  allowed: boolean;
  reason?: TrialIneligibilityReason;
}

/**
 * Determine whether a user is eligible for a DG Nation trial.
 * Users who previously received a trial (DB record) or who have both
 * a DG Nation key and the quest lock key are considered ineligible.
 * Holding only the DG Nation key (e.g., they purchased access) is still allowed.
 */
export function evaluateTrialEligibility({
  hasExistingGrant,
  hasDGNationKey,
  hasTrialQuestKey,
}: TrialEligibilityInput): TrialEligibilityResult {
  if (hasExistingGrant) {
    return {
      allowed: false,
      reason: "existing_grant",
    };
  }

  if (hasDGNationKey && hasTrialQuestKey) {
    return {
      allowed: false,
      reason: "trial_already_used",
    };
  }

  return { allowed: true };
}
