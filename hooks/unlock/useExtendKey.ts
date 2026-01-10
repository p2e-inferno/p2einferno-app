"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import type { ExtendKeyParams, ExtendKeyResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:extend-key");

/**
 * Hook to extend a key's expiration by paying
 * This is a payable function - requires ETH or ERC20 tokens
 */
export const useExtendKey = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const extendKey = useCallback(
    async (params: ExtendKeyParams): Promise<ExtendKeyResult> => {
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

        const referrer = params.referrer
          ? getAddress(params.referrer)
          : zeroAddress;
        const data = (params.data || "0x") as Hex;

        // Extend key
        const extendTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "extend",
          args: [params.value, params.tokenId, referrer, data],
          value: params.value, // Send ETH value
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: extendTx,
        });

        log.info("Key extended successfully", {
          transactionHash: extendTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
          value: params.value.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: extendTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to extend key";
        log.error("Extend key error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    extendKey,
    ...state,
  };
};
