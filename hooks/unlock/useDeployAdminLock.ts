"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { extractLockAddressFromReceipt } from "@/lib/blockchain/shared/transaction-utils";
import { getLogger } from "@/lib/utils/logger";
import { truncateErrorMessage } from "@/lib/utils/toast-utils";
import { encodeFunctionData, getAddress, type Address } from "viem";
import type {
  AdminLockDeploymentParams,
  AdminLockDeploymentResult,
  OperationState,
} from "./types";
import { useAdminApi } from "@/hooks/useAdminApi";

const log = getLogger("hooks:unlock:deploy-admin-lock");

export const useDeployAdminLock = ({ isAdmin }: { isAdmin: boolean }) => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const { adminFetch } = useAdminApi();

  const deployAdminLock = useCallback(
    async (
      params: AdminLockDeploymentParams,
    ): Promise<AdminLockDeploymentResult> => {
      // Security check - must be admin
      if (!isAdmin || !params.isAdmin) {
        const error = "Admin access required for admin lock deployment";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        // Fresh viem clients per operation
        const { walletClient, publicClient } =
          await createViemFromPrivyWallet(wallet);

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
        const serverResponse = await adminFetch<{
          serverWalletAddress: string;
        }>("/api/admin/server-wallet");
        if (serverResponse.error || !serverResponse.data?.serverWalletAddress) {
          throw new Error(
            serverResponse.error || "Failed to fetch server wallet address",
          );
        }
        const { serverWalletAddress } = serverResponse.data;

        let normalizedServerWallet: Address;
        try {
          normalizedServerWallet = getAddress(serverWalletAddress);
        } catch (error) {
          throw new Error("Server wallet address is invalid");
        }

        const tokenAddress = getAddress(params.tokenAddress);

        // Encode initialization data (factory as initial owner)
        const initData = encodeFunctionData({
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "initialize",
          args: [
            userAddress, // Factory as initial lock creator
            params.expirationDuration,
            tokenAddress,
            params.keyPrice,
            params.maxNumberOfKeys,
            params.name,
          ],
        });

        // Deploy lock
        const deployTx = await walletClient.writeContract({
          address: factoryAddress,
          abi: UNLOCK_FACTORY_ABI,
          functionName: "createUpgradeableLockAtVersion",
          args: [initData, params.lockVersion || 14],
          account: walletAccount,
          chain: walletChain,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: deployTx,
        });

        const lockAddress = extractLockAddressFromReceipt(receipt, userAddress);

        if (!lockAddress) {
          throw new Error("Failed to determine deployed lock address");
        }

        log.info("Admin lock deployment successful", {
          transactionHash: deployTx,
          lockAddress,
          serverWalletAddress: normalizedServerWallet,
          name: params.name,
        });

        // Estimate gas for addLockManager transaction
        const estimatedGas = await publicClient.estimateContractGas({
          address: lockAddress as Address,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [normalizedServerWallet],
          account: walletAccount,
        });

        // Add 20% padding to estimated gas
        const gasWithPadding = (estimatedGas * 120n) / 100n;

        log.info("Gas estimation for addLockManager", {
          estimatedGas: estimatedGas.toString(),
          gasWithPadding: gasWithPadding.toString(),
        });

        // grant server wallet manager role
        let grantTx: `0x${string}` | undefined;
        let grantFailed = false;
        let grantError: string | undefined;

        try {
          grantTx = await walletClient.writeContract({
            address: lockAddress as Address,
            abi: ADDITIONAL_LOCK_ABI,
            functionName: "addLockManager",
            args: [normalizedServerWallet],
            account: walletAccount,
            chain: walletChain,
            gas: gasWithPadding,
          });

          await publicClient.waitForTransactionReceipt({
            hash: grantTx,
          });

          log.info("Server wallet granted lock manager role", {
            grantTransactionHash: grantTx,
            lockAddress,
            serverWalletAddress: normalizedServerWallet,
          });
        } catch (grantErr: any) {
          grantFailed = true;
          grantError = truncateErrorMessage(
            grantErr.message || "Failed to grant lock manager role",
            150
          );
          log.error("Grant lock manager failed - lock deployed but grant failed", {
            error: grantErr,
            lockAddress,
            serverWalletAddress: normalizedServerWallet,
          });
          // Extra diagnostic logging for common user-decline and gas issues
          try {
            const message: string = String(grantErr?.message || '');
            log.warn('Grant failure diagnostics', {
              includesUserRejected: /user rejected|User rejected|denied/i.test(message),
              includesGas: /gas|fee|EIP-1559|intrinsic|underpriced/i.test(message),
              short: grantError,
            });
          } catch {}
        }

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: deployTx,
          grantTransactionHash: grantTx,
          lockAddress: lockAddress as Address,
          serverWalletAddress: normalizedServerWallet,
          grantFailed,
          grantError,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Admin lock deployment failed";
        log.error("Admin lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet, isAdmin, adminFetch],
  );

  return {
    deployAdminLock,
    ...state,
  };
};
