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

        // Encode initialization data
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            userAddress, // _lockCreator
            params.expirationDuration, // _expirationDuration
            params.tokenAddress, // _tokenAddress
            params.keyPrice, // _keyPrice
            params.maxNumberOfKeys, // _maxNumberOfKeys
            params.name, // _lockName
          ],
        });

        // Deploy lock
        const deployTx = await client.writeContract({
          address: factoryAddress as Address,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [
            initData,
            params.lockVersion || 14, // Default to latest version
            [], // No additional transactions
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

        log.info("Lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          name: params.name
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          lockAddress,
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