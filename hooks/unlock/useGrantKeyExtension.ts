"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type {
  GrantKeyExtensionParams,
  GrantKeyExtensionResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:grant-key-extension");

/**
 * Hook for lock managers to grant key extensions for free
 * Requires the connected wallet to be a lock manager
 * Different from extendKey which requires payment
 */
export const useGrantKeyExtension = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const grantKeyExtension = useCallback(
    async (
      params: GrantKeyExtensionParams
    ): Promise<GrantKeyExtensionResult> => {
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

        // Check if user is lock manager
        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as unknown as boolean;

        if (!isLockManager) {
          throw new Error("You must be a lock manager to grant key extensions");
        }

        // Grant key extension
        const grantTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "grantKeyExtension",
          args: [params.tokenId, params.duration],
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: grantTx,
        });

        log.info("Key extension granted successfully", {
          transactionHash: grantTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
          duration: params.duration.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: grantTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to grant key extension";
        log.error("Grant key extension error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    grantKeyExtension,
    ...state,
  };
};
