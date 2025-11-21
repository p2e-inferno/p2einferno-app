import {
  evaluateTrialEligibility,
  type TrialEligibilityInput,
} from "@/lib/quests/trial-eligibility";

describe("evaluateTrialEligibility", () => {
  const baseInput: TrialEligibilityInput = {
    hasExistingGrant: false,
    hasDGNationKey: false,
    hasTrialQuestKey: false,
  };

  it("allows a fresh user with no previous grants or keys", () => {
    const result = evaluateTrialEligibility(baseInput);
    expect(result).toEqual({ allowed: true });
  });

  it("allows users who already purchased a DG Nation key but never ran the quest lock", () => {
    const result = evaluateTrialEligibility({
      ...baseInput,
      hasDGNationKey: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks users who have already consumed the trial flow on-chain", () => {
    const result = evaluateTrialEligibility({
      ...baseInput,
      hasDGNationKey: true,
      hasTrialQuestKey: true,
    });
    expect(result).toEqual({
      allowed: false,
      reason: "trial_already_used",
    });
  });

  it("blocks users with an existing activation grant even if on-chain balances are zero", () => {
    const result = evaluateTrialEligibility({
      ...baseInput,
      hasExistingGrant: true,
    });
    expect(result).toEqual({
      allowed: false,
      reason: "existing_grant",
    });
  });
});
