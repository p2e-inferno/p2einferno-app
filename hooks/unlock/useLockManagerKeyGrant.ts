"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getClientConfig } from "@/lib/blockchain/config";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
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
        // Fresh viem client per operation
        const client = await createViemFromPrivyWallet(wallet);
        const config = getClientConfig();

        const userAddress = wallet.address as Address;

        // Check if user is lock manager
        const isLockManager = await client.readContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        }) as boolean;

        if (!isLockManager) {
          throw new Error("User is not a lock manager");
        }

        // Grant key using the same purchase function but with special manager privileges
        const grantTx = await client.writeContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [0n], // values (0 for free grant)
            [params.recipientAddress], // recipients
            [userAddress], // referrers (lock manager)
            params.keyManagers, // keyManagers
            ["0x"], // data
          ],
          value: 0n, // No payment required for manager grants
          chain: config.chain,
          account: userAddress,
        });

        await client.waitForTransactionReceipt({
          hash: grantTx
        });

        log.info("Key grant successful", {
          transactionHash: grantTx,
          recipient: params.recipientAddress,
          lockAddress: params.lockAddress
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