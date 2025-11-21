"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type {
  CancelAndRefundParams,
  CancelAndRefundResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:cancel-and-refund");

/**
 * Hook to cancel a key and receive a refund
 * Should always check refund amount first using getCancelAndRefundValue
 * Refund is based on actual payment amount, not key price
 * Granted keys refund $0 (nothing was paid)
 */
export const useCancelAndRefund = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const cancelAndRefund = useCallback(
    async (params: CancelAndRefundParams): Promise<CancelAndRefundResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Create fresh viem clients
        const { walletClient, publicClient } = await createViemFromPrivyWallet(
          wallet
        );

        const userAddress = getAddress(wallet.address as Address);
        const walletAccount = walletClient.account ?? userAddress;
        const walletChain = walletClient.chain;

        let lockAddress: Address;

        try {
          lockAddress = getAddress(params.lockAddress);
        } catch (addressError) {
          throw new Error("Invalid lock address provided");
        }

        // Optional: Check refund amount first (recommended for security)
        const refundAmount = (await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "getCancelAndRefundValue",
          args: [params.tokenId],
        })) as bigint;

        // Cancel and refund
        const cancelTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "cancelAndRefund",
          args: [params.tokenId],
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: cancelTx,
        });

        log.info("Key cancelled and refunded successfully", {
          transactionHash: cancelTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
          refundAmount: refundAmount.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: cancelTx,
          refundAmount,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to cancel and refund";
        log.error("Cancel and refund error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    cancelAndRefund,
    ...state,
  };
};
