/**
 * Hook: useXpRenewal
 * Manages XP-based renewal flow with state management
 */

"use client";

import React, { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getLogger } from "@/lib/utils/logger";
import toast from "react-hot-toast";
import { isEASEnabled } from "@/lib/attestation/core/config";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const log = getLogger("hook:useXpRenewal");

export interface XpRenewalState {
  isLoading: boolean;
  step: "quote" | "confirming" | "complete";
  quote?: {
    baseCost: number;
    serviceFee: number;
    total: number;
    canAfford: boolean;
    userBalance: number;
  };
  error?: string;
  newExpiration?: Date;
  renewalAttemptId?: string;
  transactionHash?: string;
}

export const useXpRenewal = () => {
  const queryClient = useQueryClient();
  const selectedWallet = useSmartWalletSelection();
  const { signAttestation } = useGaslessAttestation();
  const [state, setState] = useState<XpRenewalState>({
    isLoading: false,
    step: "quote",
  });

  /**
   * Fetch quote for specific duration
   */
  const getQuote = useCallback(async (duration: 30 | 90 | 365) => {
    setState((s) => ({ ...s, isLoading: true, error: undefined }));

    try {
      const res = await fetch(
        `/api/subscriptions/xp-renewal-quote?duration=${duration}`,
      );
      const data = await res.json();

      // DEBUG: Log raw API response
      log.info("DEBUG: Raw API response", { data });

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch quote");
      }

      log.info("DEBUG: Quote data parsed", {
        duration,
        baseCost: data.data.baseCost,
        serviceFee: data.data.serviceFee,
        totalCost: data.data.totalCost,
        userXpBalance: data.data.userXpBalance,
        canAfford: data.data.canAfford,
      });

      setState((s) => ({
        ...s,
        isLoading: false,
        quote: {
          baseCost: data.data.baseCost,
          serviceFee: data.data.serviceFee,
          total: data.data.totalCost,
          canAfford: data.data.canAfford,
          userBalance: data.data.userXpBalance,
        },
        step: "confirming",
      }));
    } catch (error: any) {
      const errorMsg = error.message || "Failed to get quote";
      log.error("Quote fetch failed", { error, duration });
      setState((s) => ({
        ...s,
        isLoading: false,
        error: errorMsg,
      }));
      toast.error(errorMsg);
    }
  }, []);

  /**
   * Execute renewal with XP
   */
  const executeRenewal = useCallback(
    async (duration: 30 | 90 | 365) => {
      setState((s) => ({ ...s, isLoading: true, error: undefined }));

      try {
        const res = await fetch("/api/subscriptions/renew-with-xp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duration }),
        });

        const data = await res.json();

        if (!data.success) {
          // Check if recoverable
          if (data.recovery) {
            log.warn("Renewal failed with recovery info", {
              error: data.error,
              recovery: data.recovery,
            });

            setState((s) => ({
              ...s,
              isLoading: false,
              error: data.error,
              renewalAttemptId: data.recovery.renewalAttemptId,
            }));

            toast.error(data.error);
          } else {
            throw new Error(data.error || "Renewal failed");
          }
          return;
        }

        let proofCancelled = false;
        let attestationScanUrl: string | null | undefined = null;

        if (isEASEnabled() && data?.data?.attestationRequired) {
          if (!selectedWallet?.address) {
            throw new Error("Wallet not connected");
          }
          const userAddress = selectedWallet.address;

          const payload = data?.data?.attestationPayload;
          const renewalAttemptId = data?.data?.renewalAttemptId;

          if (payload && renewalAttemptId) {
            try {
              const signature = await signAttestation({
                schemaKey: "xp_renewal",
                recipient: userAddress,
                schemaData: [
                  { name: "userAddress", type: "address", value: userAddress },
                  {
                    name: "subscriptionLockAddress",
                    type: "address",
                    value: payload.subscriptionLockAddress,
                  },
                  {
                    name: "amountXp",
                    type: "uint256",
                    value: BigInt(payload.amountXp ?? 0),
                  },
                  {
                    name: "serviceFeeXp",
                    type: "uint256",
                    value: BigInt(payload.serviceFeeXp ?? 0),
                  },
                  {
                    name: "durationDays",
                    type: "uint256",
                    value: BigInt(payload.durationDays ?? duration),
                  },
                  {
                    name: "newExpirationTimestamp",
                    type: "uint256",
                    value: BigInt(payload.newExpirationTimestamp ?? 0),
                  },
                  {
                    name: "renewalTxHash",
                    type: "bytes32",
                    value:
                      payload.renewalTxHash ||
                      "0x0000000000000000000000000000000000000000000000000000000000000000",
                  },
                ],
              });

              const commitRes = await fetch(
                "/api/subscriptions/commit-renewal-attestation",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    renewalAttemptId,
                    attestationSignature: signature,
                  }),
                },
              );
              const commitJson = await commitRes.json().catch(() => ({}));
              attestationScanUrl = commitJson?.attestationScanUrl || null;
            } catch (err: any) {
              const code = err?.code ?? err?.error?.code;
              const name = (err?.name || "").toString().toLowerCase();
              const msg = (err?.message || "").toString().toLowerCase();
              const userRejected =
                code === 4001 ||
                code === "ACTION_REJECTED" ||
                name.includes("userrejected") ||
                msg.includes("user rejected") ||
                msg.includes("rejected") ||
                msg.includes("denied") ||
                msg.includes("cancel") ||
                msg.includes("canceled") ||
                msg.includes("cancelled");

              if (userRejected) {
                proofCancelled = true;
              } else {
                throw err;
              }
            }
          }
        }

        // Success
        log.info("Renewal successful", {
          newExpiration: data.data.newExpiration,
          txHash: data.data.transactionHash,
        });

        const newDate = new Date(data.data.newExpiration);
        setState((s) => ({
          ...s,
          isLoading: false,
          step: "complete",
          newExpiration: newDate,
          transactionHash: data.data.transactionHash,
          renewalAttemptId: undefined, // Clear recovery info
        }));

        toast.success(
          React.createElement(
            "div",
            { className: "text-sm leading-relaxed" },
            "Subscription renewed successfully!",
            proofCancelled
              ? React.createElement(
                  "div",
                  { className: "text-xs mt-1 text-gray-300" },
                  "Renewal proof cancelled — renewal completed.",
                )
              : null,
            attestationScanUrl
              ? React.createElement(
                  "div",
                  { className: "text-xs mt-1 break-all" },
                  React.createElement(
                    "a",
                    {
                      href: attestationScanUrl,
                      target: "_blank",
                      rel: "noreferrer",
                      className: "text-cyan-500 underline",
                    },
                    "View attestation on EAS Scan",
                  ),
                )
              : null,
          ),
        );

        // Invalidate related queries
        await queryClient.invalidateQueries({
          queryKey: ["renewal-status"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["user-profile"],
        });
      } catch (error: any) {
        const errorMsg = error.message || "Renewal failed";
        log.error("Renewal execution failed", { error, duration });
        setState((s) => ({
          ...s,
          isLoading: false,
          error: errorMsg,
        }));
        toast.error(errorMsg);
      }
    },
    [queryClient, selectedWallet, signAttestation],
  );

  /**
   * Retry failed renewal
   */
  const retry = useCallback(
    async (duration: 30 | 90 | 365) => {
      log.info("Retrying renewal", { duration });
      await executeRenewal(duration);
    },
    [executeRenewal],
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      step: "quote",
      error: undefined,
      quote: undefined,
      newExpiration: undefined,
      renewalAttemptId: undefined,
      transactionHash: undefined,
    });
  }, []);

  return {
    ...state,
    getQuote,
    executeRenewal,
    retry,
    reset,
  };
};
