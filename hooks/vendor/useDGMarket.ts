/**
 * useDGMarket Hook
 *
 * Provides functions and state for buying and selling DG tokens
 * through the DGTokenVendor contract.
 */

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

type TokenConfigStruct = {
    baseToken: `0x${string}`;
    swapToken: `0x${string}`;
    exchangeRate: bigint;
};

type FeeConfigStruct = {
    maxFeeBps: bigint;
    minFeeBps: bigint;
    buyFeeBps: bigint;
    sellFeeBps: bigint;
    rateChangeCooldown: bigint;
    appChangeCooldown: bigint;
};

type StageConstantsStruct = {
    maxSellCooldown: bigint;
    dailyWindow: bigint;
    minBuyAmount: bigint;
    minSellAmount: bigint;
};

export function useDGMarket() {
    const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

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
     * @param amount Amount in base token units (bigint)
     */
    const buyTokens = (amount: bigint) => {
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "buyTokens",
            args: [amount],
        });
    };

    /**
     * Sell DG tokens for base token
     * @param amount Amount in DG token units (bigint)
     */
    const sellTokens = (amount: bigint) => {
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "sellTokens",
            args: [amount],
        });
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
        isPending: isWritePending || isConfirming,
        isSuccess: isConfirmed,
        hash,
    };
}
