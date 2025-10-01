"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { extractLockAddressFromReceiptViem } from "@/lib/blockchain/shared/transaction-utils";
import { getLogger } from "@/lib/utils/logger";
import { encodeFunctionData, getAddress, type Address } from "viem";
import type { AdminLockDeploymentParams, AdminLockDeploymentResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:deploy-admin-lock");

export const useDeployAdminLock = ({ isAdmin }: { isAdmin: boolean }) => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const deployAdminLock = useCallback(
    async (params: AdminLockDeploymentParams): Promise<AdminLockDeploymentResult> => {
      // Security check - must be admin
      if (!isAdmin || !params.isAdmin) {
        const error = "Admin access required for admin lock deployment";
        setState(prev => ({ ...prev, error }));
        return { success: false, error };
      }

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

        // Fetch server wallet address from API
        const serverResponse = await fetch("/api/admin/server-wallet", {
          credentials: "include",
        });
        if (!serverResponse.ok) {
          throw new Error('Failed to fetch server wallet address');
        }
        const { serverWalletAddress } = await serverResponse.json();

        let normalizedServerWallet: Address;
        try {
          normalizedServerWallet = getAddress(serverWalletAddress);
        } catch (error) {
          throw new Error('Server wallet address is invalid');
        }

        const tokenAddress = getAddress(params.tokenAddress);

        // Encode initialization data (factory as initial owner)
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            factoryAddress, // Factory as initial lock creator
            params.expirationDuration,
            tokenAddress,
            params.keyPrice,
            params.maxNumberOfKeys,
            params.name,
          ],
        });

        // Prepare additional transactions (manager setup + renounce)
        const addUserManagerTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [userAddress],
        });

        const addServerManagerTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [normalizedServerWallet],
        });

        const renounceFactoryTx = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "renounceLockManager",
          args: [],
        });

        const additionalTransactions = [
          addUserManagerTx,
          addServerManagerTx,
          renounceFactoryTx,
        ];

        // Deploy lock with factory pattern
        const deployTx = await walletClient.writeContract({
          address: factoryAddress,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14,
            additionalTransactions,
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
          throw new Error("Failed to determine deployed lock address");
        }

        log.info("Admin lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress: normalizedServerWallet,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress: normalizedServerWallet,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Admin lock deployment failed";
        log.error("Admin lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet, isAdmin]
  );

  return {
    deployAdminLock,
    ...state,
  };
};
