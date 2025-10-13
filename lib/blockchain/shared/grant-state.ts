import { getLogger } from '@/lib/utils/logger';

const log = getLogger('grant-state');

export interface DeploymentResultLike {
  grantFailed?: boolean;
  grantError?: string;
}

export interface EffectiveGrantInput {
  outcome?: { lastGrantFailed?: boolean; lastGrantError?: string };
  lockAddress?: string | null;
  currentGranted?: boolean;
  currentReason?: string | undefined | null;
}

export function initialGrantState(isEditing: boolean, existing?: boolean): boolean {
  // New entities default to false; edits keep existing value (or true if missing)
  return isEditing ? (typeof existing === 'boolean' ? existing : true) : false;
}

export function applyDeploymentOutcome(result: DeploymentResultLike): {
  granted: boolean;
  reason?: string;
  lastGrantFailed: boolean;
  lastGrantError?: string;
} {
  const failed = result.grantFailed === true;
  const reason = failed ? (result.grantError || 'Grant manager transaction failed') : undefined;
  const granted = !failed;
  try {
    log.debug('applyDeploymentOutcome', { failed, reasonPresent: Boolean(reason) });
  } catch {}
  return { granted, reason, lastGrantFailed: failed, lastGrantError: result.grantError };
}

export function effectiveGrantForSave(input: EffectiveGrantInput): {
  granted: boolean;
  reason?: string;
} {
  const hasOutcome = typeof input.outcome?.lastGrantFailed === 'boolean';
  if (hasOutcome) {
    const granted = !input.outcome!.lastGrantFailed!;
    return { granted, reason: granted ? undefined : input.outcome!.lastGrantError || 'Grant manager transaction failed' };
  }
  // Fall back to current state if we have a lock address
  if (input.lockAddress) {
    return { granted: Boolean(input.currentGranted), reason: input.currentGranted ? undefined : input.currentReason || undefined };
  }
  // No lock => default to false
  return { granted: false, reason: undefined };
}

