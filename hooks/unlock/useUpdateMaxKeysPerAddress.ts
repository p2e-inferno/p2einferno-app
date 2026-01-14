"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  LOCK_CONFIG_ABI,
  ADDITIONAL_LOCK_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { getLockConfigForUpdate } from "@/lib/blockchain/helpers/max-keys-security";
import { getLogger } from "@/lib/utils/logger";
import { getAddress, type Address } from "viem";
import type { OperationState } from "./types";

const log = getLogger("hooks:unlock:update-max-keys-per-address");

export interface UpdateMaxKeysPerAddressParams {
  lockAddress: Address;
}

export interface UpdateMaxKeysPerAddressResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

/**
 * Hook to disable purchases by setting maxNumberOfKeys to 0 for grant-based locks
 * Uses a non-zero maxKeysPerAddress to avoid NULL_VALUE() reverts on some versions
 * Requires the connected wallet to be a lock manager
 */
export const useUpdateMaxKeysPerAddress = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const updateMaxKeysPerAddress = useCallback(
    async (
      params: UpdateMaxKeysPerAddressParams,
    ): Promise<UpdateMaxKeysPerAddressResult> => {
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

        let lockAddress: Address;

        try {
          lockAddress = getAddress(params.lockAddress);
        } catch (addressError) {
          throw new Error("Invalid lock address provided");
        }

        // Check if user is lock manager
        const isLockManager = (await publicClient.readContract({
          address: lockAddress,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "isLockManager",
          args: [userAddress],
        })) as boolean;

        if (!isLockManager) {
          throw new Error(
            "You must be a lock manager to update lock configuration",
          );
        }

        // Get current lock config values and create update params
        log.info("Reading current lock configuration", { lockAddress });
        const [expirationDuration, maxNumberOfKeys, maxKeysPerAddress] =
          await getLockConfigForUpdate(lockAddress, publicClient);

        log.info("Updating lock config to disable purchases", {
          lockAddress,
          expirationDuration: expirationDuration.toString(),
          maxNumberOfKeys: maxNumberOfKeys.toString(), // Will be 0
          maxKeysPerAddress: maxKeysPerAddress.toString(),
        });

        // Estimate gas for updateLockConfig transaction
        const estimatedGas = await publicClient.estimateContractGas({
          address: lockAddress,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateLockConfig",
          args: [expirationDuration, maxNumberOfKeys, maxKeysPerAddress],
          account: walletAccount,
        });

        // Add 20% padding to estimated gas
        const gasWithPadding = (estimatedGas * 120n) / 100n;

        log.info("Gas estimation for updateLockConfig", {
          estimatedGas: estimatedGas.toString(),
          gasWithPadding: gasWithPadding.toString(),
        });

        // Update lock configuration
        const updateTx = await walletClient.writeContract({
          address: lockAddress,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateLockConfig",
          args: [expirationDuration, maxNumberOfKeys, maxKeysPerAddress],
          account: walletAccount,
          chain: walletChain,
          gas: gasWithPadding,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: updateTx,
        });

        // Check if transaction actually succeeded
        if (receipt.status !== "success") {
          throw new Error(`Transaction failed with status: ${receipt.status}`);
        }

        log.info("Lock configuration updated successfully", {
          transactionHash: updateTx,
          lockAddress,
          maxKeysPerAddress: maxKeysPerAddress.toString(),
          blockNumber: receipt.blockNumber.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: updateTx,
        };
      } catch (error: any) {
        const errorMsg =
          error.message || "Failed to update lock configuration";
        log.error("Update lock config error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet],
  );

  return {
    updateMaxKeysPerAddress,
    ...state,
  };
};
