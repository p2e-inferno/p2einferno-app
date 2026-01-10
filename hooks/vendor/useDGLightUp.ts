/**
 * useDGLightUp Hook
 *
 * Provides the "Light Up" functionality for the DGTokenVendor contract.
 * Light Up burns tokens to gain fuel and points.
 */

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGLightUp() {
    const { writeContract, data: hash, isPending } = useWriteContract();
    const { isSuccess } = useWaitForTransactionReceipt({ hash });

    /**
     * Execute the Light Up action
     * Burns tokens based on current stage configuration
     */
    const lightUp = () => {
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "lightUp",
        });
    };

    return {
        lightUp,
        isPending,
        isSuccess,
        hash: hash ?? null,
    };
}
