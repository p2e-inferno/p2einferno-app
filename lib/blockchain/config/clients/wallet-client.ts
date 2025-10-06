/**
 * Wallet client creation utilities
 * Handles write operations and transaction signing
 */

import { createWalletClient, http, fallback, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { validateEnvironment } from "../core/validation";
import {
  resolveChain,
  resolveRpcUrls,
  getRpcFallbackSettings,
} from "../core/chain-resolution";
import { blockchainLogger } from "../../shared/logging-utils";

/**
 * Create wallet client for write operations (server-side only)
 * Returns null if private key is not configured
 */
export const createWalletClientUnified = (): WalletClient | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    blockchainLogger.warn(
      "Cannot create wallet client - private key not configured",
      { operation: "walletClient:create" },
    );
    return null;
  }

  try {
    const { chain } = resolveChain();
    const { urls } = resolveRpcUrls(chain.id);
    const { timeoutMs, stallMs, retryCount, retryDelay } =
      getRpcFallbackSettings();

    const account = privateKeyToAccount(privateKey);
    return createWalletClient({
      account,
      chain,
      transport: fallback(
        urls.map((u) => http(u, { timeout: timeoutMs })),
        { rank: { timeout: stallMs }, retryCount, retryDelay },
      ),
    }) as unknown as WalletClient;
  } catch (error) {
    blockchainLogger.error("Failed to create wallet client", {
      operation: "walletClient:create",
      error: (error as any)?.message || String(error),
    });
    return null;
  }
};
