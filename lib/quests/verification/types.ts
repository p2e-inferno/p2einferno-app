/**
 * Verification Types for Quest System
 *
 * Defines interfaces for strategy-pattern verification of quest tasks.
 */

import type { TaskType } from "@/lib/supabase/types";

/**
 * Result of a verification attempt
 */
export interface VerificationResult {
    success: boolean;
    error?: string;
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
        userAddress: string
    ): Promise<VerificationResult>;
}
