import { mainnet } from "viem/chains";
import {
  createPublicClientUnified,
  createPublicClientForChain,
} from "@/lib/blockchain/config";
import { getEnsName } from "viem/ens";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("blockchain:identity-resolver");

// Simple in-memory cache with 1-hour TTL
interface CacheEntry {
  displayName: string;
  basename: string | null;
  ensName: string | null;
  timestamp: number;
}

const identityCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Clear expired cache entries
 */
function clearExpiredCache(): void {
  const now = Date.now();
  for (const [address, entry] of identityCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      identityCache.delete(address);
      log.debug("Cleared expired cache entry", { address });
    }
  }
}

/**
 * Resolve blockchain identity for a wallet address
 * Priority: Basename > ENS > Full wallet address
 * Implements 1-hour cache to reduce RPC calls
 *
 * @param address - The wallet address to resolve
 * @returns Display name following priority order
 */
export async function resolveBlockchainIdentity(
  address: string
): Promise<{
  displayName: string;
  basename: string | null;
  ensName: string | null;
  isFromCache: boolean;
}> {
  // Normalize address
  const normalizedAddress = address.toLowerCase();

  // Check cache first
  const cached = identityCache.get(normalizedAddress);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL) {
      log.debug("Cache hit for identity resolution", {
        address: normalizedAddress,
        cacheAge: `${Math.round(age / 1000)}s`,
      });
      return {
        displayName: cached.displayName,
        basename: cached.basename,
        ensName: cached.ensName,
        isFromCache: true,
      };
    } else {
      // Cache expired
      identityCache.delete(normalizedAddress);
    }
  }

  log.info("Resolving blockchain identity", { address: normalizedAddress });

  try {
    // Create public clients
    const baseClient = createPublicClientUnified();
    const mainnetClient = createPublicClientForChain(mainnet);

    // Resolve basename on Base network
    let basename: string | null = null;
    try {
      basename = await getEnsName(baseClient, {
        address: address as `0x${string}`,
      });
      log.info("Basename resolved", { address: normalizedAddress, basename });
    } catch (err) {
      log.debug("Basename resolution failed (expected for most addresses)", {
        address: normalizedAddress,
      });
    }

    // Resolve ENS name on Ethereum mainnet
    let ensName: string | null = null;
    try {
      ensName = await getEnsName(mainnetClient, {
        address: address as `0x${string}`,
      });
      log.info("ENS name resolved", { address: normalizedAddress, ensName });
    } catch (err) {
      log.debug("ENS resolution failed (expected for most addresses)", {
        address: normalizedAddress,
      });
    }

    // Determine display name priority: basename > ENS > full wallet address
    const displayName = basename || ensName || address;

    // Store in cache
    const cacheEntry: CacheEntry = {
      displayName,
      basename,
      ensName,
      timestamp: Date.now(),
    };
    identityCache.set(normalizedAddress, cacheEntry);

    // Periodically clear expired entries
    if (identityCache.size > 100) {
      clearExpiredCache();
    }

    log.info("Blockchain identity resolved", {
      address: normalizedAddress,
      displayName,
      basename,
      ensName,
    });

    return {
      displayName,
      basename,
      ensName,
      isFromCache: false,
    };
  } catch (error) {
    log.error("Failed to resolve blockchain identity", {
      address: normalizedAddress,
      error,
    });

    // Fallback to wallet address on error
    return {
      displayName: address,
      basename: null,
      ensName: null,
      isFromCache: false,
    };
  }
}

/**
 * Clear the identity cache (useful for testing)
 */
export function clearIdentityCache(): void {
  identityCache.clear();
  log.info("Identity cache cleared");
}

/**
 * Get cache statistics
 */
export function getIdentityCacheStats(): {
  size: number;
  entries: Array<{ address: string; age: number }>;
} {
  const now = Date.now();
  const entries = Array.from(identityCache.entries()).map(
    ([address, entry]) => ({
      address,
      age: Math.round((now - entry.timestamp) / 1000), // age in seconds
    })
  );

  return {
    size: identityCache.size,
    entries,
  };
}
