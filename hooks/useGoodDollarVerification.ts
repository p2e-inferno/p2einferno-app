"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { useIdentitySDK } from "@/lib/gooddollar/use-identity-sdk";
import { isVerificationExpired } from "@/lib/gooddollar/identity-sdk";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hook:use-gooddollar-verification");

export interface VerificationStatus {
  isWhitelisted: boolean;
  isExpired: boolean;
  expiresAt?: Date;
  lastChecked?: Date;
  needsReVerification: boolean;
}

/**
 * Hook to check GoodDollar face verification status
 * Polls on-chain whitelist contract and checks expiry
 *
 * Wallet / user detection:
 * - Uses Privy auth as the source of truth for user state
 * - Uses useDetectConnectedWalletAddress to determine the active wallet
 *   (aligned with PrivyConnectButton + admin auth patterns)
 */
export function useGoodDollarVerification() {
  const { ready, authenticated } = usePrivy();
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const sdk = useIdentitySDK();

  const query = useQuery<VerificationStatus>({
    queryKey: ["gooddollar-verification", walletAddress],
    queryFn: async () => {
      if (!ready || !authenticated || !walletAddress || !sdk) {
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
        };
      }

      try {
        const normalizedAddress = walletAddress.toLowerCase() as `0x${string}`;

        // Check on-chain whitelist status
        const { isWhitelisted } = await sdk.getWhitelistedRoot(
          normalizedAddress
        );

        // Get expiry data if whitelisted
        let expiresAt: Date | undefined;
        let needsReVerification = false;

        if (isWhitelisted) {
          try {
            const expiryData = await sdk.getIdentityExpiryData(
              normalizedAddress
            );
            // Calculate expiry timestamp from lastAuthenticated and authPeriod
            const expiryTimestampMs =
              Number(expiryData.lastAuthenticated) * 1000 +
              Number(expiryData.authPeriod) * 24 * 60 * 60 * 1000;
            expiresAt = new Date(expiryTimestampMs);
            needsReVerification = isVerificationExpired(expiryTimestampMs);
          } catch (error) {
            log.warn("Failed to get expiry data", {
              address: normalizedAddress,
              error,
            });
          }
        }

        log.info("Verification status checked", {
          address: normalizedAddress,
          isWhitelisted,
          expiresAt,
          needsReVerification,
        });

        return {
          isWhitelisted,
          isExpired: needsReVerification,
          expiresAt,
          lastChecked: new Date(),
          needsReVerification,
        };
      } catch (error) {
        log.error("Failed to check verification status", {
          address: walletAddress,
          error,
        });
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
        };
      }
    },
    enabled: !!walletAddress && !!sdk && ready && authenticated,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    retry: 2,
    retryDelay: (attemptIndex: number) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return query;
}
