import { ethers } from "ethers";
import { type Address } from "viem";
import { getClientConfig } from "./config/unified-config";
import { getLogger } from '@/lib/utils/logger';
import { 
  ensureCorrectNetwork as ensureCorrectNetworkShared,
  getBlockExplorerUrl as getBlockExplorerUrlShared,
  type NetworkConfig 
} from "./shared/network-utils";

const log = getLogger('blockchain:transaction-helpers');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface TransactionReceipt {
  logs: Array<{
    topics: string[];
    data: string;
  }>;
  status?: number | string;
}

export interface LockExtractionResult {
  success: boolean;
  lockAddress?: string;
  error?: string;
}

export interface TokenExtractionResult {
  success: boolean;
  tokenIds: bigint[];
  error?: string;
}

// ============================================================================
// NETWORK HANDLING
// ============================================================================

/**
 * Switch to the correct network for Unlock operations
 * Uses shared network utilities
 */
export const ensureCorrectNetwork = async (rawProvider: any): Promise<void> => {
  const clientConfig = getClientConfig();
  const networkConfig: NetworkConfig = {
    chain: clientConfig.chain,
    rpcUrl: clientConfig.rpcUrl,
    networkName: clientConfig.networkName,
  };
  
  return ensureCorrectNetworkShared(rawProvider, networkConfig);
};

// ============================================================================
// LOCK ADDRESS EXTRACTION
// ============================================================================

/**
 * Extract lock address from transaction receipt using NewLock event
 * Extracted and refactored from lib/unlock/lockUtils.ts:656
 */
export const extractLockAddressFromReceipt = (receipt: TransactionReceipt, deployerAddress?: string): LockExtractionResult => {
  try {
    let lockAddress = "Unknown";

    // Parse logs to find the NewLock event
    if (receipt.logs && receipt.logs.length > 0) {
      // Create an interface for the Unlock factory to parse logs
      const unlockInterface = new ethers.Interface([
        "event NewLock(address indexed lockOwner, address indexed newLockAddress)",
      ]);

      // Parse all logs to find the NewLock event
  for (const entry of receipt.logs) {
    try {
      const parsedLog = unlockInterface.parseLog({
        topics: entry.topics,
        data: entry.data,
      });

          if (parsedLog && parsedLog.name === "NewLock") {
            lockAddress = parsedLog.args.newLockAddress;
            log.info("Found lock address from NewLock event:", lockAddress);
            break;
          }
        } catch (e) {
          // This log isn't a NewLock event, continue
          continue;
        }
      }
    }

    // If we still don't have a valid address, try alternative extraction
  if (lockAddress === "Unknown" && receipt.logs && receipt.logs.length > 0) {
      // Look for any log that might contain an address
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    for (const entry of receipt.logs) {
      if (entry.topics && entry.topics.length > 1) {
        for (let i = 1; i < entry.topics.length; i++) {
          const topic = entry.topics[i];
            if (topic) {
              const potentialAddress = `0x${topic.slice(-40)}`;
              if (
                addressRegex.test(potentialAddress) &&
                (!deployerAddress || potentialAddress !== deployerAddress)
              ) {
                lockAddress = potentialAddress;
                log.info(
                  "Found potential lock address from log topics:",
                  lockAddress
                );
                break;
              }
            }
          }
          if (lockAddress !== "Unknown") break;
        }
      }
    }

    if (lockAddress === "Unknown") {
      return {
        success: false,
        error: "Could not extract lock address from transaction receipt",
      };
    }

    return {
      success: true,
      lockAddress,
    };
  } catch (error) {
    log.error("Error extracting lock address:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ============================================================================
// TOKEN ID EXTRACTION
// ============================================================================

/**
 * Extract token IDs from transaction receipt using Transfer events
 * Extracted from lib/blockchain/lock-manager.ts:226
 */
export const extractTokenIdsFromReceipt = (receipt: TransactionReceipt): TokenExtractionResult => {
  try {
    const tokenIds: bigint[] = [];

    // Look for Transfer events in the logs
    for (const log of receipt.logs) {
      if (
        log.topics[0] ===
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
      ) {
        // Transfer event topic
        const tokenIdTopic = log.topics[3];
        if (tokenIdTopic) {
          const tokenId = BigInt(tokenIdTopic);
          tokenIds.push(tokenId);
        }
      }
    }

    return {
      success: true,
      tokenIds,
    };
  } catch (error) {
    log.warn("Could not extract token IDs from receipt");
    return {
      success: false,
      tokenIds: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// ============================================================================
// ADMIN LOCK MANAGER ADDRESSES
// ============================================================================

/**
 * Get lock manager and admin addresses from environment variables
 * Returns array of addresses to be used as key managers for deployed locks
 */
export const getAdminLockManagerAddresses = (): Address[] => {
  const addresses: Address[] = [];

  // Add lock manager private key address if available
  const lockManagerPrivateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  if (lockManagerPrivateKey) {
    try {
      // Extract address from private key using ethers
      const wallet = new ethers.Wallet(lockManagerPrivateKey);
      addresses.push(wallet.address as Address);
      log.info("Added lock manager address:", wallet.address);
    } catch (error) {
      log.warn("Could not derive address from LOCK_MANAGER_PRIVATE_KEY:", error);
    }
  }

  // Add dev admin addresses if available
  const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
  if (devAdminAddresses) {
    const adminAddrs = devAdminAddresses
      .split(",")
      .map((addr) => addr.trim())
      .filter((addr) => /^0x[a-fA-F0-9]{40}$/.test(addr)) as Address[];
    
    addresses.push(...adminAddrs);
    log.info("Added admin addresses:", adminAddrs);
  }

  // Remove duplicates while preserving order
  const uniqueAddresses = addresses.filter((addr, index) => 
    addresses.indexOf(addr) === index
  );

  log.info("Final lock manager addresses:", uniqueAddresses);
  return uniqueAddresses;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Validate if an address is a valid Ethereum address
 */
export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Get block explorer URL for transaction
 * Uses shared network utilities
 */
export const getBlockExplorerUrl = (txHash: string): string => {
  const clientConfig = getClientConfig();
  const networkConfig: NetworkConfig = {
    chain: clientConfig.chain,
    rpcUrl: clientConfig.rpcUrl,
    networkName: clientConfig.networkName,
  };
  
  return getBlockExplorerUrlShared(txHash, networkConfig);
};
