/**
 * useTokenApproval Hook
 *
 * Generic ERC20 token approval hook that can be used across the app.
 * Handles checking allowance and approving tokens for any spender contract.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { ERC20_ABI } from "@/lib/blockchain/shared/abi-definitions";
import { getBlockExplorerUrl } from "@/lib/blockchain/shared/network-utils";
import type { TxResult } from "@/lib/transaction-stepper/types";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:useTokenApproval");

interface ApprovalParams {
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  amount: bigint;
}

export interface ApprovalResult {
  success: boolean;
  error?: string;
  transactionHash?: string;
}

export function useTokenApproval() {
  const wallet = usePrivyWriteWallet();

  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const safeSetIsApproving = useCallback((value: boolean) => {
    if (!isMountedRef.current) return;
    setIsApproving(value);
  }, []);

  const safeSetError = useCallback((value: string | null) => {
    if (!isMountedRef.current) return;
    setError(value);
  }, []);

  const getErrorMessage = useCallback((err: unknown): string => {
    if (!err) return "Token approval failed";
    if (typeof err === "string") return err;
    if (err instanceof Error && err.message) return err.message;
    const maybe = err as any;
    return maybe?.shortMessage || maybe?.message || "Token approval failed";
  }, []);

  const hasPrivyWalletMethods = useCallback((w: any): boolean => {
    return (
      !!w &&
      typeof w.getEthereumProvider === "function" &&
      typeof w.switchChain === "function"
    );
  }, []);

  /**
   * Check current allowance for a token
   */
  const checkAllowance = useCallback(
    async (
      publicClient: any,
      tokenAddress: Address,
      ownerAddress: Address,
      spenderAddress: Address,
    ): Promise<bigint> => {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [ownerAddress, spenderAddress],
      });

      return (allowance as bigint) || 0n;
    },
    [],
  );

  /**
   * Approve token spending for a spender contract
   * Automatically checks allowance first and only approves if needed
   */
  const approveIfNeededTx = useCallback(
    async (params: ApprovalParams): Promise<TxResult> => {
      if (!wallet) {
        const errorMessage = "Wallet not connected";
        safeSetError(errorMessage);
        throw new Error(errorMessage);
      }

      if (!hasPrivyWalletMethods(wallet)) {
        const errorMessage = "Wallet does not support token approvals";
        safeSetError(errorMessage);
        throw new Error(errorMessage);
      }

      safeSetIsApproving(true);
      safeSetError(null);

      try {
        const { walletClient, publicClient } =
          await createViemFromPrivyWallet(wallet);
        const userAddress = wallet.address as Address;
        const explorerConfig = {
          chain: walletClient.chain!,
          rpcUrl: "",
          networkName: walletClient.chain?.name ?? "Unknown",
        };

        log.info("Checking allowance", {
          token: params.tokenAddress,
          spender: params.spenderAddress,
          amount: params.amount.toString(),
        });

        const allowance = await checkAllowance(
          publicClient,
          params.tokenAddress,
          userAddress,
          params.spenderAddress,
        );

        log.info("Current allowance", {
          allowance: allowance.toString(),
          required: params.amount.toString(),
        });

        if (allowance >= params.amount) {
          log.info("Allowance sufficient, skipping approval");
          safeSetIsApproving(false);
          return { data: { skipped: true } };
        }

        const sendApprove = async (amount: bigint) => {
          log.info("Approving token spend", {
            token: params.tokenAddress,
            spender: params.spenderAddress,
            amount: amount.toString(),
          });

          const txHash = await walletClient.writeContract({
            address: params.tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [params.spenderAddress, amount],
            account: walletClient.account ?? userAddress,
            chain: walletClient.chain,
          });

          log.info("Approval transaction sent", { hash: txHash });
          return txHash;
        };

        let approveTx: `0x${string}`;
        try {
          approveTx = await sendApprove(params.amount);
        } catch (err) {
          /**
           * Some ERC20s (notably USDT-style) require setting allowance to 0
           * before setting it to a new non-zero value.
           */
          if (allowance > 0n && params.amount > 0n) {
            log.warn(
              "Direct approval failed; attempting 0-then-approve fallback",
              {
                token: params.tokenAddress,
                spender: params.spenderAddress,
                allowance: allowance.toString(),
                required: params.amount.toString(),
                error: err,
              },
            );

            const resetTx = await sendApprove(0n);
            await publicClient.waitForTransactionReceipt({
              hash: resetTx,
              timeout: 180_000,
            });
            log.info("Reset approval confirmed", { hash: resetTx });

            approveTx = await sendApprove(params.amount);
          } else {
            throw err;
          }
        }

        return {
          transactionHash: approveTx,
          transactionUrl: getBlockExplorerUrl(approveTx, explorerConfig),
          waitForConfirmation: async () => {
            try {
              const receipt = await publicClient.waitForTransactionReceipt({
                hash: approveTx,
                timeout: 180_000,
              });
              log.info("Approval transaction confirmed", { hash: approveTx });
              return {
                transactionHash: approveTx,
                transactionUrl: getBlockExplorerUrl(approveTx, explorerConfig),
                receipt,
              };
            } finally {
              safeSetIsApproving(false);
            }
          },
        };
      } catch (err: unknown) {
        const errorMsg = getErrorMessage(err);
        log.error("Approval error", { error: err, params });
        safeSetError(errorMsg);
        safeSetIsApproving(false);
        throw new Error(errorMsg);
      }
    },
    [
      wallet,
      checkAllowance,
      getErrorMessage,
      hasPrivyWalletMethods,
      safeSetError,
      safeSetIsApproving,
    ],
  );

  const approveIfNeeded = useCallback(
    async (params: ApprovalParams): Promise<ApprovalResult> => {
      try {
        const tx = await approveIfNeededTx(params);
        if (!tx.transactionHash || !tx.waitForConfirmation) {
          return { success: true };
        }

        await tx.waitForConfirmation();
        return { success: true, transactionHash: tx.transactionHash };
      } catch (err: any) {
        const errorMsg = err?.message || "Token approval failed";
        safeSetError(errorMsg);
        return { success: false, error: errorMsg };
      }
    },
    [approveIfNeededTx, safeSetError],
  );

  return {
    approveIfNeeded,
    approveIfNeededTx,
    isApproving,
    error,
  };
}
