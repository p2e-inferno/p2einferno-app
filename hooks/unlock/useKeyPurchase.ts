"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI, ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getClientConfig } from "@/lib/blockchain/config";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
import type { KeyPurchaseParams, KeyPurchaseResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:key-purchase");

export const useKeyPurchase = () => {
  const { wallets } = useWallets();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const purchaseKey = useCallback(
    async (params: KeyPurchaseParams): Promise<KeyPurchaseResult> => {
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
        const recipient = params.recipient || userAddress;

        // Get key price and token address
        const [keyPrice, tokenAddress] = await Promise.all([
          client.readContract({
            address: params.lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "keyPrice",
          }) as Promise<bigint>,
          client.readContract({
            address: params.lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "tokenAddress",
          }) as Promise<Address>,
        ]);

        // Handle token approval if needed (ERC20)
        const isETH = tokenAddress === "0x0000000000000000000000000000000000000000";

        if (!isETH) {
          const allowance = await client.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [userAddress, params.lockAddress],
          }) as bigint;

          if (allowance < keyPrice) {
            log.info("Approving token spend", { tokenAddress, keyPrice });
            const approveTx = await client.writeContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [params.lockAddress, keyPrice],
              chain: config.chain,
              account: userAddress,
            });
            await client.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        // Purchase key
        const purchaseTx = await client.writeContract({
          address: params.lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [keyPrice], // values
            [recipient], // recipients
            [params.referrer || "0x0000000000000000000000000000000000000000"], // referrers
            [params.keyManager || recipient], // keyManagers
            [params.data || "0x"], // data
          ],
          value: isETH ? keyPrice : 0n,
          chain: config.chain,
          account: userAddress,
        });

        await client.waitForTransactionReceipt({
          hash: purchaseTx
        });

        log.info("Key purchase successful", {
          transactionHash: purchaseTx,
          recipient,
          lockAddress: params.lockAddress
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: purchaseTx,
          tokenIds: [], // Extract from logs if needed
        };

      } catch (error: any) {
        const errorMsg = error.message || "Key purchase failed";
        log.error("Key purchase error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallets]
  );

  return {
    purchaseKey,
    ...state,
  };
};