"use client";

import { useQuery } from "@tanstack/react-query";
import { usePrivy, useUser } from "@privy-io/react-auth";
import { useIdentitySDK } from "@/lib/gooddollar/use-identity-sdk";
import { isVerificationExpired } from "@/lib/gooddollar/identity-sdk";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { getWalletAddressesFromUser } from "@/lib/utils/wallet-selection";
import { getLogger } from "@/lib/utils/logger";
import { useRef } from "react";

const GOODDOLLAR_OWNERSHIP_CONFLICT_CODE =
  "WALLET_ALREADY_VERIFIED_BY_OTHER_USER";
const GOODDOLLAR_USER_WALLET_LOCKED_CODE = "USER_ALREADY_HAS_VERIFIED_WALLET";

const log = getLogger("hook:use-gooddollar-verification");

export interface VerificationStatus {
  isWhitelisted: boolean;
  isExpired: boolean;
  expiresAt?: Date;
  lastChecked?: Date;
  needsReVerification: boolean;
  reconcileStatus?: "pending" | "ok" | "error";
}

/**
 * Hook to check GoodDollar face verification status
 * Polls on-chain whitelist contract and checks expiry
 *
 * Multi-wallet verification:
 * - Checks ALL linked wallets from Privy for verification status
 * - Returns verified if ANY wallet is whitelisted (per-person verification)
 * - Aligns with GoodDollar's sybil resistance (one person, one verification)
 * - Cache keyed by user ID for consistent status across wallet switches
 */
export function useGoodDollarVerification() {
  const { ready, authenticated } = usePrivy();
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const { sdk } = useIdentitySDK();
  const lastReconciledUserId = useRef<string | null>(null);
  const lastUnverifiedReconciledUserId = useRef<string | null>(null);

  const query = useQuery<VerificationStatus>({
    queryKey: ["gooddollar-verification", user?.id],
    queryFn: async () => {
      if (!ready || !authenticated || !user?.id || !sdk) {
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
          reconcileStatus: undefined,
        };
      }

      try {
        // Extract all linked wallet addresses from user object (client-side)
        const walletAddresses = getWalletAddressesFromUser(user);

        if (walletAddresses.length === 0) {
          log.info("No wallets found for user", { userId: user.id });
          return {
            isWhitelisted: false,
            isExpired: false,
            needsReVerification: false,
            reconcileStatus: undefined,
          };
        }

        log.info("Checking GoodDollar verification across all wallets", {
          userId: user.id,
          walletCount: walletAddresses.length,
          wallets: walletAddresses,
        });

        // Check all wallets in parallel for whitelist status
        const checkResults = await Promise.all(
          walletAddresses.map(async (address) => {
            try {
              const normalizedAddress = address.toLowerCase() as `0x${string}`;
              const { isWhitelisted } = await sdk.getWhitelistedRoot(normalizedAddress);
              return { address: normalizedAddress, isWhitelisted, error: null };
            } catch (error) {
              log.warn("Failed to check whitelist for wallet", { address, error });
              return { address: address.toLowerCase() as `0x${string}`, isWhitelisted: false, error };
            }
          })
        );

        // Find first verified wallet
        const verifiedWallet = checkResults.find((result) => result.isWhitelisted);

        // If no wallet is verified, return not verified
        if (!verifiedWallet) {
          const hasSuccessfulCheck = checkResults.some((result) => !result.error);
          const needsUnverifiedReconciliation =
            lastUnverifiedReconciledUserId.current !== user.id;

          // Heal stale DB state only when we had at least one successful
          // chain check (avoid clearing status during transient RPC failures).
          if (hasSuccessfulCheck && needsUnverifiedReconciliation) {
            try {
              const response = await fetch("/api/gooddollar/verify-callback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "reconcile_unverified" }),
              });
              const data = await response.json();
              if (data?.success) {
                lastUnverifiedReconciledUserId.current = user.id;
              }
            } catch (error) {
              log.warn("Failed unverified reconciliation attempt", {
                userId: user.id,
                error,
              });
            }
          }

          log.info("No verified wallets found", { userId: user.id, checkedCount: walletAddresses.length });
          return {
            isWhitelisted: false,
            isExpired: false,
            needsReVerification: false,
            reconcileStatus: undefined,
          };
        }

        // Wallet is verified - proceed with expiry check and reconciliation
        const normalizedAddress = verifiedWallet.address;
        let expiresAt: Date | undefined;
        let needsReVerification = false;
        let reconcileStatus: "pending" | "ok" | "error" | undefined;

        // Attempt to reconcile DB state when on-chain is verified
        // Track reconciliation per user to handle account switches
        const needsReconciliation = lastReconciledUserId.current !== user.id;

        if (needsReconciliation) {
          reconcileStatus = "pending";
          try {
            const response = await fetch("/api/gooddollar/verify-callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "success",
                wallet: normalizedAddress,
              }),
            });
            const data = await response.json();
            reconcileStatus = data?.success ? "ok" : "error";

            if (
              data?.success === false &&
              (data?.code === GOODDOLLAR_OWNERSHIP_CONFLICT_CODE ||
                data?.code === GOODDOLLAR_USER_WALLET_LOCKED_CODE)
            ) {
              log.warn("Verification wallet ownership conflict", {
                userId: user.id,
                address: normalizedAddress,
                code: data?.code,
                message: data?.message,
              });
              return {
                isWhitelisted: false,
                isExpired: false,
                needsReVerification: false,
                reconcileStatus: "error" as const,
              };
            }

            // Only mark as reconciled if successful
            if (data?.success) {
              lastReconciledUserId.current = user.id;
            }
          } catch (reconcileError) {
            reconcileStatus = "error";
            log.warn("Reconcile attempt failed", {
              address: normalizedAddress,
              error: reconcileError,
            });
          }
        } else {
          // User already reconciled, leave status from previous attempt
          reconcileStatus = "ok";
        }

        // Get expiry data for the verified wallet
        try {
          const expiryData = await sdk.getIdentityExpiryData(normalizedAddress);
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

        log.info("Verification status checked - verified wallet found", {
          verifiedAddress: normalizedAddress,
          totalWallets: walletAddresses.length,
          expiresAt,
          needsReVerification,
        });

        return {
          isWhitelisted: true,
          isExpired: needsReVerification,
          expiresAt,
          lastChecked: new Date(),
          needsReVerification,
          reconcileStatus,
        };
      } catch (error) {
        log.error("Failed to check verification status", {
          userId: user?.id,
          error,
        });
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
          reconcileStatus: undefined,
        };
      }
    },
    enabled: !!user?.id && !!sdk && ready && authenticated,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
    retry: 2,
    retryDelay: (attemptIndex: number) =>
      Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  if (query.data) {
    log.debug("Verification state", {
      userId: user?.id,
      currentConnectedWallet: walletAddress,
      isWhitelisted: query.data.isWhitelisted,
      needsReVerification: query.data.needsReVerification,
      expiresAt: query.data.expiresAt,
      reconcileStatus: query.data.reconcileStatus,
      lastChecked: query.data.lastChecked,
    });
  }

  return query;
}
