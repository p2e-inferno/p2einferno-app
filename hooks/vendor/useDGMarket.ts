/**
 * useDGMarket Hook
 *
 * Provides functions and state for buying and selling DG tokens
 * through the DGTokenVendor contract.
 *
 * Uses the Privy write wallet for both approval and buy/sell transactions
 * to guarantee the correct wallet signs regardless of wagmi connector state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { getLogger } from "@/lib/utils/logger";
import type {
  FeeConfigStruct,
  StageConstantsStruct,
  TokenConfigStruct,
} from "@/lib/blockchain/shared/vendor-types";

const log = getLogger("hooks:vendor:market");
const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export interface MarketTxResult {
  success: boolean;
  error?: string;
  transactionHash?: `0x${string}`;
}

export function useDGMarket() {
  const wallet = usePrivyWriteWallet();
  const {
    approveIfNeeded,
    isApproving: isApprovingToken,
    error: approvalError,
  } = useTokenApproval();

  const [isWritePending, setIsWritePending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Read-only contract data (wagmi, auto-batched) ──────────────
  const { data: exchangeRate } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getExchangeRate",
  });

  const { data: feeConfigRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getFeeConfig",
  });

  const { data: tokenConfigRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getTokenConfig",
  });

  const { data: stageConstantsRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getStageConstants",
  });

  const feeConfig = feeConfigRaw as FeeConfigStruct | undefined;
  const tokenConfig = tokenConfigRaw as TokenConfigStruct | undefined;
  const stageConstants = stageConstantsRaw as StageConstantsStruct | undefined;

  // ── Write helpers (Privy write wallet) ─────────────────────────

  /**
   * Send a vendor contract write via the Privy write wallet, wait for receipt.
   */
  const sendVendorTx = useCallback(
    async (
      functionName: "buyTokens" | "sellTokens",
      args: [bigint],
    ): Promise<`0x${string}`> => {
      if (!wallet) throw new Error("Wallet not connected");

      const { walletClient, publicClient } =
        await createViemFromPrivyWallet(wallet);

      const txHash = await walletClient.writeContract({
        address: VENDOR_ADDRESS,
        abi: DG_TOKEN_VENDOR_ABI,
        functionName,
        args,
        account: walletClient.account ?? (wallet.address as `0x${string}`),
        chain: walletClient.chain,
      });

      log.info(`${functionName} transaction submitted`, { hash: txHash });
      if (mountedRef.current) {
        setLastHash(txHash);
        setIsConfirming(true);
      }

      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 180_000,
      });
      log.info(`${functionName} transaction confirmed`, { hash: txHash });

      return txHash;
    },
    [wallet],
  );

  /**
   * Buy DG tokens with base token.
   * Handles approval + buy in one flow using the same Privy wallet.
   */
  const buyTokens = useCallback(
    async (amount: bigint): Promise<MarketTxResult> => {
      if (!tokenConfig?.baseToken) {
        log.error("Cannot buy: base token address not available");
        return { success: false, error: "Base token address not available" };
      }

      if (mountedRef.current) {
        setIsWritePending(true);
        setIsConfirmed(false);
      }

      try {
        log.info("Checking approval for base token", {
          token: tokenConfig.baseToken,
          spender: VENDOR_ADDRESS,
          amount: amount.toString(),
        });

        const approvalResult = await approveIfNeeded({
          tokenAddress: tokenConfig.baseToken,
          spenderAddress: VENDOR_ADDRESS,
          amount,
        });

        if (!approvalResult.success) {
          log.error("Token approval failed", { error: approvalResult.error });
          return { success: false, error: approvalResult.error };
        }

        log.info("Approval complete, executing buy", {
          amount: amount.toString(),
        });
        const txHash = await sendVendorTx("buyTokens", [amount]);
        if (mountedRef.current) setIsConfirmed(true);
        return { success: true, transactionHash: txHash };
      } catch (error) {
        log.error("Error in buyTokens", { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Buy failed",
        };
      } finally {
        if (mountedRef.current) {
          setIsWritePending(false);
          setIsConfirming(false);
        }
      }
    },
    [tokenConfig?.baseToken, approveIfNeeded, sendVendorTx],
  );

  /**
   * Sell DG tokens for base token.
   * Handles approval + sell in one flow using the same Privy wallet.
   */
  const sellTokens = useCallback(
    async (amount: bigint): Promise<MarketTxResult> => {
      if (!tokenConfig?.swapToken) {
        log.error("Cannot sell: swap token address not available");
        return { success: false, error: "Swap token address not available" };
      }

      if (mountedRef.current) {
        setIsWritePending(true);
        setIsConfirmed(false);
      }

      try {
        log.info("Checking approval for swap token", {
          token: tokenConfig.swapToken,
          spender: VENDOR_ADDRESS,
          amount: amount.toString(),
        });

        const approvalResult = await approveIfNeeded({
          tokenAddress: tokenConfig.swapToken,
          spenderAddress: VENDOR_ADDRESS,
          amount,
        });

        if (!approvalResult.success) {
          log.error("Token approval failed", { error: approvalResult.error });
          return { success: false, error: approvalResult.error };
        }

        log.info("Approval complete, executing sell", {
          amount: amount.toString(),
        });
        const txHash = await sendVendorTx("sellTokens", [amount]);
        if (mountedRef.current) setIsConfirmed(true);
        return { success: true, transactionHash: txHash };
      } catch (error) {
        log.error("Error in sellTokens", { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Sell failed",
        };
      } finally {
        if (mountedRef.current) {
          setIsWritePending(false);
          setIsConfirming(false);
        }
      }
    },
    [tokenConfig?.swapToken, approveIfNeeded, sendVendorTx],
  );

  return {
    exchangeRate,
    feeConfig,
    tokenConfig,
    stageConstants,
    baseTokenAddress: tokenConfig?.baseToken,
    swapTokenAddress: tokenConfig?.swapToken,
    minBuyAmount: stageConstants?.minBuyAmount,
    minSellAmount: stageConstants?.minSellAmount,
    buyTokens,
    sellTokens,
    isPending: isWritePending || isConfirming || isApprovingToken,
    isApproving: isApprovingToken,
    approvalError,
    isSuccess: isConfirmed,
    hash: lastHash,
  };
}
