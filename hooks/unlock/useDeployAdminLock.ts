"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI,
  LOCK_CONFIG_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { extractLockAddressFromReceipt } from "@/lib/blockchain/shared/transaction-utils";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import type {
  DeploymentStep,
  TxResult,
} from "@/lib/transaction-stepper/types";
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
const NON_TRANSFERABLE_FEE_BPS = 10000n;

type ViemClients = Awaited<ReturnType<typeof createViemFromPrivyWallet>>;
type DeploymentContext = {
  params: AdminLockDeploymentParams;
  walletClient: ViemClients["walletClient"];
  publicClient: ViemClients["publicClient"];
  walletAccount: NonNullable<ViemClients["walletClient"]["account"]> | Address;
  walletChain: ViemClients["walletClient"]["chain"];
  userAddress: Address;
  factoryAddress: Address;
  serverWalletAddress: Address;
  deployTx?: `0x${string}`;
  grantTx?: `0x${string}`;
  configTx?: `0x${string}`;
  transferTx?: `0x${string}`;
  lockAddress?: Address;
  grantFailed: boolean;
  grantError?: string;
  configFailed: boolean;
  configError?: string;
  transferConfigFailed: boolean;
  transferConfigError?: string;
};

export const useDeployAdminLock = ({ isAdmin }: { isAdmin: boolean }) => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const { adminFetch } = useAdminApi();

  const prepareDeploymentContext = useCallback(
    async (params: AdminLockDeploymentParams): Promise<DeploymentContext> => {
      if (!isAdmin || !params.isAdmin) {
        throw new Error("Admin access required for admin lock deployment");
      }

      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      const { walletClient, publicClient } =
        await createViemFromPrivyWallet(wallet);

      const userAddress = getAddress(wallet.address as Address);
      const walletAccount: NonNullable<ViemClients["walletClient"]["account"]> | Address =
        walletClient.account ?? userAddress;
      const walletChain = walletClient.chain;
      const chainId = await publicClient.getChainId();

      const factoryAddressValue =
        UNLOCK_FACTORY_ADDRESSES[
          chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES
        ];
      if (!factoryAddressValue) {
        throw new Error(`Unlock factory not available on chain ${chainId}`);
      }
      const factoryAddress = getAddress(factoryAddressValue as Address);

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

      return {
        params,
        walletClient,
        publicClient,
        walletAccount,
        walletChain,
        userAddress,
        factoryAddress,
        serverWalletAddress: normalizedServerWallet,
        grantFailed: false,
        configFailed: false,
        transferConfigFailed: false,
      };
    },
    [adminFetch, isAdmin, wallet],
  );

  const deployLockWithContext = useCallback(
    async (context: DeploymentContext): Promise<TxResult> => {
      const tokenAddress = getAddress(context.params.tokenAddress);

      const initData = encodeFunctionData({
        abi: ADDITIONAL_LOCK_ABI,
        functionName: "initialize",
        args: [
          context.userAddress,
          context.params.expirationDuration,
          tokenAddress,
          context.params.keyPrice,
          context.params.maxNumberOfKeys,
          context.params.name,
        ],
      });

      const deployTx = await context.walletClient.writeContract({
        address: context.factoryAddress,
        abi: UNLOCK_FACTORY_ABI,
        functionName: "createUpgradeableLockAtVersion",
        args: [initData, context.params.lockVersion || 14],
        account: context.walletAccount,
        chain: context.walletChain,
      });

      context.deployTx = deployTx;

      return {
        transactionHash: deployTx,
        transactionUrl: getBlockExplorerUrl(deployTx),
        waitForConfirmation: async () => {
          const receipt = await context.publicClient.waitForTransactionReceipt({
            hash: deployTx,
          });

          const lockAddress = extractLockAddressFromReceipt(
            receipt,
            context.userAddress,
          );

          if (!lockAddress) {
            throw new Error("Failed to determine deployed lock address");
          }

          context.lockAddress = lockAddress as Address;

          log.info("Admin lock deployment successful", {
            transactionHash: deployTx,
            lockAddress,
            serverWalletAddress: context.serverWalletAddress,
            name: context.params.name,
          });

          return {
            transactionHash: deployTx,
            transactionUrl: getBlockExplorerUrl(deployTx),
            receipt,
            data: { lockAddress },
          };
        },
      };
    },
    [],
  );

  const grantManagerWithContext = useCallback(
    async (context: DeploymentContext): Promise<TxResult> => {
      if (!context.lockAddress) {
        throw new Error("Lock address missing for grant step");
      }

      const estimatedGas = await context.publicClient.estimateContractGas({
        address: context.lockAddress as Address,
        abi: ADDITIONAL_LOCK_ABI,
        functionName: "addLockManager",
        args: [context.serverWalletAddress],
        account: context.walletAccount,
      });

      const gasWithPadding = (estimatedGas * 120n) / 100n;

      log.info("Gas estimation for addLockManager", {
        estimatedGas: estimatedGas.toString(),
        gasWithPadding: gasWithPadding.toString(),
      });

      try {
        const grantTx = await context.walletClient.writeContract({
          address: context.lockAddress as Address,
          abi: ADDITIONAL_LOCK_ABI,
          functionName: "addLockManager",
          args: [context.serverWalletAddress],
          account: context.walletAccount,
          chain: context.walletChain,
          gas: gasWithPadding,
        });

        context.grantTx = grantTx;

        return {
          transactionHash: grantTx,
          transactionUrl: getBlockExplorerUrl(grantTx),
          waitForConfirmation: async () => {
            await context.publicClient.waitForTransactionReceipt({
              hash: grantTx,
            });

            log.info("Server wallet granted lock manager role", {
              grantTransactionHash: grantTx,
              lockAddress: context.lockAddress,
              serverWalletAddress: context.serverWalletAddress,
            });

            context.grantFailed = false;

            return {
              transactionHash: grantTx,
              transactionUrl: getBlockExplorerUrl(grantTx),
            };
          },
        };
      } catch (grantErr: any) {
        context.grantFailed = true;
        context.grantError = truncateErrorMessage(
          grantErr.message || "Failed to grant lock manager role",
          150,
        );
        log.error(
          "Grant lock manager failed - lock deployed but grant failed",
          {
            error: grantErr,
            lockAddress: context.lockAddress,
            serverWalletAddress: context.serverWalletAddress,
          },
        );
        try {
          const message: string = String(grantErr?.message || "");
          log.warn("Grant failure diagnostics", {
            includesUserRejected: /user rejected|User rejected|denied/i.test(
              message,
            ),
            includesGas:
              /gas|fee|EIP-1559|intrinsic|underpriced/i.test(message),
            short: context.grantError,
          });
        } catch {}

        const error = new Error(
          context.grantError || "Failed to grant lock manager role",
        );
        (error as any).data = {
          grantFailed: true,
          grantError: context.grantError,
        };
        throw error;
      }
    },
    [],
  );

  const updateLockConfigWithContext = useCallback(
    async (context: DeploymentContext): Promise<TxResult | null> => {
      if (context.params.maxKeysPerAddress === undefined) {
        context.configFailed = false;
        return null;
      }

      if (!context.lockAddress) {
        throw new Error("Lock address missing for config step");
      }

      try {
        log.info("Updating lock config to set maxKeysPerAddress", {
          lockAddress: context.lockAddress,
          maxKeysPerAddress: context.params.maxKeysPerAddress.toString(),
          expirationDuration: context.params.expirationDuration.toString(),
          maxNumberOfKeys: context.params.maxNumberOfKeys.toString(),
        });

        const configEstimatedGas =
          await context.publicClient.estimateContractGas({
            address: context.lockAddress as Address,
            abi: LOCK_CONFIG_ABI,
            functionName: "updateLockConfig",
            args: [
              context.params.expirationDuration,
              context.params.maxNumberOfKeys,
              context.params.maxKeysPerAddress,
            ],
            account: context.walletAccount,
          });

        const configGasWithPadding = (configEstimatedGas * 120n) / 100n;

        log.info("Gas estimation for updateLockConfig", {
          estimatedGas: configEstimatedGas.toString(),
          gasWithPadding: configGasWithPadding.toString(),
        });

        const configTx = await context.walletClient.writeContract({
          address: context.lockAddress as Address,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateLockConfig",
          args: [
            context.params.expirationDuration,
            context.params.maxNumberOfKeys,
            context.params.maxKeysPerAddress,
          ],
          account: context.walletAccount,
          chain: context.walletChain,
          gas: configGasWithPadding,
        });

        context.configTx = configTx;

        return {
          transactionHash: configTx,
          transactionUrl: getBlockExplorerUrl(configTx),
          waitForConfirmation: async () => {
            await context.publicClient.waitForTransactionReceipt({
              hash: configTx,
            });

            log.info("Lock configuration updated successfully", {
              configTransactionHash: configTx,
              lockAddress: context.lockAddress,
              maxKeysPerAddress: context.params.maxKeysPerAddress!.toString(),
            });

            context.configFailed = false;

            return {
              transactionHash: configTx,
              transactionUrl: getBlockExplorerUrl(configTx),
            };
          },
        };
      } catch (configErr: any) {
        context.configFailed = true;
        context.configError = truncateErrorMessage(
          configErr.message || "Failed to update lock configuration",
          150,
        );
        log.error(
          "Update lock config failed - lock deployed but config update failed",
          {
            error: configErr,
            lockAddress: context.lockAddress,
            maxKeysPerAddress: context.params.maxKeysPerAddress?.toString(),
          },
        );
        try {
          const message: string = String(configErr?.message || "");
          log.warn("Config update failure diagnostics", {
            includesUserRejected:
              /user rejected|User rejected|denied/i.test(message),
            includesGas: /gas|fee|EIP-1559|intrinsic|underpriced/i.test(
              message,
            ),
            short: context.configError,
          });
        } catch {}

        const error = new Error(
          context.configError || "Failed to update lock configuration",
        );
        (error as any).data = {
          configFailed: true,
          configError: context.configError,
        };
        throw error;
      }
    },
    [],
  );

  const updateTransferFeeWithContext = useCallback(
    async (context: DeploymentContext): Promise<TxResult> => {
      if (!context.lockAddress) {
        throw new Error("Lock address missing for transfer step");
      }

      try {
        log.info("Updating lock transfer fee to enforce non-transferability", {
          lockAddress: context.lockAddress,
          transferFeeBasisPoints: NON_TRANSFERABLE_FEE_BPS.toString(),
        });

        const estimatedGas = await context.publicClient.estimateContractGas({
          address: context.lockAddress as Address,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateTransferFee",
          args: [NON_TRANSFERABLE_FEE_BPS],
          account: context.walletAccount,
        });

        const gasWithPadding = (estimatedGas * 120n) / 100n;

        const transferTx = await context.walletClient.writeContract({
          address: context.lockAddress as Address,
          abi: LOCK_CONFIG_ABI,
          functionName: "updateTransferFee",
          args: [NON_TRANSFERABLE_FEE_BPS],
          account: context.walletAccount,
          chain: context.walletChain,
          gas: gasWithPadding,
        });

        context.transferTx = transferTx;

        return {
          transactionHash: transferTx,
          transactionUrl: getBlockExplorerUrl(transferTx),
          waitForConfirmation: async () => {
            await context.publicClient.waitForTransactionReceipt({
              hash: transferTx,
            });

            log.info("Transfer fee updated successfully", {
              transferTransactionHash: transferTx,
              lockAddress: context.lockAddress,
            });

            context.transferConfigFailed = false;

            return {
              transactionHash: transferTx,
              transactionUrl: getBlockExplorerUrl(transferTx),
            };
          },
        };
      } catch (transferErr: any) {
        context.transferConfigFailed = true;
        context.transferConfigError = truncateErrorMessage(
          transferErr.message || "Failed to update transfer fee",
          150,
        );
        log.error(
          "Update transfer fee failed - lock deployed but transferability update failed",
          {
            error: transferErr,
            lockAddress: context.lockAddress,
          },
        );

        const error = new Error(
          context.transferConfigError || "Failed to update transfer fee",
        );
        (error as any).data = {
          transferConfigFailed: true,
          transferConfigError: context.transferConfigError,
        };
        throw error;
      }
    },
    [],
  );

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

      try {
        setState({ isLoading: true, error: null, isSuccess: false });

        const context = await prepareDeploymentContext(params);

        await deployLockWithContext(context);
        try {
          await grantManagerWithContext(context);
        } catch {}
        try {
          await updateLockConfigWithContext(context);
        } catch {}
        try {
          await updateTransferFeeWithContext(context);
        } catch {}

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          transactionHash: context.deployTx,
          grantTransactionHash: context.grantTx,
          configTransactionHash: context.configTx,
          transferConfigTransactionHash: context.transferTx,
          lockAddress: context.lockAddress,
          serverWalletAddress: context.serverWalletAddress,
          grantFailed: context.grantFailed,
          grantError: context.grantError,
          configFailed: context.configFailed,
          configError: context.configError,
          transferConfigFailed: context.transferConfigFailed,
          transferConfigError: context.transferConfigError,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Admin lock deployment failed";
        log.error("Admin lock deployment error", { error, params });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [
      deployLockWithContext,
      grantManagerWithContext,
      isAdmin,
      prepareDeploymentContext,
      updateLockConfigWithContext,
      updateTransferFeeWithContext,
      wallet,
    ],
  );

  return {
    createAdminLockDeploymentSteps: (params: AdminLockDeploymentParams) => {
      let context: DeploymentContext | null = null;
      let contextError: string | undefined;

      const ensureContext = async () => {
        if (context) return context;
        try {
          context = await prepareDeploymentContext(params);
          return context;
        } catch (error: any) {
          contextError = error?.message || "Failed to prepare deployment";
          throw error;
        }
      };

      const steps: DeploymentStep[] = [
        {
          id: "admin:deploy_lock",
          title: "Deploy lock",
          description: "Deploy the lock contract on-chain.",
          execute: async () => {
            const ctx = await ensureContext();
            return deployLockWithContext(ctx);
          },
        },
        {
          id: "admin:grant_manager",
          title: "Grant server wallet",
          description: "Grant the server wallet lock manager permissions.",
          canSkipOnError: true,
          skipLabel: "Skip grant",
          execute: async () => {
            const ctx = await ensureContext();
            return grantManagerWithContext(ctx);
          },
        },
      ];

      if (params.maxKeysPerAddress !== undefined) {
        steps.push({
          id: "admin:update_lock_config",
          title: "Configure lock limits",
          description: "Apply lock configuration limits.",
          canSkipOnError: true,
          skipLabel: "Skip config",
          execute: async () => {
            const ctx = await ensureContext();
            const result = await updateLockConfigWithContext(ctx);
            return (
              result ?? {
                data: { configSkipped: true },
              }
            );
          },
        });
      }

      steps.push({
        id: "admin:lock_transfer_fee",
        title: "Disable transfers",
        description: "Enforce non-transferable keys.",
        canSkipOnError: true,
        skipLabel: "Skip transfer lock",
        execute: async () => {
          const ctx = await ensureContext();
          return updateTransferFeeWithContext(ctx);
        },
      });

      return {
        steps,
        getResult: (): AdminLockDeploymentResult => {
          const hasEssentialData =
            !!context && !!context.lockAddress && !!context.deployTx;
          const hasStepFailures =
            context?.grantFailed ||
            context?.configFailed ||
            context?.transferConfigFailed;
          const success =
            hasEssentialData && !hasStepFailures && !contextError;

          const base: AdminLockDeploymentResult = {
            success,
            transactionHash: context?.deployTx,
            grantTransactionHash: context?.grantTx,
            configTransactionHash: context?.configTx,
            transferConfigTransactionHash: context?.transferTx,
            lockAddress: context?.lockAddress,
            serverWalletAddress: context?.serverWalletAddress,
            grantFailed: context?.grantFailed,
            grantError: context?.grantError,
            configFailed: context?.configFailed,
            configError: context?.configError,
            transferConfigFailed: context?.transferConfigFailed,
            transferConfigError: context?.transferConfigError,
          };

          if (!success) {
            return {
              ...base,
              success: false,
              error:
                contextError ||
                base.grantError ||
                base.configError ||
                base.transferConfigError ||
                "Admin lock deployment failed",
            };
          }

          return base;
        },
      };
    },
    deployAdminLock,
    ...state,
  };
};
