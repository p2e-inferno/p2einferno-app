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
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("hooks:useTokenApproval");

interface ApprovalParams {
  tokenAddress: `0x${string}`;
  spenderAddress: `0x${string}`;
  amount: bigint;
}

interface ApprovalResult {
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
      spenderAddress: Address
    ): Promise<bigint> => {
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [ownerAddress, spenderAddress],
      });

      return (allowance as bigint) || 0n;
    },
    []
  );

  /**
   * Approve token spending for a spender contract
   * Automatically checks allowance first and only approves if needed
   */
  const approveIfNeeded = useCallback(
    async (params: ApprovalParams): Promise<ApprovalResult> => {
      if (!wallet) {
        const errorMessage = "Wallet not connected";
        safeSetError(errorMessage);
        return { success: false, error: errorMessage };
      }

      if (!hasPrivyWalletMethods(wallet)) {
        const errorMessage = "Wallet does not support token approvals";
        safeSetError(errorMessage);
        return { success: false, error: errorMessage };
      }

      safeSetIsApproving(true);
      safeSetError(null);

      try {
        // Create fresh viem clients per operation
        const { walletClient, publicClient } = await createViemFromPrivyWallet(wallet);
        const userAddress = wallet.address as Address;

        // Check current allowance
        log.info("Checking allowance", {
          token: params.tokenAddress,
          spender: params.spenderAddress,
          amount: params.amount.toString(),
        });

        const allowance = await checkAllowance(
          publicClient,
          params.tokenAddress,
          userAddress,
          params.spenderAddress
        );

        log.info("Current allowance", {
          allowance: allowance.toString(),
          required: params.amount.toString(),
        });

        // If allowance is sufficient, no need to approve
        if (allowance >= params.amount) {
          log.info("Allowance sufficient, skipping approval");
          safeSetIsApproving(false);
          return { success: true };
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

          await publicClient.waitForTransactionReceipt({ hash: txHash });

          log.info("Approval transaction confirmed", { hash: txHash });
          return txHash;
        };

        try {
          const approveTx = await sendApprove(params.amount);
          safeSetIsApproving(false);
          return { success: true, transactionHash: approveTx };
        } catch (err) {
          /**
           * Some ERC20s (notably USDT-style) require setting allowance to 0
           * before setting it to a new non-zero value.
           */
          if (allowance > 0n && params.amount > 0n) {
            log.warn("Direct approval failed; attempting 0-then-approve fallback", {
              token: params.tokenAddress,
              spender: params.spenderAddress,
              allowance: allowance.toString(),
              required: params.amount.toString(),
              error: err,
            });

            const resetTx = await sendApprove(0n);
            log.info("Reset approval confirmed", { hash: resetTx });

            const approveTx = await sendApprove(params.amount);
            safeSetIsApproving(false);
            return { success: true, transactionHash: approveTx };
          }

          throw err;
        }
      } catch (err: unknown) {
        const errorMsg = getErrorMessage(err);
        log.error("Approval error", { error: err, params });
        safeSetError(errorMsg);
        safeSetIsApproving(false);
        return { success: false, error: errorMsg };
      }
    },
    [
      wallet,
      checkAllowance,
      getErrorMessage,
      hasPrivyWalletMethods,
      safeSetError,
      safeSetIsApproving,
    ]
  );

  return {
    approveIfNeeded,
    isApproving,
    error,
  };
}
