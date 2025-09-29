/**
 * Account creation utilities
 * Handles account creation from private keys
 */

import { privateKeyToAccount, type Account } from "viem/accounts";
import { validateEnvironment } from "../core/validation";
import { blockchainLogger } from "../../shared/logging-utils";

/**
 * Create account from private key (server-side only)
 * Returns null if private key is not configured
 */
export const createAccountUnified = (): Account | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    return null;
  }

  try {
    return privateKeyToAccount(privateKey);
  } catch (error) {
    blockchainLogger.error("Failed to create account", {
      operation: "account:create",
      error: (error as any)?.message || String(error),
    });
    return null;
  }
};
