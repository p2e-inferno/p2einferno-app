/**
 * Custom hook for managing lock purchase security state consistently across all admin forms
 *
 * Handles initialization, draft restoration, and state updates for max_keys_secured
 * and max_keys_failure_reason fields.
 */

import { useState, useEffect } from "react";
import { initialGrantState } from "@/lib/blockchain/shared/grant-state";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("useMaxKeysSecurityState");

interface EntityWithMaxKeysSecurity {
  max_keys_secured?: boolean | null;
  max_keys_failure_reason?: string | null;
}

interface MaxKeysSecurityStateReturn {
  maxKeysSecured: boolean;
  setMaxKeysSecured: (secured: boolean) => void;
  maxKeysFailureReason: string | undefined;
  setMaxKeysFailureReason: (reason: string | undefined) => void;
}

/**
 * Hook for managing purchase security state (maxNumberOfKeys)
 *
 * @param isEditing - Whether we're editing an existing entity
 * @param entity - The entity data (bootcamp, quest, milestone)
 * @returns State and setters for max keys security fields
 */
export function useMaxKeysSecurityState(
  isEditing: boolean,
  entity?: EntityWithMaxKeysSecurity,
): MaxKeysSecurityStateReturn {
  log.debug("useMaxKeysSecurityState called", {
    isEditing,
    entityId: (entity as any)?.id,
    entityExists: !!entity,
    entityKeys: entity ? Object.keys(entity) : [],
    maxKeysSecured: entity?.max_keys_secured,
    maxKeysFailureReason: entity?.max_keys_failure_reason,
    entityType: typeof entity?.max_keys_secured,
    fullEntity: entity,
  });

  // Initialize using the shared grant state utility (reuses existing security-first defaults)
  const initialValue = initialGrantState(
    isEditing,
    entity?.max_keys_secured ?? undefined,
  );
  log.debug("Initial security state calculated", {
    initialValue,
    rawValue: entity?.max_keys_secured,
    isEditing,
    entityExists: !!entity,
  });

  const [maxKeysSecured, setMaxKeysSecured] = useState(initialValue);

  const [maxKeysFailureReason, setMaxKeysFailureReason] = useState<
    string | undefined
  >(entity?.max_keys_failure_reason ?? undefined);

  // Sync state when entity data changes (editing mode)
  useEffect(() => {
    if (isEditing && entity) {
      const newSecuredValue = entity.max_keys_secured ?? false;
      log.debug("useEffect syncing security state", {
        entityId: (entity as any)?.id,
        rawValue: entity.max_keys_secured,
        newSecuredValue,
        currentState: maxKeysSecured,
        willUpdate: newSecuredValue !== maxKeysSecured,
      });

      setMaxKeysSecured(newSecuredValue);
      setMaxKeysFailureReason(entity?.max_keys_failure_reason ?? undefined);
    }
  }, [isEditing, entity?.max_keys_secured, entity?.max_keys_failure_reason]);

  return {
    maxKeysSecured,
    setMaxKeysSecured,
    maxKeysFailureReason,
    setMaxKeysFailureReason,
  };
}
