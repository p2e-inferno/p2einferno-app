"use client";

import { useCallback, useState } from "react";
import { usePrivyWriteWallet } from "./usePrivyWriteWallet";
import { createEthersFromPrivyWallet } from "@/lib/blockchain/shared/client-utils";
import {
  UNLOCK_FACTORY_ABI,
  UNLOCK_FACTORY_ADDRESSES,
  ADDITIONAL_LOCK_ABI,
} from "@/lib/blockchain/shared/abi-definitions";
import { ethers } from "ethers";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";
import type {
  LockDeploymentParams,
  LockDeploymentResult,
  OperationState,
} from "./types";

const log = getLogger("hooks:unlock:deploy-lock-ethers");

/**
 * TEST HOOK: Ethers version of lock deployment for debugging
 * This is a diagnostic tool to compare viem vs ethers behavior
 */
export const useDeployLockEthers = () => {
  const wallet = usePrivyWriteWallet();
  const [state, setState] = useState<OperationState>({
    isLoading: false,
    error: null,
    isSuccess: false,
  });

  const deployLock = useCallback(
    async (params: LockDeploymentParams): Promise<LockDeploymentResult> => {
      if (!wallet) {
        const error = "Wallet not connected";
        setState((prev) => ({ ...prev, error }));
        return { success: false, error };
      }

      setState({ isLoading: true, error: null, isSuccess: false });

      try {
        log.info("🔧 [ETHERS TEST] Starting lock deployment", {
          params,
          walletAddress: wallet.address,
        });

        // Create ethers provider and signer
        const { provider, signer } = await createEthersFromPrivyWallet(wallet);

        if (!signer) {
          throw new Error("No signer available from ethers client");
        }

        const userAddress = await signer.getAddress();
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);

        log.info("🔧 [ETHERS TEST] Ethers client created", {
          userAddress,
          chainId,
          networkName: network.name,
        });

        // Get factory address for current chain
        const factoryAddress =
          UNLOCK_FACTORY_ADDRESSES[
            chainId as keyof typeof UNLOCK_FACTORY_ADDRESSES
          ];
        if (!factoryAddress) {
          throw new Error(`Unlock factory not deployed on chain ${chainId}`);
        }

        log.info("🔧 [ETHERS TEST] Using factory", {
          factoryAddress,
          chainId,
        });

        // Create factory contract instance
        const factory = new ethers.Contract(
          factoryAddress,
          UNLOCK_FACTORY_ABI,
          signer,
        );

        const publicLockAddressFn = factory[
          "publicLockAddress"
        ] as (() => Promise<string>) | undefined;
        const publicLockVersionsFn = factory[
          "publicLockVersions"
        ] as ((version: number) => Promise<string>) | undefined;
        const createUpgradeableLockAtVersion = factory[
          "createUpgradeableLockAtVersion"
        ] as ( (initData: string, lockVersion: number, txs: string[]) => Promise<ethers.ContractTransactionResponse> ) & {
          estimateGas: (
            initData: string,
            lockVersion: number,
            txs: string[],
          ) => Promise<bigint>;
        } | undefined;

        if (!createUpgradeableLockAtVersion) {
          throw new Error(
            "Factory contract missing createUpgradeableLockAtVersion method",
          );
        }

        log.info("🔧 [ETHERS TEST] Factory contract created", {
          hasCreateMethod:
            typeof factory.createUpgradeableLockAtVersion === "function",
        });

        // PRE-FLIGHT CHECKS
        try {
          // Check user balance
          const balance = await provider.getBalance(userAddress);
          log.info("🔧 [ETHERS TEST] Wallet balance check", {
            balance: ethers.formatEther(balance),
            hasBalance: balance > 0n,
          });

          // Check if lock version exists
          try {
            if (!publicLockAddressFn) {
              throw new Error("publicLockAddress method unavailable on factory");
            }
            const publicLockAddress = await publicLockAddressFn();
            log.info("🔧 [ETHERS TEST] Factory public lock template", {
              publicLockAddress,
            });
          } catch (e: any) {
            log.warn("🔧 [ETHERS TEST] Could not get public lock address", {
              error: e.message,
            });
          }

          // Try to get lock version info
          try {
            if (!publicLockVersionsFn) {
              throw new Error("publicLockVersions method unavailable on factory");
            }
            const versionInfo = await publicLockVersionsFn(
              params.lockVersion || 14,
            );
            log.info("🔧 [ETHERS TEST] Lock version check", {
              requestedVersion: params.lockVersion || 14,
              versionExists: versionInfo !== ethers.ZeroAddress,
              templateAddress: versionInfo,
            });

            if (versionInfo === ethers.ZeroAddress) {
              log.error("🔧 [ETHERS TEST] ❌ Lock version does not exist!", {
                requestedVersion: params.lockVersion || 14,
                factoryAddress,
                chainId,
              });
              throw new Error(
                `Lock version ${params.lockVersion || 14} does not exist on this factory`,
              );
            }
          } catch (e: any) {
            log.error("🔧 [ETHERS TEST] Version check failed", {
              error: e.message,
              code: e.code,
            });
            // Continue anyway for more diagnostics
          }
        } catch (diagError: any) {
          log.warn("🔧 [ETHERS TEST] Pre-flight diagnostics warning", {
            error: diagError.message,
          });
        }

        // Encode lock initialization data
        const lockInterface = new ethers.Interface(ADDITIONAL_LOCK_ABI);
        const initData = lockInterface.encodeFunctionData("initialize", [
          userAddress, // _lockCreator (becomes owner)
          params.expirationDuration, // _expirationDuration
          params.tokenAddress, // _tokenAddress
          params.keyPrice, // _keyPrice
          params.maxNumberOfKeys, // _maxNumberOfKeys
          params.name, // _lockName
        ]);

        log.info("🔧 [ETHERS TEST] Encoded initialization data", {
          initDataLength: initData.length,
          initDataPreview: initData.substring(0, 66),
          params: {
            lockCreator: userAddress,
            expirationDuration: params.expirationDuration.toString(),
            tokenAddress: params.tokenAddress,
            keyPrice: params.keyPrice.toString(),
            maxNumberOfKeys: params.maxNumberOfKeys.toString(),
            name: params.name,
          },
        });

        // Deploy lock (simple user deployment - no additional transactions)
        log.info("🔧 [ETHERS TEST] Calling createUpgradeableLockAtVersion", {
          lockVersion: params.lockVersion || 14,
          additionalTxCount: 0,
          initDataLength: initData.length,
        });

        let tx;
        try {
          // Try to estimate gas first for better error messages
          const gasEstimate = await createUpgradeableLockAtVersion.estimateGas(
            initData,
            params.lockVersion || 14,
            [],
          );
          log.info("🔧 [ETHERS TEST] Gas estimation successful", {
            gasEstimate: gasEstimate.toString(),
          });
        } catch (gasError: any) {
          log.error(
            "🔧 [ETHERS TEST] ❌ Gas estimation failed - transaction will fail!",
            {
              error: gasError.message,
              reason: gasError.reason,
              code: gasError.code,
              data: gasError.data,
              transaction: gasError.transaction,
            },
          );
          // Re-throw with more context
          throw new Error(
            `Gas estimation failed: ${gasError.reason || gasError.message}. This usually means a require() is failing in the contract.`,
          );
        }

        tx = await createUpgradeableLockAtVersion(
          initData,
          params.lockVersion || 14, // Default to latest version
          [], // No additional transactions for user deployment
        );

        log.info("🔧 [ETHERS TEST] Transaction sent", {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          nonce: tx.nonce,
        });

        const receipt = await tx.wait();

        if (!receipt) {
          throw new Error("Transaction confirmed but no receipt returned");
        }

        log.info("🔧 [ETHERS TEST] Transaction confirmed", {
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          logsCount: receipt.logs.length,
        });

        // Extract lock address from logs
        // NewLock event: event NewLock(address indexed lockOwner, address indexed newLockAddress);
        const newLockEvent = receipt.logs.find(
          (log: any) =>
            log.topics[0] ===
            "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7",
        );

        if (!newLockEvent || !newLockEvent.topics[2]) {
          log.error("🔧 [ETHERS TEST] Could not find NewLock event", {
            logsCount: receipt.logs.length,
            logTopics: receipt.logs.map((l: any) => l.topics[0]),
          });
          throw new Error(
            "Lock deployment succeeded but could not find lock address",
          );
        }

        // Extract address from topic (remove padding)
        const lockAddress = ethers.getAddress(
          "0x" + newLockEvent.topics[2].slice(-40),
        ) as Address;

        log.info("🔧 [ETHERS TEST] ✅ Lock deployment successful!", {
          lockAddress,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
        });

        setState({ isLoading: false, error: null, isSuccess: true });

        return {
          success: true,
          lockAddress,
          transactionHash: tx.hash,
        };
      } catch (error: any) {
        const errorMsg = error.message || "Lock deployment failed";
        log.error("🔧 [ETHERS TEST] ❌ Lock deployment error", {
          errorMessage: error.message,
          errorCode: error.code,
          errorData: error.data,
          errorReason: error.reason,
          params,
        });
        setState({ isLoading: false, error: errorMsg, isSuccess: false });
        return { success: false, error: errorMsg };
      }
    },
    [wallet],
  );

  return {
    deployLock,
    ...state,
  };
};
