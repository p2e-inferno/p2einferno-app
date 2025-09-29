"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { COMPLETE_LOCK_ABI, ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { extractTokenIdsFromReceipt } from "@/lib/blockchain/shared/transaction-utils";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, zeroAddress, type Address, type Hex } from "viem";
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

        const recipient = params.recipient
          ? getAddress(params.recipient)
          : userAddress;
        const keyManager = params.keyManager
          ? getAddress(params.keyManager)
          : recipient;
        const referrer = params.referrer
          ? getAddress(params.referrer)
          : zeroAddress;
        const data = (params.data || "0x") as Hex;

        // Get key price and token address
        const [keyPrice, tokenAddress] = await Promise.all([
          publicClient.readContract({
            address: lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "keyPrice",
          }) as Promise<bigint>,
          publicClient.readContract({
            address: lockAddress,
            abi: COMPLETE_LOCK_ABI,
            functionName: "tokenAddress",
          }) as Promise<Address>,
        ]);

        // Handle token approval if needed (ERC20)
        const isETH = tokenAddress === zeroAddress;

        if (!isETH) {
          const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [userAddress, lockAddress],
          }) as bigint;

          if (allowance < keyPrice) {
            log.info("Approving token spend", { tokenAddress, keyPrice });
            const approveTx = await walletClient.writeContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [lockAddress, keyPrice],
              account: walletAccount,
              chain: walletChain,
            });
            await publicClient.waitForTransactionReceipt({ hash: approveTx });
          }
        }

        // Purchase key
        const purchaseTx = await walletClient.writeContract({
          address: lockAddress,
          abi: COMPLETE_LOCK_ABI,
          functionName: "purchase",
          args: [
            [keyPrice], // values
            [recipient], // recipients
            [referrer], // referrers
            [keyManager], // keyManagers
            [data], // data
          ],
          value: isETH ? keyPrice : 0n,
          account: walletAccount,
          chain: walletChain,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: purchaseTx,
        });

        const tokenIds = extractTokenIdsFromReceipt(receipt);

        log.info("Key purchase successful", {
          transactionHash: purchaseTx,
          recipient,
          lockAddress,
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: purchaseTx,
          tokenIds,
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
