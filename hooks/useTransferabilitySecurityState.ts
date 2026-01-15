/**
 * Custom hook for managing transferability security state consistently across all admin forms
 *
 * Handles initialization, draft restoration, and state updates for transferability_secured
 * and transferability_failure_reason fields.
 */

import { useEffect, useState } from "react";
import { initialGrantState } from "@/lib/blockchain/shared/grant-state";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("useTransferabilitySecurityState");

interface EntityWithTransferabilitySecurity {
  transferability_secured?: boolean | null;
  transferability_failure_reason?: string | null;
}

interface TransferabilitySecurityStateReturn {
  transferabilitySecured: boolean;
  setTransferabilitySecured: (secured: boolean) => void;
  transferabilityFailureReason: string | undefined;
  setTransferabilityFailureReason: (reason: string | undefined) => void;
}

export function useTransferabilitySecurityState(
  isEditing: boolean,
  entity?: EntityWithTransferabilitySecurity,
): TransferabilitySecurityStateReturn {
  log.debug("useTransferabilitySecurityState called", {
    isEditing,
    entityId: (entity as any)?.id,
    entityExists: !!entity,
    transferabilitySecured: entity?.transferability_secured,
    transferabilityFailureReason: entity?.transferability_failure_reason,
  });

  const initialValue = initialGrantState(
    isEditing,
    entity?.transferability_secured ?? undefined,
  );

  const [transferabilitySecured, setTransferabilitySecured] =
    useState(initialValue);
  const [transferabilityFailureReason, setTransferabilityFailureReason] =
    useState<string | undefined>(
      entity?.transferability_failure_reason ?? undefined,
    );

  useEffect(() => {
    if (isEditing && entity) {
      const newValue = entity.transferability_secured ?? false;
      setTransferabilitySecured(newValue);
      setTransferabilityFailureReason(
        entity.transferability_failure_reason ?? undefined,
      );
    }
  }, [
    isEditing,
    entity?.transferability_secured,
    entity?.transferability_failure_reason,
  ]);

  return {
    transferabilitySecured,
    setTransferabilitySecured,
    transferabilityFailureReason,
    setTransferabilityFailureReason,
  };
}

