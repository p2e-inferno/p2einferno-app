import { IdentitySDK } from "@goodsdks/citizen-sdk";
import { createWalletClient, http } from "viem";
import { celo } from "viem/chains";
import { getLogger } from "@/lib/utils/logger";
import { createPublicClientForChain } from "@/lib/blockchain/config/clients";

const log = getLogger("gooddollar:identity-sdk");

const GOODDOLLAR_ENV = (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV || "development") as
  | "production"
  | "staging"
  | "development";

/**
 * Create IdentitySDK instance for server-side operations
 */
export async function createIdentitySDK() {
  // Use the shared client helper to get a public client for the GoodDollar chain.
  const publicClient = createPublicClientForChain(celo);

  // For server-side read-only operations (checking whitelist/expiry),
  // we create a minimal wallet client with a dummy account.
  // This is only used for SDK initialization; actual signing is not performed server-side.
  const walletClient = createWalletClient({
    account: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    chain: celo,
    transport: http(),
  });

  try {
    // Note: Using 'as any' to handle viem version compatibility between
    // @goodsdks/citizen-sdk and our current viem version
    const sdk = await IdentitySDK.init({
      publicClient: publicClient as any,
      walletClient: walletClient as any,
      env: GOODDOLLAR_ENV,
    });
    log.info("IdentitySDK initialized", {
      environment: GOODDOLLAR_ENV,
      chain: celo.name,
    });
    return sdk;
  } catch (error) {
    log.error("Failed to initialize IdentitySDK", { error });
    throw error;
  }
}

/**
 * Check if an address is whitelisted on-chain
 * CRITICAL: Always verify on-chain, never trust client-side status alone
 *
 * @param address - Wallet address to check
 * @returns Object containing whitelist status and root data
 */
export async function checkWhitelistStatus(address: `0x${string}`) {
  try {
    const sdk = await createIdentitySDK();
    const { isWhitelisted, root } = await sdk.getWhitelistedRoot(address);

    log.info("Whitelist status checked", {
      address,
      isWhitelisted,
      rootExists: !!root,
    });

    return { isWhitelisted, root };
  } catch (error) {
    log.error("Failed to check whitelist status", { address, error });
    throw error;
  }
}

/**
 * Get identity expiry data for re-verification scheduling
 *
 * @param address - Wallet address to check
 * @returns Expiry data including lastAuthenticated and authPeriod (both bigint)
 */
export async function getIdentityExpiry(address: `0x${string}`) {
  try {
    const sdk = await createIdentitySDK();
    const expiryData = await sdk.getIdentityExpiryData(address);

    log.info("Identity expiry data retrieved", {
      address,
      lastAuthenticated: expiryData.lastAuthenticated.toString(),
      authPeriod: expiryData.authPeriod.toString(),
    });

    return expiryData as any;
  } catch (error) {
    log.error("Failed to get identity expiry data", { address, error });
    throw error;
  }
}

/**
 * Calculate expiry timestamp from lastAuthenticated and authPeriod
 * This is a utility to convert contract data to user-friendly expiry time
 *
 * @param lastAuthenticated - Unix timestamp of last verification (bigint)
 * @param authPeriod - Authentication period in days (bigint)
 * @returns Millisecond timestamp when verification expires
 */
export function calculateExpiryTimestamp(
  lastAuthenticated: bigint,
  authPeriod: bigint
): number {
  // Convert to milliseconds and add auth period (days -> milliseconds)
  const lastAuthMs = Number(lastAuthenticated) * 1000;
  const authPeriodMs = Number(authPeriod) * 24 * 60 * 60 * 1000;
  return lastAuthMs + authPeriodMs;
}

/**
 * Calculate if verification has expired
 *
 * @param expiryTimestampMs - Millisecond timestamp when verification expires
 * @returns true if expired, false if still valid
 */
export function isVerificationExpired(expiryTimestampMs: number): boolean {
  return Date.now() > expiryTimestampMs;
}

/**
 * Get time remaining until verification expires
 *
 * @param expiryTimestampMs - Millisecond timestamp when verification expires
 * @returns Milliseconds remaining, or 0 if already expired
 */
export function getTimeUntilExpiry(expiryTimestampMs: number): number {
  const remainingMs = expiryTimestampMs - Date.now();
  return remainingMs > 0 ? remainingMs : 0;
}
