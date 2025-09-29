/**
 * Shared transaction utilities for receipt processing and analysis
 * Consolidates common transaction operations
 */

import { ethers } from "ethers";
import {
  decodeEventLog,
  getAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { EVENT_SIGNATURES, UNLOCK_FACTORY_EVENTS } from "./abi-definitions";
import { blockchainLogger } from "./logging-utils";

const UNLOCK_FACTORY_EVENTS_ABI = parseAbi(UNLOCK_FACTORY_EVENTS);

// ============================================================================
// TYPES
// ============================================================================

export interface TokenTransfer {
  from: string;
  to: string;
  tokenId: bigint;
}

export interface TransactionAnalysis {
  success: boolean;
  tokenTransfers: TokenTransfer[];
  newLockAddress?: string;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
}

// ============================================================================
// TOKEN ID EXTRACTION
// ============================================================================

/**
 * Extract token IDs from transaction receipt (works with both ethers and viem receipts)
 */
export const extractTokenIdsFromReceipt = (receipt: any): bigint[] => {
  const tokenIds: bigint[] = [];

  try {
    if (!receipt.logs || receipt.logs.length === 0) {
      blockchainLogger.debug("No logs found in transaction receipt");
      return tokenIds;
    }

    // Look for Transfer events in the logs
    for (const log of receipt.logs) {
      if (log.topics && log.topics[0] === EVENT_SIGNATURES.TRANSFER) {
        try {
          // Transfer event: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
          const tokenId = BigInt(log.topics[3]);
          tokenIds.push(tokenId);

          blockchainLogger.debug("Extracted token ID from transfer event", {
            operation: "extractTokenIds",
            tokenId: tokenId.toString(),
            from: log.topics[1],
            to: log.topics[2],
          });
        } catch (error) {
          blockchainLogger.warn(
            "Failed to parse token ID from transfer event",
            {
              operation: "extractTokenIds",
              error: error instanceof Error ? error.message : "Unknown error",
            },
          );
        }
      }
    }
  } catch (error) {
    blockchainLogger.error("Error extracting token IDs from receipt", {
      operation: "extractTokenIds",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return tokenIds;
};

/**
 * Extract token transfers from transaction receipt
 */
export const extractTokenTransfers = (receipt: any): TokenTransfer[] => {
  const transfers: TokenTransfer[] = [];

  try {
    if (!receipt.logs || receipt.logs.length === 0) {
      return transfers;
    }

    for (const log of receipt.logs) {
      if (log.topics && log.topics[0] === EVENT_SIGNATURES.TRANSFER) {
        try {
          const from = `0x${log.topics[1].slice(-40)}`;
          const to = `0x${log.topics[2].slice(-40)}`;
          const tokenId = BigInt(log.topics[3]);

          transfers.push({ from, to, tokenId });
        } catch (error) {
          blockchainLogger.warn("Failed to parse transfer event", {
            operation: "extractTokenTransfers",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }
  } catch (error) {
    blockchainLogger.error("Error extracting token transfers", {
      operation: "extractTokenTransfers",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return transfers;
};

// ============================================================================
// LOCK ADDRESS EXTRACTION
// ============================================================================

/**
 * Extract lock address from deployment transaction receipt
 */
export const extractLockAddressFromReceipt = (
  receipt: any,
  deployerAddress: string,
): string | null => {
  try {
    if (!receipt.logs || receipt.logs.length === 0) {
      blockchainLogger.warn("No logs found in deployment receipt");
      return null;
    }

    // Try to parse NewLock event first
    const unlockInterface = new ethers.Interface(UNLOCK_FACTORY_EVENTS);

    for (const log of receipt.logs) {
      try {
        const parsedLog = unlockInterface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsedLog && parsedLog.name === "NewLock") {
          const lockAddress = parsedLog.args.newLockAddress;
          blockchainLogger.info("Extracted lock address from NewLock event", {
            operation: "extractLockAddress",
            lockAddress,
            deployerAddress,
          });
          return lockAddress;
        }
      } catch (e) {
        // This log isn't a NewLock event, continue
        continue;
      }
    }

    // Fallback: Look for any address in log topics that isn't the deployer
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    for (const log of receipt.logs) {
      if (log.topics && log.topics.length > 1) {
        for (let i = 1; i < log.topics.length; i++) {
          const potentialAddress = `0x${log.topics[i].slice(-40)}`;
          if (
            addressRegex.test(potentialAddress) &&
            potentialAddress.toLowerCase() !== deployerAddress.toLowerCase() &&
            potentialAddress !== "0x0000000000000000000000000000000000000000"
          ) {
            blockchainLogger.info(
              "Extracted lock address from log topics fallback",
              {
                operation: "extractLockAddress",
                lockAddress: potentialAddress,
                deployerAddress,
              },
            );
            return potentialAddress;
          }
        }
      }
    }

    blockchainLogger.warn("Could not extract lock address from receipt", {
      operation: "extractLockAddress",
      deployerAddress,
      logCount: receipt.logs.length,
    });
    return null;
  } catch (error) {
    blockchainLogger.error("Error extracting lock address from receipt", {
      operation: "extractLockAddress",
      error: error instanceof Error ? error.message : "Unknown error",
      deployerAddress,
    });
    return null;
  }
};

/**
 * Extract lock address from a viem receipt
 */
export const extractLockAddressFromReceiptViem = (
  receipt: { logs?: Array<{ topics?: readonly Hex[]; data: Hex }> },
  deployerAddress?: Address,
): Address | null => {
  try {
    const { logs } = receipt || {};
    if (!logs || logs.length === 0) {
      blockchainLogger.warn("No logs found in deployment receipt (viem)");
      return null;
    }

    for (const log of logs) {
      if (!log.topics || log.topics.length === 0) continue;

      try {
        const topics = [...log.topics].filter(Boolean) as [
          `0x${string}`,
          ...`0x${string}`[],
        ];
        if (topics.length === 0) continue;

        const decoded = decodeEventLog({
          abi: UNLOCK_FACTORY_EVENTS_ABI,
          data: log.data,
          topics,
        });

        if (
          decoded.eventName === "NewLock" &&
          decoded.args?.newLockAddress
        ) {
          const address = getAddress(
            decoded.args.newLockAddress as `0x${string}`,
          );
          blockchainLogger.info("Extracted lock address from NewLock event", {
            operation: "extractLockAddressViem",
            lockAddress: address,
            deployerAddress,
          });
          return address;
        }
      } catch (error) {
        // Not a NewLock event – continue scanning
      }
    }

    for (const log of logs) {
      if (!log.topics || log.topics.length <= 1) continue;
      for (let i = 1; i < log.topics.length; i += 1) {
        const topic = log.topics[i];
        if (!topic || topic.length < 10) continue;

        try {
          const address = getAddress(`0x${topic.slice(-40)}` as `0x${string}`);

          if (
            address !== zeroAddress &&
            (!deployerAddress ||
              address.toLowerCase() !== deployerAddress.toLowerCase())
          ) {
            blockchainLogger.info(
              "Extracted lock address from log topic fallback (viem)",
              {
                operation: "extractLockAddressViem",
                lockAddress: address,
                deployerAddress,
              },
            );
            return address;
          }
        } catch (addressError) {
          // Ignore malformed topic conversions
        }
      }
    }

    blockchainLogger.warn("Could not extract lock address from receipt (viem)", {
      operation: "extractLockAddressViem",
      deployerAddress,
      logCount: logs.length,
    });
    return null;
  } catch (error) {
    blockchainLogger.error("Error extracting lock address from receipt (viem)", {
      operation: "extractLockAddressViem",
      error: error instanceof Error ? error.message : "Unknown error",
      deployerAddress,
    });
    return null;
  }
};

// ============================================================================
// TRANSACTION ANALYSIS
// ============================================================================

/**
 * Analyze transaction receipt for comprehensive information
 */
export const analyzeTransactionReceipt = (
  receipt: any,
  context: { operation: string; userAddress?: string },
): TransactionAnalysis => {
  const analysis: TransactionAnalysis = {
    success: receipt.status === 1 || receipt.status === "success",
    tokenTransfers: extractTokenTransfers(receipt),
    gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed.toString()) : undefined,
    effectiveGasPrice: receipt.effectiveGasPrice
      ? BigInt(receipt.effectiveGasPrice.toString())
      : undefined,
  };

  // For deployment transactions, try to extract lock address
  if (context.operation === "deployLock" && context.userAddress) {
    analysis.newLockAddress =
      extractLockAddressFromReceipt(receipt, context.userAddress) || undefined;
  }

  blockchainLogger.debug("Transaction analysis completed", {
    operation: context.operation,
    success: analysis.success,
    tokenTransferCount: analysis.tokenTransfers.length,
    gasUsed: analysis.gasUsed?.toString(),
    newLockAddress: analysis.newLockAddress,
  });

  return analysis;
};

// ============================================================================
// TRANSACTION WAITING UTILITIES
// ============================================================================

/**
 * Wait for transaction confirmation with consistent logging
 */
export const waitForTransactionConfirmation = async (
  transactionHash: string,
  provider: any,
  operation: string,
  confirmations: number = 2,
): Promise<any> => {
  blockchainLogger.info("Waiting for transaction confirmation", {
    operation,
    transactionHash,
    confirmations,
  });

  try {
    // Handle both ethers and viem providers
    let receipt;

    if (typeof provider.waitForTransactionReceipt === "function") {
      // Viem provider
      receipt = await provider.waitForTransactionReceipt({
        hash: transactionHash as `0x${string}`,
        confirmations,
      });
    } else if (typeof provider.waitForTransaction === "function") {
      // Ethers provider
      receipt = await provider.waitForTransaction(
        transactionHash,
        confirmations,
      );
    } else {
      throw new Error("Unsupported provider type for transaction waiting");
    }

    blockchainLogger.logTransactionSuccess(operation, transactionHash, {
      gasUsed: receipt.gasUsed?.toString(),
      status: receipt.status,
    });

    return receipt;
  } catch (error) {
    blockchainLogger.logTransactionError(operation, error, {
      transactionHash,
    });
    throw error;
  }
};

// ============================================================================
// GAS ESTIMATION UTILITIES
// ============================================================================

/**
 * Estimate gas for a contract call with error handling
 */
export const estimateContractGas = async (
  contract: any,
  methodName: string,
  args: any[],
  overrides: any = {},
): Promise<bigint | null> => {
  try {
    const gasEstimate = await contract[methodName].estimateGas(
      ...args,
      overrides,
    );

    blockchainLogger.debug("Gas estimation completed", {
      operation: "gasEstimate",
      methodName,
      gasEstimate: gasEstimate.toString(),
    });

    return BigInt(gasEstimate.toString());
  } catch (error) {
    blockchainLogger.warn("Gas estimation failed", {
      operation: "gasEstimate",
      methodName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};
