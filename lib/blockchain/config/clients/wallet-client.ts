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
import {
  resolveChainById,
  isRpcResolverSupportedChain,
} from "../core/chain-map";
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

export const createWalletClientForNetwork = (networkConfig: {
  chainId: number;
  rpcUrl?: string | null;
}): WalletClient | null => {
  const { privateKey, hasValidKey } = validateEnvironment();

  if (!hasValidKey || !privateKey) {
    blockchainLogger.warn(
      "Cannot create wallet client - private key not configured",
      { operation: "walletClient:create" },
    );
    return null;
  }

  const chain = resolveChainById(networkConfig.chainId);
  if (!chain) {
    blockchainLogger.error("Unsupported chainId for wallet client", {
      operation: "walletClient:create",
      chainId: networkConfig.chainId,
    });
    return null;
  }

  try {
    const { timeoutMs, stallMs, retryCount, retryDelay } =
      getRpcFallbackSettings();
    const account = privateKeyToAccount(privateKey);

    if (networkConfig.rpcUrl) {
      return createWalletClient({
        account,
        chain,
        transport: fallback(
          [http(networkConfig.rpcUrl, { timeout: timeoutMs })],
          { rank: { timeout: stallMs }, retryCount, retryDelay },
        ),
      }) as unknown as WalletClient;
    }

    if (!isRpcResolverSupportedChain(chain.id)) {
      blockchainLogger.error("RPC URL required for chain", {
        operation: "walletClient:create",
        chainId: chain.id,
      });
      return null;
    }

    const { urls } = resolveRpcUrls(chain.id);
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
