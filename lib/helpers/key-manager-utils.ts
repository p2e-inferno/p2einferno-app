import type { Address } from "viem";
import { getLockManagerAddress } from "@/lib/blockchain/legacy/server-config";

/**
 * Context types for key granting operations
 */
export type KeyGrantContext =
  | "payment" // User paid for enrollment
  | "milestone" // User earned through task completion
  | "admin_grant" // Admin manually granting access
  | "reconciliation"; // Retrying failed payment grants

/**
 * Get the appropriate key managers array based on the context
 *
 * Key Manager Patterns:
 * - Payment/Admin Grant/Reconciliation: User manages their own key
 *   Rationale: User paid for or was granted access, should control the key
 *   Pattern: [recipientAddress]
 *
 * - Milestone: Admin manages the key
 *   Rationale: Milestone keys are earned credentials, non-transferable
 *   Pattern: [adminAddress]
 *
 * @param recipientAddress - The address receiving the key
 * @param context - The context in which the key is being granted
 * @returns Array of addresses that can manage the granted key
 */
export function getKeyManagersForContext(
  recipientAddress: Address,
  context: KeyGrantContext,
): Address[] {
  // Milestone keys are managed by admin to prevent transfer
  // These represent earned credentials, not purchased access
  if (context === "milestone") {
    const adminAddress = getLockManagerAddress();
    if (!adminAddress) {
      throw new Error(
        "Admin wallet not configured - required for milestone key grants",
      );
    }
    return [adminAddress as Address];
  }

  // Payment, admin grant, and reconciliation contexts:
  // User manages their own key since they paid for or were granted access
  return [recipientAddress];
}

/**
 * Validate that key managers array is properly formatted
 * Prevents the "Array index out of bounds" contract error
 *
 * @param keyManagers - The key managers array to validate
 * @throws Error if the array is empty or invalid
 */
export function validateKeyManagers(keyManagers: Address[]): void {
  if (!keyManagers || keyManagers.length === 0) {
    throw new Error(
      "Key managers array cannot be empty - this causes contract revert. " +
        "Use getKeyManagersForContext() to get the appropriate key managers.",
    );
  }

  // Validate each address
  for (const manager of keyManagers) {
    if (!manager || !/^0x[a-fA-F0-9]{40}$/.test(manager)) {
      throw new Error(`Invalid key manager address: ${manager}`);
    }
  }
}
