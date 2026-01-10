/**
 * Verification Strategy Registry
 *
 * Returns the appropriate verification strategy for a given task type.
 * Implements the Strategy pattern for extensible verification.
 */

import type { TaskType } from "@/lib/supabase/types";
import type { VerificationStrategy } from "./types";
import { VendorVerificationStrategy } from "./vendor-verification";
import { createViemPublicClient } from "@/lib/blockchain/providers/privy-viem";

// Create a shared public client instance
const publicClient = createViemPublicClient();

// Singleton strategy instances
const vendorStrategy = new VendorVerificationStrategy(publicClient);

// Map of task types to their verification strategies
const strategies: Partial<Record<TaskType, VerificationStrategy>> = {
    vendor_buy: vendorStrategy,
    vendor_sell: vendorStrategy,
    vendor_light_up: vendorStrategy,
    vendor_level_up: vendorStrategy,
};

/**
 * Get the verification strategy for a task type
 * @param type The task type to get a strategy for
 * @returns The verification strategy, or undefined if none exists
 */
export function getVerificationStrategy(
    type: TaskType
): VerificationStrategy | undefined {
    return strategies[type];
}
