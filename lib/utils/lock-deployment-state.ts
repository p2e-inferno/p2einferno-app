import { getLogger } from "@/lib/utils/logger";

const log = getLogger("utils:lock-deployment-state");

// ============================================================================
// LOCAL STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  PENDING_DEPLOYMENTS: "p2e_pending_lock_deployments",
  DEPLOYMENT_DRAFTS: "p2e_deployment_drafts",
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type EntityType = "bootcamp" | "cohort" | "quest" | "milestone";
const DEFAULT_DRAFT_SCOPE_KEY = "global";

export interface PendingDeployment {
  id: string;
  lockAddress: string;
  entityType: EntityType;
  entityData: any; // The form data for creating the entity
  timestamp: number;
  retryCount: number;
  transactionHash?: string;
  grantTransactionHash?: string;
  serverWalletAddress?: string;
  blockExplorerUrl?: string;
}

export interface DeploymentDraft {
  id: string;
  entityType: EntityType;
  scopeKey: string;
  formData: any;
  timestamp: number;
}

// ============================================================================
// PENDING DEPLOYMENTS MANAGEMENT
// ============================================================================

/**
 * Save deployment state before attempting database creation
 * Call this immediately after successful lock deployment
 */
export const savePendingDeployment = (
  deployment: Omit<PendingDeployment, "id" | "timestamp" | "retryCount">,
): string => {
  try {
    if (typeof window === "undefined") return "";

    const deploymentId = `${deployment.entityType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const pendingDeployment: PendingDeployment = {
      id: deploymentId,
      ...deployment,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const existing = getPendingDeployments();
    const updated = [...existing, pendingDeployment];

    localStorage.setItem(
      STORAGE_KEYS.PENDING_DEPLOYMENTS,
      JSON.stringify(updated),
    );
    log.info("Saved pending deployment:", deploymentId);

    return deploymentId;
  } catch (error) {
    log.error("Error saving pending deployment:", error);
    return "";
  }
};

/**
 * Get all pending deployments from localStorage
 */
export const getPendingDeployments = (): PendingDeployment[] => {
  try {
    if (typeof window === "undefined") return [];

    const stored = localStorage.getItem(STORAGE_KEYS.PENDING_DEPLOYMENTS);
    if (!stored) return [];

    const deployments = JSON.parse(stored) as PendingDeployment[];

    // Filter out old deployments (older than 24 hours)
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    const validDeployments = deployments.filter(
      (d) => d.timestamp > cutoffTime,
    );

    // Update storage if we filtered any out
    if (validDeployments.length !== deployments.length) {
      localStorage.setItem(
        STORAGE_KEYS.PENDING_DEPLOYMENTS,
        JSON.stringify(validDeployments),
      );
    }

    return validDeployments;
  } catch (error) {
    log.error("Error getting pending deployments:", error);
    return [];
  }
};

/**
 * Remove a pending deployment after successful database creation
 */
export const removePendingDeployment = (deploymentId: string): void => {
  try {
    if (typeof window === "undefined") return;

    const existing = getPendingDeployments();
    const updated = existing.filter((d) => d.id !== deploymentId);

    localStorage.setItem(
      STORAGE_KEYS.PENDING_DEPLOYMENTS,
      JSON.stringify(updated),
    );
    log.info("Removed pending deployment:", deploymentId);
  } catch (error) {
    log.error("Error removing pending deployment:", error);
  }
};

/**
 * Increment retry count for a pending deployment
 */
export const incrementDeploymentRetry = (deploymentId: string): void => {
  try {
    if (typeof window === "undefined") return;

    const existing = getPendingDeployments();
    const updated = existing.map((d) =>
      d.id === deploymentId ? { ...d, retryCount: d.retryCount + 1 } : d,
    );

    localStorage.setItem(
      STORAGE_KEYS.PENDING_DEPLOYMENTS,
      JSON.stringify(updated),
    );
  } catch (error) {
    log.error("Error incrementing retry count:", error);
  }
};

/**
 * Check if there are any pending deployments for a specific entity type
 */
export const hasPendingDeployments = (entityType?: EntityType): boolean => {
  const pending = getPendingDeployments();
  return entityType
    ? pending.some((d) => d.entityType === entityType)
    : pending.length > 0;
};

// ============================================================================
// DRAFT MANAGEMENT
// ============================================================================

/**
 * Save form data as draft before starting lock deployment
 */
export const saveDraft = (
  entityType: EntityType,
  formData: any,
  scopeKey: string = DEFAULT_DRAFT_SCOPE_KEY,
): string => {
  try {
    if (typeof window === "undefined") return "";

    const safeScopeKey = scopeKey.replace(/[^a-z0-9_-]/gi, "-");
    const draftId = `${entityType}_${safeScopeKey}_draft_${Date.now()}`;

    const draft: DeploymentDraft = {
      id: draftId,
      entityType,
      scopeKey,
      formData,
      timestamp: Date.now(),
    };

    const existing = getDrafts();
    const updated = [
      ...existing.filter(
        (d) => d.entityType !== entityType || d.scopeKey !== scopeKey,
      ),
      draft,
    ]; // Keep only latest draft per type+scope

    localStorage.setItem(
      STORAGE_KEYS.DEPLOYMENT_DRAFTS,
      JSON.stringify(updated),
    );
    log.info("Saved draft:", { draftId, entityType, scopeKey });

    return draftId;
  } catch (error) {
    log.error("Error saving draft:", error);
    return "";
  }
};

const inferDraftScopeKey = (draft: Partial<DeploymentDraft>): string => {
  if (draft.scopeKey) {
    return draft.scopeKey;
  }

  const formData = draft.formData as Record<string, unknown> | undefined;

  if (draft.entityType === "milestone") {
    const cohortId = formData?.cohort_id;
    if (typeof cohortId === "string" && cohortId.trim().length > 0) {
      return `cohort:${cohortId}`;
    }
  }

  if (draft.entityType === "cohort") {
    const bootcampId = formData?.bootcamp_program_id;
    if (typeof bootcampId === "string" && bootcampId.trim().length > 0) {
      return `bootcamp:${bootcampId}`;
    }
  }

  return DEFAULT_DRAFT_SCOPE_KEY;
};

/**
 * Get all drafts from localStorage
 */
export const getDrafts = (): DeploymentDraft[] => {
  try {
    if (typeof window === "undefined") return [];

    const stored = localStorage.getItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS);
    if (!stored) return [];

    const drafts = JSON.parse(stored) as DeploymentDraft[];
    const normalizedDrafts = drafts.map((draft) => ({
      ...draft,
      scopeKey: inferDraftScopeKey(draft),
    })) as DeploymentDraft[];
    const shouldPersistNormalized = drafts.some(
      (draft, index) =>
        normalizedDrafts[index]?.scopeKey !== (draft as any).scopeKey,
    );

    // Filter out old drafts (older than 7 days)
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const validDrafts = normalizedDrafts.filter(
      (d) => d.timestamp > cutoffTime,
    );

    // Update storage if we filtered any out
    if (validDrafts.length !== drafts.length || shouldPersistNormalized) {
      localStorage.setItem(
        STORAGE_KEYS.DEPLOYMENT_DRAFTS,
        JSON.stringify(validDrafts),
      );
    }

    return validDrafts;
  } catch (error) {
    log.error("Error getting drafts:", error);
    return [];
  }
};

/**
 * Get draft for specific entity type
 */
export const getDraft = (
  entityType: EntityType,
  scopeKey: string = DEFAULT_DRAFT_SCOPE_KEY,
): DeploymentDraft | null => {
  const drafts = getDrafts();
  const scopedDraft =
    drafts.find(
      (d) => d.entityType === entityType && d.scopeKey === scopeKey,
    ) || null;

  if (scopedDraft || scopeKey !== DEFAULT_DRAFT_SCOPE_KEY) {
    return scopedDraft;
  }

  const entityDrafts = drafts.filter((d) => d.entityType === entityType);
  return entityDrafts.length === 1 ? entityDrafts[0] ?? null : null;
};

/**
 * Update existing draft with deployment result after successful lock deployment
 * This ensures the lock address and grant failure info are preserved even if database save fails
 */
export const updateDraftWithDeploymentResult = (
  entityType: EntityType,
  scopeKey: string = DEFAULT_DRAFT_SCOPE_KEY,
  result: {
    lockAddress: string;
    grantFailed?: boolean;
    grantError?: string;
  },
): void => {
  try {
    if (typeof window === "undefined") return;

    const existing = getDrafts();
    const draftIndex = existing.findIndex(
      (d) => d.entityType === entityType && d.scopeKey === scopeKey,
    );

    if (draftIndex === -1) {
      log.warn("No existing draft found to update with deployment result:", {
        entityType,
        scopeKey,
        lockAddress: result.lockAddress,
      });
      return;
    }

    // Update the existing draft with deployment result and disable auto-creation
    const currentDraft = existing[draftIndex];
    if (!currentDraft) {
      log.error("Draft at index is undefined", { entityType, draftIndex });
      return;
    }

    // Handle quest's nested structure vs other entities' flat structure
    let updatedFormData;
    if (entityType === "quest" && currentDraft.formData.questData) {
      // Quest with new nested structure
      updatedFormData = {
        ...currentDraft.formData,
        questData: {
          ...currentDraft.formData.questData,
          lock_address: result.lockAddress,
          auto_lock_creation: false,
          lock_manager_granted: !result.grantFailed,
          grant_failure_reason: result.grantError || null,
        },
      };
    } else {
      // Other entities with flat structure (bootcamp, cohort, milestone) or old quest format
      updatedFormData = {
        ...currentDraft.formData,
        lock_address: result.lockAddress,
        auto_lock_creation: false,
        lock_manager_granted: !result.grantFailed,
        grant_failure_reason: result.grantError || null,
      };
    }

    const updatedDraft: DeploymentDraft = {
      id: currentDraft.id,
      entityType: currentDraft.entityType,
      scopeKey: currentDraft.scopeKey,
      formData: updatedFormData,
      timestamp: Date.now(), // Update timestamp to reflect latest change
    };

    const updated = [...existing];
    updated[draftIndex] = updatedDraft;

    localStorage.setItem(
      STORAGE_KEYS.DEPLOYMENT_DRAFTS,
      JSON.stringify(updated),
    );
    log.info("Updated draft with deployment result:", {
      entityType,
      scopeKey,
      lockAddress: result.lockAddress,
      grantFailed: result.grantFailed,
    });
  } catch (error) {
    log.error("Error updating draft with deployment result:", error);
  }
};

/**
 * @deprecated Use updateDraftWithDeploymentResult instead
 */
export const updateDraftWithLockAddress = (
  entityType: EntityType,
  scopeKey: string = DEFAULT_DRAFT_SCOPE_KEY,
  lockAddress: string,
): void => {
  updateDraftWithDeploymentResult(entityType, scopeKey, { lockAddress });
};

/**
 * Remove draft after successful deployment or cancellation
 */
export const removeDraft = (
  entityType: EntityType,
  scopeKey?: string,
): void => {
  try {
    if (typeof window === "undefined") return;

    const existing = getDrafts();
    const updated =
      typeof scopeKey === "string"
        ? existing.filter(
            (d) => d.entityType !== entityType || d.scopeKey !== scopeKey,
          )
        : existing.filter((d) => d.entityType !== entityType);

    localStorage.setItem(
      STORAGE_KEYS.DEPLOYMENT_DRAFTS,
      JSON.stringify(updated),
    );
    log.info("Removed draft for:", { entityType, scopeKey: scopeKey || "all" });
  } catch (error) {
    log.error("Error removing draft:", error);
  }
};

// ============================================================================
// CLEANUP UTILITIES
// ============================================================================

/**
 * Clear all pending deployments and drafts (for admin reset)
 */
export const clearAllDeploymentState = (): void => {
  try {
    if (typeof window === "undefined") return;

    localStorage.removeItem(STORAGE_KEYS.PENDING_DEPLOYMENTS);
    localStorage.removeItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS);
    log.info("Cleared all deployment state");
  } catch (error) {
    log.error("Error clearing deployment state:", error);
  }
};

/**
 * Get deployment statistics for admin dashboard
 */
export const getDeploymentStats = () => {
  const pending = getPendingDeployments();
  const drafts = getDrafts();

  return {
    pendingCount: pending.length,
    draftCount: drafts.length,
    pendingByType: {
      bootcamp: pending.filter((d) => d.entityType === "bootcamp").length,
      cohort: pending.filter((d) => d.entityType === "cohort").length,
      quest: pending.filter((d) => d.entityType === "quest").length,
      milestone: pending.filter((d) => d.entityType === "milestone").length,
    },
    oldestPending:
      pending.length > 0 ? Math.min(...pending.map((d) => d.timestamp)) : null,
  };
};
