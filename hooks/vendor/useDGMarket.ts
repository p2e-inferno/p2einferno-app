/**
 * useDGMarket Hook
 *
 * Provides functions and state for buying and selling DG tokens
 * through the DGTokenVendor contract.
 */

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import { getLogger } from "@/lib/utils/logger";
import type {
    FeeConfigStruct,
    StageConstantsStruct,
    TokenConfigStruct,
} from "@/lib/blockchain/shared/vendor-types";

const log = getLogger("hooks:vendor:market");
const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGMarket() {
    const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    const {
        approveIfNeeded,
        isApproving: isApprovingToken,
        error: approvalError,
    } = useTokenApproval();

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

    /**
     * Buy DG tokens with base token
     * Automatically handles token approval if needed
     * @param amount Amount in base token units (bigint)
     */
    const buyTokens = async (amount: bigint) => {
        if (!tokenConfig?.baseToken) {
            log.error("Cannot buy: base token address not available");
            return { success: false, error: "Base token address not available" };
        }

        try {
            // Check and approve base token spending if needed
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
                return approvalResult;
            }

            // Proceed with purchase
            log.info("Approval complete, executing buy", { amount: amount.toString() });
            writeContract({
                address: VENDOR_ADDRESS,
                abi: DG_TOKEN_VENDOR_ABI,
                functionName: "buyTokens",
                args: [amount],
            });
            return { success: true };
        } catch (error) {
            log.error("Error in buyTokens", { error });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Buy failed",
            };
        }
    };

    /**
     * Sell DG tokens for base token
     * Automatically handles token approval if needed
     * @param amount Amount in DG token units (bigint)
     */
    const sellTokens = async (amount: bigint) => {
        if (!tokenConfig?.swapToken) {
            log.error("Cannot sell: swap token address not available");
            return { success: false, error: "Swap token address not available" };
        }

        try {
            // Check and approve DG token spending if needed
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
                return approvalResult;
            }

            // Proceed with sale
            log.info("Approval complete, executing sell", { amount: amount.toString() });
            writeContract({
                address: VENDOR_ADDRESS,
                abi: DG_TOKEN_VENDOR_ABI,
                functionName: "sellTokens",
                args: [amount],
            });
            return { success: true };
        } catch (error) {
            log.error("Error in sellTokens", { error });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Sell failed",
            };
        }
    };

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
        hash,
    };
}
