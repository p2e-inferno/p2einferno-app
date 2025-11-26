"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type {
  UpdateRefundPenaltyParams,
  UpdateRefundPenaltyResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:update-refund-penalty");

/**
 * Hook for lock managers to configure refund grace period and penalty
 * Sets the freeTrialLength and refundPenaltyBasisPoints for a lock
 * Requires the connected wallet to be a lock manager
 */
export const useUpdateRefundPenalty = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const updateRefundPenalty = useCallback(
    async (
      params: UpdateRefundPenaltyParams
    ): Promise<UpdateRefundPenaltyResult> => {
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

        // Validate basis points (0-10000 = 0%-100%)
        if (params.refundPenaltyBasisPoints < 0n || params.refundPenaltyBasisPoints > 10000n) {
          throw new Error("Refund penalty basis points must be between 0 and 10000");
        }

        // Check if user is lock manager
        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as unknown as boolean;

        if (!isLockManager) {
          throw new Error("You must be a lock manager to update refund penalty");
        }

        // Update refund penalty
        const updateTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "updateRefundPenalty",
          args: [params.freeTrialLength, params.refundPenaltyBasisPoints],
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: updateTx,
        });

        log.info("Refund penalty updated successfully", {
          transactionHash: updateTx,
          lockAddress,
          freeTrialLength: params.freeTrialLength.toString(),
          refundPenaltyBasisPoints: params.refundPenaltyBasisPoints.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: updateTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to update refund penalty";
        log.error("Update refund penalty error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    updateRefundPenalty,
    ...state,
  };
};
