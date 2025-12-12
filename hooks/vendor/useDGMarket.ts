/**
 * useDGMarket Hook
 *
 * Provides functions and state for buying and selling DG tokens
 * through the DGTokenVendor contract.
 */

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGMarket() {
    const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

    // Read exchange rate
    const { data: exchangeRate } = useReadContract({
        address: VENDOR_ADDRESS,
        abi: DG_TOKEN_VENDOR_ABI,
        functionName: "getExchangeRate",
    });

    // Read fee configuration
    const { data: feeConfig } = useReadContract({
        address: VENDOR_ADDRESS,
        abi: DG_TOKEN_VENDOR_ABI,
        functionName: "getFeeConfig",
    });

    /**
     * Buy DG tokens with base token
     * @param amount Amount in base token units (as string, will be parsed to BigInt)
     */
    const buyTokens = (amount: string) => {
        const parsedAmount = BigInt(amount);
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "buyTokens",
            args: [parsedAmount],
        });
    };

    /**
     * Sell DG tokens for base token
     * @param amount Amount in DG token units (as string, will be parsed to BigInt)
     */
    const sellTokens = (amount: string) => {
        const parsedAmount = BigInt(amount);
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "sellTokens",
            args: [parsedAmount],
        });
    };

    return {
        exchangeRate,
        feeConfig,
        buyTokens,
        sellTokens,
        isPending: isWritePending || isConfirming,
        isSuccess: isConfirmed,
        hash,
    };
}
