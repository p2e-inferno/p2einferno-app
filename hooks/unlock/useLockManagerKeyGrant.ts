"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address, type Hex } from "viem";
import type { KeyGrantParams, KeyGrantResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:key-grant");

export const useLockManagerKeyGrant = () => {
  const { wallets } = useWallets();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const grantKey = useCallback(
    async (params: KeyGrantParams): Promise<KeyGrantResult> => {
      const wallet = wallets[0]; // Use first connected wallet
      if (!wallet) {
        const error = "Wallet not connected";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem clients per operation
        const { walletClient, publicClient } = await createViemFromPrivyWallet(
          wallet,
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

        const recipientAddress = getAddress(params.recipientAddress);
        const keyManagers = params.keyManagers.map((manager) =>
          getAddress(manager),
        );

        // Check if user is lock manager
        const isLockManager = await publicClient.readContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        }) as boolean;

        if (!isLockManager) {
          throw new Error("User is not a lock manager");
        }

        // Grant key using the same purchase function but with special manager privileges
        const grantTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [0n], // values (0 for free grant)
            [recipientAddress], // recipients
            [userAddress], // referrers (lock manager)
            keyManagers, // keyManagers
            ["0x" as Hex], // data
          ],
          value: 0n, // No payment required for manager grants
          account: walletAccount,
          chain: walletChain,
        });

        await publicClient.waitForTransactionReceipt({
          hash: grantTx,
        });

        log.info("Key grant successful", {
          transactionHash: grantTx,
          recipient: recipientAddress,
          lockAddress,
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: grantTx,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Key grant failed";
        log.error("Key grant error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallets]
  );

  return {
    grantKey,
    ...state,
  };
};
