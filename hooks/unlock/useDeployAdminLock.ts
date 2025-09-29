"use client";

import { useCallback, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI
} from "@/lib/blockchain/shared/abi-definitions";
import { getClientConfig } from "@/lib/blockchain/config";
import { getLogger } from "@/lib/utils/logger";
import { encodeFunctionData, type Address } from "viem";
import type { AdminLockDeploymentParams, AdminLockDeploymentResult, OperationState } from "./types";

const log = getLogger("hooks:unlock:deploy-admin-lock");

export const useDeployAdminLock = ({ isAdmin }: { isAdmin: boolean }) => {
  const { wallets } = useWallets();
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
        const chainId = await client.getChainId();

        // Get factory address for current chain
        const factoryAddress = UNLOCK_FACTORY_ADDRESSES[chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES];
        if (!factoryAddress) {
          throw new Error(`Unlock factory not available on chain ${chainId}`);
        }

        // Fetch server wallet address from API
        const serverResponse = await fetch('/api/admin/server-wallet');
        if (!serverResponse.ok) {
          throw new Error('Failed to fetch server wallet address');
        }
        const { serverWalletAddress } = await serverResponse.json();

        // Encode initialization data (factory as initial owner)
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            factoryAddress, // Factory as initial lock creator
            params.expirationDuration,
            params.tokenAddress,
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
          args: [serverWalletAddress],
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
        const deployTx = await client.writeContract({
          address: factoryAddress as Address,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14,
            additionalTransactions,
          ],
          chain: config.chain,
          account: userAddress,
        });

        const receipt = await client.waitForTransactionReceipt({
          hash: deployTx
        });

        // Extract lock address from logs
        const newLockLog = receipt.logs.find((log: any) =>
          log.topics[0] === "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7" // NewLock event
        );

        const lockAddress = newLockLog?.topics[2] as Address;

        log.info("Admin lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress,
        };

      } catch (error: any) {
        const errorMsg = error.message || "Admin lock deployment failed";
        log.error("Admin lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallets, isAdmin]
  );

  return {
    deployAdminLock,
    ...state,
  };
};