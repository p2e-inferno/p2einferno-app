import { getLogger } from '@/lib/utils/logger';

const log = getLogger('utils:lock-deployment-state');

// ============================================================================
// LOCAL STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  PENDING_DEPLOYMENTS: 'p2e_pending_lock_deployments',
  DEPLOYMENT_DRAFTS: 'p2e_deployment_drafts',
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type EntityType = 'bootcamp' | 'cohort' | 'quest' | 'milestone';

export interface PendingDeployment {
  id: string;
  lockAddress: string;
  entityType: EntityType;
  entityData: any; // The form data for creating the entity
  timestamp: number;
  retryCount: number;
  transactionHash?: string;
  blockExplorerUrl?: string;
}

export interface DeploymentDraft {
  id: string;
  entityType: EntityType;
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
export const savePendingDeployment = (deployment: Omit<PendingDeployment, 'id' | 'timestamp' | 'retryCount'>): string => {
  try {
    if (typeof window === 'undefined') return '';

    const deploymentId = `${deployment.entityType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pendingDeployment: PendingDeployment = {
      id: deploymentId,
      ...deployment,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const existing = getPendingDeployments();
    const updated = [...existing, pendingDeployment];
    
    localStorage.setItem(STORAGE_KEYS.PENDING_DEPLOYMENTS, JSON.stringify(updated));
    log.info('Saved pending deployment:', deploymentId);
    
    return deploymentId;
  } catch (error) {
    log.error('Error saving pending deployment:', error);
    return '';
  }
};

/**
 * Get all pending deployments from localStorage
 */
export const getPendingDeployments = (): PendingDeployment[] => {
  try {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.PENDING_DEPLOYMENTS);
    if (!stored) return [];

    const deployments = JSON.parse(stored) as PendingDeployment[];
    
    // Filter out old deployments (older than 24 hours)
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    const validDeployments = deployments.filter(d => d.timestamp > cutoffTime);
    
    // Update storage if we filtered any out
    if (validDeployments.length !== deployments.length) {
      localStorage.setItem(STORAGE_KEYS.PENDING_DEPLOYMENTS, JSON.stringify(validDeployments));
    }
    
    return validDeployments;
  } catch (error) {
    log.error('Error getting pending deployments:', error);
    return [];
  }
};

/**
 * Remove a pending deployment after successful database creation
 */
export const removePendingDeployment = (deploymentId: string): void => {
  try {
    if (typeof window === 'undefined') return;

    const existing = getPendingDeployments();
    const updated = existing.filter(d => d.id !== deploymentId);
    
    localStorage.setItem(STORAGE_KEYS.PENDING_DEPLOYMENTS, JSON.stringify(updated));
    log.info('Removed pending deployment:', deploymentId);
  } catch (error) {
    log.error('Error removing pending deployment:', error);
  }
};

/**
 * Increment retry count for a pending deployment
 */
export const incrementDeploymentRetry = (deploymentId: string): void => {
  try {
    if (typeof window === 'undefined') return;

    const existing = getPendingDeployments();
    const updated = existing.map(d => 
      d.id === deploymentId 
        ? { ...d, retryCount: d.retryCount + 1 }
        : d
    );
    
    localStorage.setItem(STORAGE_KEYS.PENDING_DEPLOYMENTS, JSON.stringify(updated));
  } catch (error) {
    log.error('Error incrementing retry count:', error);
  }
};

/**
 * Check if there are any pending deployments for a specific entity type
 */
export const hasPendingDeployments = (entityType?: EntityType): boolean => {
  const pending = getPendingDeployments();
  return entityType 
    ? pending.some(d => d.entityType === entityType)
    : pending.length > 0;
};

// ============================================================================
// DRAFT MANAGEMENT
// ============================================================================

/**
 * Save form data as draft before starting lock deployment
 */
export const saveDraft = (entityType: EntityType, formData: any): string => {
  try {
    if (typeof window === 'undefined') return '';

    const draftId = `${entityType}_draft_${Date.now()}`;
    
    const draft: DeploymentDraft = {
      id: draftId,
      entityType,
      formData,
      timestamp: Date.now(),
    };

    const existing = getDrafts();
    const updated = [...existing.filter(d => d.entityType !== entityType), draft]; // Keep only latest draft per type
    
    localStorage.setItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS, JSON.stringify(updated));
    log.info('Saved draft:', draftId);
    
    return draftId;
  } catch (error) {
    log.error('Error saving draft:', error);
    return '';
  }
};

/**
 * Get all drafts from localStorage
 */
export const getDrafts = (): DeploymentDraft[] => {
  try {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS);
    if (!stored) return [];

    const drafts = JSON.parse(stored) as DeploymentDraft[];
    
    // Filter out old drafts (older than 7 days)
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const validDrafts = drafts.filter(d => d.timestamp > cutoffTime);
    
    // Update storage if we filtered any out
    if (validDrafts.length !== drafts.length) {
      localStorage.setItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS, JSON.stringify(validDrafts));
    }
    
    return validDrafts;
  } catch (error) {
    log.error('Error getting drafts:', error);
    return [];
  }
};

/**
 * Get draft for specific entity type
 */
export const getDraft = (entityType: EntityType): DeploymentDraft | null => {
  const drafts = getDrafts();
  return drafts.find(d => d.entityType === entityType) || null;
};

/**
 * Remove draft after successful deployment or cancellation
 */
export const removeDraft = (entityType: EntityType): void => {
  try {
    if (typeof window === 'undefined') return;

    const existing = getDrafts();
    const updated = existing.filter(d => d.entityType !== entityType);
    
    localStorage.setItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS, JSON.stringify(updated));
    log.info('Removed draft for:', entityType);
  } catch (error) {
    log.error('Error removing draft:', error);
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
    if (typeof window === 'undefined') return;

    localStorage.removeItem(STORAGE_KEYS.PENDING_DEPLOYMENTS);
    localStorage.removeItem(STORAGE_KEYS.DEPLOYMENT_DRAFTS);
    log.info('Cleared all deployment state');
  } catch (error) {
    log.error('Error clearing deployment state:', error);
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
      bootcamp: pending.filter(d => d.entityType === 'bootcamp').length,
      cohort: pending.filter(d => d.entityType === 'cohort').length,
      quest: pending.filter(d => d.entityType === 'quest').length,
      milestone: pending.filter(d => d.entityType === 'milestone').length,
    },
    oldestPending: pending.length > 0 
      ? Math.min(...pending.map(d => d.timestamp))
      : null,
  };
};