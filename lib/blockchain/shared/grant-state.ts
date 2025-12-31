import { getLogger } from "@/lib/utils/logger";

const log = getLogger("grant-state");

export interface DeploymentResultLike {
  grantFailed?: boolean;
  grantError?: string;
  configFailed?: boolean;
  configError?: string;
}

export interface EffectiveGrantInput {
  outcome?: { lastGrantFailed?: boolean; lastGrantError?: string };
  lockAddress?: string | null;
  currentGranted?: boolean;
  currentReason?: string | undefined | null;
}

export function initialGrantState(
  isEditing: boolean,
  existing?: boolean,
): boolean {
  // Always default to false for security - only true if explicitly set in database
  return isEditing ? (existing ?? false) : false;
}

export function applyDeploymentOutcome(result: DeploymentResultLike): {
  granted: boolean;
  reason?: string;
  lastGrantFailed: boolean;
  lastGrantError?: string;
} {
  const grantFailed = result.grantFailed === true;
  const configFailed = result.configFailed === true;

  // Build comprehensive reason if either failed
  let reason: string | undefined;
  if (grantFailed && configFailed) {
    reason = `Grant manager failed: ${result.grantError || "unknown"}. Config update failed: ${result.configError || "unknown"}`;
  } else if (grantFailed) {
    reason = result.grantError || "Grant manager transaction failed";
  } else if (configFailed) {
    reason = `Lock deployed but config update failed: ${result.configError || "unknown"}. Please manually set maxKeysPerAddress to 0.`;
  }

  const granted = !grantFailed;

  try {
    log.debug("applyDeploymentOutcome", {
      grantFailed,
      configFailed,
      reasonPresent: Boolean(reason),
    });
  } catch {}

  return {
    granted,
    reason,
    lastGrantFailed: grantFailed,
    lastGrantError: result.grantError,
  };
}

export function effectiveGrantForSave(input: EffectiveGrantInput): {
  granted: boolean;
  reason?: string;
} {
  const hasOutcome = typeof input.outcome?.lastGrantFailed === "boolean";
  if (hasOutcome) {
    const granted = !input.outcome!.lastGrantFailed!;
    return {
      granted,
      reason: granted
        ? undefined
        : input.outcome!.lastGrantError || "Grant manager transaction failed",
    };
  }
  // Fall back to current state if we have a lock address
  if (input.lockAddress) {
    return {
      granted: Boolean(input.currentGranted),
      reason: input.currentGranted
        ? undefined
        : input.currentReason || undefined,
    };
  }
  // No lock => default to false
  return { granted: false, reason: undefined };
}

export interface EffectiveMaxKeysInput {
  outcome?: { lastConfigFailed?: boolean; lastConfigError?: string };
  lockAddress?: string | null;
  currentSecured?: boolean;
  currentReason?: string | undefined | null;
}

/**
 * Determine effective max_keys_secured state based on deployment outcome
 * Follows same pattern as effectiveGrantForSave for lock_manager_granted
 */
export function effectiveMaxKeysForSave(input: EffectiveMaxKeysInput): {
  secured: boolean;
  reason?: string;
} {
  const hasOutcome = typeof input.outcome?.lastConfigFailed === "boolean";
  if (hasOutcome) {
    const secured = !input.outcome!.lastConfigFailed!;
    return {
      secured,
      reason: secured
        ? undefined
        : input.outcome!.lastConfigError ||
          "Lock config update failed - maxKeysPerAddress not set to 0",
    };
  }
  // Fall back to current state if we have a lock address
  if (input.lockAddress) {
    return {
      secured: Boolean(input.currentSecured),
      reason: input.currentSecured
        ? undefined
        : input.currentReason || undefined,
    };
  }
  // No lock => default to false
  return { secured: false, reason: undefined };
}
