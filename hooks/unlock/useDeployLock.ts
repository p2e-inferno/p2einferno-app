"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { extractLockAddressFromReceiptViem } from "@/lib/blockchain/shared/transaction-utils";
import { getLogger } from "@/lib/utils/logger";
import { encodeFunctionData, getAddress, type Address } from "viem";
import type { LockDeploymentParams, LockDeploymentResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:deploy-lock");

export const useDeployLock = () => {
  const { wallets } = useWallets();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const deployLock = useCallback(
    async (params: LockDeploymentParams): Promise<LockDeploymentResult> => {
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
        const chainId = await publicClient.getChainId();

        // Get factory address for current chain
        const factoryAddressValue =
          UNLOCK_FACTORY_ADDRESSES[
            chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES
          ];
        if (!factoryAddressValue) {
          throw new Error(`Unlock factory not available on chain ${chainId}`);
        }
        const factoryAddress = getAddress(factoryAddressValue as Address);

        const tokenAddress = getAddress(params.tokenAddress);

        // Encode initialization data
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            userAddress, // _lockCreator
            params.expirationDuration, // _expirationDuration
            tokenAddress, // _tokenAddress
            params.keyPrice, // _keyPrice
            params.maxNumberOfKeys, // _maxNumberOfKeys
            params.name, // _lockName
          ],
        });

        // Deploy lock
        const deployTx = await walletClient.writeContract({
          address: factoryAddress,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14, // Default to latest version
            [], // No additional transactions
          ],
          account: walletAccount,
          chain: walletChain,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: deployTx,
        });

        const lockAddress = extractLockAddressFromReceiptViem(
          receipt,
          userAddress,
        );

        if (!lockAddress) {
          log.warn("Failed to determine deployed lock address");
        }

        log.info("Lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress: lockAddress!,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Lock deployment failed";
        log.error("Lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallets]
  );

  return {
    deployLock,
    ...state,
  };
};
