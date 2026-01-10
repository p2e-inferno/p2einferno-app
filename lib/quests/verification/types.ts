/**
 * Verification Types for Quest System
 *
 * Defines interfaces for strategy-pattern verification of quest tasks.
 */

import type { TaskType } from "@/lib/supabase/types";

export interface VerificationOptions {
    taskConfig?: Record<string, unknown> | null;
    taskId?: string;
}

/**
 * Result of a verification attempt
 */
export interface VerificationResult {
    success: boolean;
    error?: string;
    code?: string;
    metadata?: Record<string, unknown>;
}

/**
 * Strategy interface for task verification
 * Implementations handle specific task types (e.g., vendor transactions)
 */
export interface VerificationStrategy {
    verify(
        taskType: TaskType,
        verificationData: Record<string, unknown>,
        userId: string,
        userAddress: string,
        options?: VerificationOptions
    ): Promise<VerificationResult>;
}
