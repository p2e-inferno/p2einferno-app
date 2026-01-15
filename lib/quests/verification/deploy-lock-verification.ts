/**
 * Deploy Lock Verification Strategy
 *
 * Verifies Unlock Protocol lock deployment transactions across multiple EVM networks.
 * Implements automatic verification with network-based reward multipliers.
 */

import type { PublicClient } from "viem";
import type { TaskType } from "@/lib/supabase/types";
import type {
  VerificationStrategy,
  VerificationResult,
  VerificationOptions,
} from "./types";
import {
  type DeployLockTaskConfig,
  validateDeployLockConfig,
  getNetworkDisplayName,
  UNLOCK_FACTORY_ADDRESSES,
} from "./deploy-lock-utils";
import { extractLockAddressFromReceipt } from "@/lib/blockchain/shared/transaction-utils";
import { createPublicClientForChain } from "@/lib/blockchain/config/clients/public-client";
import { resolveChainById } from "@/lib/blockchain/config/core/chain-map";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("deploy-lock-verification");

/**
 * Verification strategy for deploy_lock task type
 * Supports multi-network lock deployment with automatic verification
 */
export class DeployLockVerificationStrategy implements VerificationStrategy {
  async verify(
    taskType: TaskType,
    verificationData: Record<string, unknown>,
    userId: string,
    userAddress: string,
    options?: VerificationOptions
  ): Promise<VerificationResult> {
    log.debug("Starting deploy_lock verification", {
      taskType,
      userId,
      userAddress,
    });

    // Extract and validate transaction hash
    const { transactionHash } = verificationData as {
      transactionHash?: `0x${string}`;
    };

    if (!transactionHash) {
      log.warn("Transaction hash missing", { userId });
      return {
        success: false,
        error: "Transaction hash required",
        code: "TX_HASH_REQUIRED",
      };
    }

    // Validate transaction hash format
    if (!/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
      log.warn("Invalid transaction hash format", {
        userId,
        transactionHash,
      });
      return {
        success: false,
        error:
          "Invalid transaction hash format. Must be 0x followed by 64 hex characters.",
        code: "INVALID_TX_HASH",
      };
    }

    // Parse and validate task configuration
    const configValidation = validateDeployLockConfig(options?.taskConfig);
    if (!configValidation.success) {
      log.error("Invalid task configuration", {
        userId,
        error: configValidation.error,
      });
      return {
        success: false,
        error: configValidation.error || "Invalid configuration",
        code: "INVALID_CONFIG",
      };
    }

    const config = options?.taskConfig as unknown as DeployLockTaskConfig;

    // Find transaction on allowed networks (parallel)
    const networkResult = await this.findTransactionNetwork(
      transactionHash,
      config.allowed_networks
    );

    if (!networkResult.success) {
      log.warn("Transaction not found on any allowed network", {
        userId,
        transactionHash,
        allowedNetworks: config.allowed_networks.map((n) => n.chain_id),
      });
      return {
        success: false,
        error:
          networkResult.error ||
          "Transaction not found on any allowed network",
        code: networkResult.code || "TX_NOT_FOUND_MULTI_NETWORK",
      };
    }

    const { chainId, client, receipt } = networkResult;

    // Validate transaction properties
    const validation = await this.validateTransaction(
      receipt,
      client,
      userAddress,
      config,
      chainId
    );

    if (!validation.success) {
      log.warn("Transaction validation failed", {
        userId,
        transactionHash,
        chainId,
        code: validation.code,
      });
      return validation;
    }

    // Validate that NewLock event comes from official Unlock factory
    const expectedFactory = UNLOCK_FACTORY_ADDRESSES[chainId];
    if (!expectedFactory) {
      log.error("No Unlock factory address configured for chain", {
        userId,
        chainId,
      });
      return {
        success: false,
        error: `Unlock Protocol not supported on chain ${chainId}`,
        code: "INVALID_CONFIG",
      };
    }

    // NewLock event signature: 0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7
    const NEW_LOCK_EVENT_SIGNATURE =
      "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7";
    const hasValidFactoryEvent = receipt.logs.some(
      (log: { topics: string[]; address: string }) =>
        log.topics[0] === NEW_LOCK_EVENT_SIGNATURE &&
        log.address.toLowerCase() === expectedFactory.toLowerCase()
    );

    if (!hasValidFactoryEvent) {
      log.warn("NewLock event not from official Unlock factory", {
        userId,
        transactionHash,
        chainId,
        expectedFactory,
        logAddresses: receipt.logs
          .filter((l: { topics: string[] }) => l.topics[0] === NEW_LOCK_EVENT_SIGNATURE)
          .map((l: { address: string }) => l.address),
      });
      return {
        success: false,
        error:
          "This transaction is not from an official Unlock Protocol factory. Please deploy using the official Unlock dashboard.",
        code: "INVALID_FACTORY",
      };
    }

    // Extract lock address from receipt
    const lockAddress = extractLockAddressFromReceipt(receipt, userAddress);
    if (!lockAddress) {
      log.error("Could not extract lock address from receipt", {
        userId,
        transactionHash,
        chainId,
      });
      return {
        success: false,
        error:
          "Could not find lock deployment in this transaction. Is this an Unlock Protocol lock deployment?",
        code: "LOCK_ADDRESS_NOT_FOUND",
      };
    }

    // Calculate reward multiplier based on network
    const networkConfig = config.allowed_networks.find(
      (n) => n.chain_id === chainId
    );
    const rewardMultiplier = networkConfig?.reward_ratio || 1.0;

    log.info("Lock deployment verified successfully", {
      userId,
      transactionHash,
      chainId,
      lockAddress,
      rewardMultiplier,
      networkName: getNetworkDisplayName(chainId),
    });

    return {
      success: true,
      metadata: {
        transactionHash,
        chainId,
        lockAddress,
        blockNumber: receipt.blockNumber?.toString(),
        rewardMultiplier,
        networkName: getNetworkDisplayName(chainId),
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Find which network the transaction exists on
   * Tries all enabled networks in parallel for optimal performance
   */
  private async findTransactionNetwork(
    txHash: `0x${string}`,
    networks: DeployLockTaskConfig["allowed_networks"]
  ): Promise<
    | {
        success: true;
        chainId: number;
        client: PublicClient;
        receipt: any;
      }
    | { success: false; error?: string; code?: string }
  > {
    const enabledNetworks = networks.filter((n) => n.enabled);

    if (enabledNetworks.length === 0) {
      return {
        success: false,
        error: "No enabled networks in configuration",
        code: "INVALID_CONFIG",
      };
    }

    log.debug("Searching for transaction on networks", {
      txHash,
      networks: enabledNetworks.map((n) => ({
        chainId: n.chain_id,
        name: getNetworkDisplayName(n.chain_id),
      })),
    });

    // Try networks in parallel for faster verification
    const results = await Promise.allSettled(
      enabledNetworks.map(async (net) => {
        const chain = resolveChainById(net.chain_id);
        if (!chain) {
          log.warn("Chain not found in chain map", { chainId: net.chain_id });
          throw new Error(`Unsupported chain: ${net.chain_id}`);
        }

        try {
          const client = createPublicClientForChain(chain);
          const receipt = await client.getTransactionReceipt({ hash: txHash });

          log.debug("Transaction found", {
            txHash,
            chainId: net.chain_id,
            blockNumber: receipt.blockNumber?.toString(),
          });

          return { chainId: net.chain_id, client, receipt };
        } catch (error) {
          // Transaction not found on this network - expected, not an error
          log.debug("Transaction not found on network", {
            txHash,
            chainId: net.chain_id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          throw error;
        }
      })
    );

    // Collect all successful results to detect multi-network conflicts
    const successfulResults = results.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled"
    );

    // Check for multi-network conflict (same tx on multiple chains)
    if (successfulResults.length > 1) {
      const conflictingNetworks = successfulResults
        .map((r) => getNetworkDisplayName(r.value.chainId))
        .join(", ");

      log.warn("Transaction found on multiple networks", {
        txHash,
        networks: successfulResults.map((r) => r.value.chainId),
      });

      return {
        success: false,
        error: `This transaction exists on multiple networks (${conflictingNetworks}). Please submit a transaction that exists on only one network.`,
        code: "MULTI_NETWORK_CONFLICT",
      };
    }

    // Exactly one network found - return it
    if (successfulResults.length === 1) {
      return { success: true, ...successfulResults[0]!.value };
    }

    // All networks failed - transaction not found anywhere
    const networkNames = enabledNetworks
      .map((n) => getNetworkDisplayName(n.chain_id))
      .join(", ");

    return {
      success: false,
      error: `Transaction not found on any allowed network: ${networkNames}`,
      code: "TX_NOT_FOUND_MULTI_NETWORK",
    };
  }

  /**
   * Validate transaction properties
   * Checks status, sender, and optional timestamp
   */
  private async validateTransaction(
    receipt: any,
    client: PublicClient,
    userAddress: string,
    config: DeployLockTaskConfig,
    chainId: number
  ): Promise<VerificationResult> {
    // Check transaction status
    if (receipt.status !== "success") {
      return {
        success: false,
        error: "Transaction failed on-chain. Please submit a successful deployment.",
        code: "TX_FAILED",
      };
    }

    // Verify sender matches user
    const receiptFrom = receipt.from.toLowerCase();
    const expectedFrom = userAddress.toLowerCase();

    if (receiptFrom !== expectedFrom) {
      log.warn("Transaction sender mismatch", {
        expected: expectedFrom,
        actual: receiptFrom,
        chainId,
      });
      return {
        success: false,
        error: "This transaction was not sent from your connected wallet.",
        code: "SENDER_MISMATCH",
      };
    }

    // Check timestamp if configured
    if (config.min_timestamp) {
      try {
        const block = await client.getBlock({
          blockNumber: receipt.blockNumber,
        });

        const blockTimestamp = Number(block.timestamp);
        if (blockTimestamp < config.min_timestamp) {
          log.warn("Deployment occurred before quest start", {
            blockTimestamp,
            minTimestamp: config.min_timestamp,
            chainId,
          });
          return {
            success: false,
            error:
              "This deployment occurred before the quest started. Please deploy a new lock.",
            code: "TX_TOO_OLD",
          };
        }
      } catch (error) {
        log.error("Failed to fetch block for timestamp validation", {
          error: error instanceof Error ? error.message : "Unknown error",
          blockNumber: receipt.blockNumber?.toString(),
          chainId,
          minTimestamp: config.min_timestamp,
        });

        // GRACEFUL DEGRADATION: Don't fail verification if we can't fetch the block
        // This prevents RPC issues from blocking valid deployments
        // TODO: Consider implementing stricter enforcement options in the future:
        //   - Add config flag to require timestamp validation (fail on RPC error)
        //   - Implement retry logic with exponential backoff
        //   - Track failed timestamp checks in metrics for monitoring
        log.warn("Continuing verification without timestamp check due to RPC failure", {
          chainId,
          blockNumber: receipt.blockNumber?.toString(),
        });
      }
    }

    return { success: true };
  }
}
