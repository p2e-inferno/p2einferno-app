"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, zeroAddress, type Address } from "viem";
import type {
  RenewMembershipParams,
  RenewMembershipResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:renew-membership");

/**
 * Hook to renew a membership for a specific tokenId
 * This is different from extend as it uses the lock's renewal mechanism
 */
export const useRenewMembershipFor = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const renewMembership = useCallback(
    async (params: RenewMembershipParams): Promise<RenewMembershipResult> => {
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

        // Optional: Check if renewable first
        const isRenewable = (await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isRenewable",
          args: [params.tokenId, referrer],
        })) as unknown as boolean;

        if (!isRenewable) {
          throw new Error("This key cannot be renewed");
        }

        // Renew membership
        const renewTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "renewMembershipFor",
          args: [params.tokenId, referrer],
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: renewTx,
        });

        log.info("Membership renewed successfully", {
          transactionHash: renewTx,
          lockAddress,
          tokenId: params.tokenId.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: renewTx,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Failed to renew membership";
        log.error("Renew membership error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet]
  );

  return {
    renewMembership,
    ...state,
  };
};
