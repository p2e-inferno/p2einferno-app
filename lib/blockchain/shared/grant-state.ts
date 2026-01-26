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

/**
 * Compute the initial grant state for an editing or creation flow.
 *
 * Defaults to `false` unless editing and an explicit `existing` value is provided.
 *
 * @param isEditing - Whether the flow is editing an existing record
 * @param existing - The stored granted value for the existing record, if any
 * @returns `true` if `isEditing` is `true` and `existing` is `true`, `false` otherwise
 */
export function initialGrantState(
  isEditing: boolean,
  existing?: boolean,
): boolean {
  // Always default to false for security - only true if explicitly set in database
  return isEditing ? (existing ?? false) : false;
}

/**
 * Derives the effective grant state and associated failure information from a deployment outcome.
 *
 * @param result - Deployment outcome containing optional `grantFailed`, `grantError`, `configFailed`, and `configError` fields
 * @returns An object with:
 *   - `granted`: `true` if the grant did not fail, `false` otherwise
 *   - `reason`: a human-readable failure message when either grant or config update failed, or `undefined` when there is no failure
 *   - `lastGrantFailed`: `true` if the grant step failed, `false` otherwise
 *   - `lastGrantError`: the raw grant error message from the deployment outcome, if any
 */
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
    reason = `Lock deployed but config update failed: ${result.configError || "unknown"}. Please manually set maxNumberOfKeys to 0.`;
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
 * Compute the effective "maxNumberOfKeys" secured state and an optional reason for saving.
 *
 * If a deployment outcome is present (outcome.lastConfigFailed defined), the result is derived from that outcome:
 * - secured is true when the last config update did not fail; otherwise false.
 * - reason is the outcome error message when the update failed, or the default "Lock config update failed - maxNumberOfKeys not set to 0".
 *
 * If no outcome is present and a lockAddress exists, the currentSecured/currentReason values are used unchanged.
 * If no outcome and no lockAddress, the function returns secured: false with no reason.
 *
 * @param input - Inputs influencing the effective secured state:
 *   - outcome?.lastConfigFailed / outcome?.lastConfigError: optional deployment outcome to override current state
 *   - lockAddress: presence indicates an existing lock whose current state should be respected when no outcome exists
 *   - currentSecured / currentReason: current stored state and its reason to fall back to when no outcome exists
 * @returns An object with:
 *   - secured: `true` if the lock should be considered secured (maxNumberOfKeys set to 0), `false` otherwise
 *   - reason: optional human-readable explanation when `secured` is `false`
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
          "Lock config update failed - maxNumberOfKeys not set to 0",
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

export interface EffectiveTransferabilityInput {
  outcome?: { lastTransferFailed?: boolean; lastTransferError?: string };
  lockAddress?: string | null;
  currentSecured?: boolean;
  currentReason?: string | undefined | null;
}

/**
 * Compute the effective "transferability" secured state and an optional reason for saving.
 *
 * - secured is true when the last transfer fee update did not fail and the lock is expected to be non-transferable.
 * - reason is the outcome error message when the update failed, or the default "Transferability update failed - transfers not disabled".
 */
export function effectiveTransferabilityForSave(
  input: EffectiveTransferabilityInput,
): { secured: boolean; reason?: string } {
  const hasOutcome = typeof input.outcome?.lastTransferFailed === "boolean";
  if (hasOutcome) {
    const secured = !input.outcome!.lastTransferFailed!;
    return {
      secured,
      reason: secured
        ? undefined
        : input.outcome!.lastTransferError ||
          "Transferability update failed - transfers not disabled",
    };
  }

  if (input.lockAddress) {
    return {
      secured: Boolean(input.currentSecured),
      reason: input.currentSecured
        ? undefined
        : input.currentReason || undefined,
    };
  }

  return { secured: false, reason: undefined };
}
