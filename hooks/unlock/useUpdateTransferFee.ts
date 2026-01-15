"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ADDITIONAL_LOCK_ABI, LOCK_CONFIG_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type { OperationState } from "./types";

const log = getLogger("hooks:unlock:update-transfer-fee");

export interface UpdateTransferFeeParams {
  lockAddress: Address;
  transferFeeBasisPoints: bigint; // 10000 => non-transferable
}

export interface UpdateTransferFeeResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Hook to enforce non-transferability by setting transferFeeBasisPoints.
 * Requires the connected wallet to be a lock manager.
 */
export const useUpdateTransferFee = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const updateTransferFee = useCallback(
    async (params: UpdateTransferFeeParams): Promise<UpdateTransferFeeResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        const { walletClient, publicClient } = await createViemFromPrivyWallet(wallet);

        const userAddress = getAddress(wallet.address as Address);
        const walletAccount = walletClient.account ?? userAddress;
        const walletChain = walletClient.chain;

        const lockAddress = getAddress(params.lockAddress);

        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as boolean;

        if (!isLockManager) {
          throw new Error("You must be a lock manager to update transferability");
        }

        log.info("Updating transfer fee", {
          lockAddress,
          transferFeeBasisPoints: params.transferFeeBasisPoints.toString(),
        });

        const estimatedGas = await publicClient.estimateContractGas({
          address: lockAddress,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateTransferFee",
          args: [params.transferFeeBasisPoints],
          account: walletAccount,
        });

        const gasWithPadding = (estimatedGas * 120n) / 100n;

        const tx = await walletClient.writeContract({
          address: lockAddress,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateTransferFee",
          args: [params.transferFeeBasisPoints],
          account: walletAccount,
          chain: walletChain,
          gas: gasWithPadding,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
        if (receipt.status !== "success") {
          throw new Error(`Transaction failed with status: ${receipt.status}`);
        }

        setState({ isLoading: false, error: null, isSuccess: true });
        return { success: true, transactionHash: tx };
      } catch (error: any) {
        const errorMsg = error?.message || "Failed to update transferability";
        log.error("Update transfer fee error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet],
  );

  return {
    updateTransferFee,
    ...state,
  };
};

