/**
 * Custom hook for managing lock manager state consistently across all admin forms
 *
 * Handles initialization, draft restoration, and state updates for lock_manager_granted
 * and grant_failure_reason fields.
 */

import { useState, useEffect } from "react";
import { initialGrantState } from "@/lib/blockchain/shared/grant-state";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("useLockManagerState");

interface EntityWithLockManager {
  lock_manager_granted?: boolean;
  grant_failure_reason?: string | null;
}

interface LockManagerStateReturn {
  lockManagerGranted: boolean;
  setLockManagerGranted: (granted: boolean) => void;
  grantFailureReason: string | undefined;
  setGrantFailureReason: (reason: string | undefined) => void;
}

/**
 * Hook for managing lock manager state
 *
 * @param isEditing - Whether we're editing an existing entity
 * @param entity - The entity data (bootcamp, cohort, quest, milestone)
 * @returns State and setters for lock manager fields
 */
export function useLockManagerState(
  isEditing: boolean,
  entity?: EntityWithLockManager
): LockManagerStateReturn {
  log.debug("useLockManagerState called", {
    isEditing,
    entityId: (entity as any)?.id,
    entityExists: !!entity,
    entityKeys: entity ? Object.keys(entity) : [],
    lockManagerGranted: entity?.lock_manager_granted,
    grantFailureReason: entity?.grant_failure_reason,
    entityType: typeof entity?.lock_manager_granted,
    fullEntity: entity,
  });

  // Initialize using the shared grant state utility
  const initialValue = initialGrantState(
    isEditing,
    entity?.lock_manager_granted ?? undefined
  );
  log.debug("Initial state calculated", {
    initialValue,
    rawValue: entity?.lock_manager_granted,
    isEditing,
    entityExists: !!entity,
  });

  const [lockManagerGranted, setLockManagerGranted] = useState(initialValue);

  const [grantFailureReason, setGrantFailureReason] = useState<
    string | undefined
  >(entity?.grant_failure_reason ?? undefined);

  // Sync state when entity data changes (editing mode)
  useEffect(() => {
    if (isEditing && entity) {
      const newGrantedValue = entity.lock_manager_granted ?? false;
      log.debug("useEffect syncing state", {
        entityId: (entity as any)?.id,
        rawValue: entity.lock_manager_granted,
        newGrantedValue,
        currentState: lockManagerGranted,
        willUpdate: newGrantedValue !== lockManagerGranted,
      });

      setLockManagerGranted(newGrantedValue);
      setGrantFailureReason(entity.grant_failure_reason ?? undefined);
    }
  }, [isEditing, entity?.lock_manager_granted, entity?.grant_failure_reason]);

  return {
    lockManagerGranted,
    setLockManagerGranted,
    grantFailureReason,
    setGrantFailureReason,
  };
}
