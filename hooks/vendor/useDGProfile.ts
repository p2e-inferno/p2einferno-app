/**
 * useDGProfile Hook
 *
 * Provides user state and stage upgrade functionality
 * for the DGTokenVendor contract.
 */

import { useReadContract, useWriteContract } from "wagmi";
import { useAccount } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export interface UserState {
    stage: number;
    points: bigint;
    fuel: bigint;
    lastStage3MaxSale: bigint;
    dailySoldAmount: bigint;
    dailyWindowStart: bigint;
}

export function useDGProfile() {
    const { address } = useAccount();
    const { writeContract, data: hash, isPending } = useWriteContract();

    // Read user state
    const { data: userStateRaw, refetch: refetchState } = useReadContract({
        address: VENDOR_ADDRESS,
        abi: DG_TOKEN_VENDOR_ABI,
        functionName: "getUserState",
        args: [address!],
        query: { enabled: !!address },
    });

    // Map the tuple result into a friendlier shape
    // The contract returns a tuple [stage, points, fuel, lastStage3MaxSale, dailySoldAmount, dailyWindowStart]
    type UserStateTuple = readonly [number, bigint, bigint, bigint, bigint, bigint];
    const tuple = userStateRaw as unknown as UserStateTuple | undefined;
    const userState: UserState | undefined = tuple
        ? {
            stage: tuple[0],
            points: tuple[1],
            fuel: tuple[2],
            lastStage3MaxSale: tuple[3],
            dailySoldAmount: tuple[4],
            dailyWindowStart: tuple[5],
        }
        : undefined;

    /**
     * Upgrade to the next stage
     * User must meet points and fuel thresholds
     */
    const upgradeStage = () => {
        writeContract({
            address: VENDOR_ADDRESS,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "upgradeStage",
        });
    };

    return {
        userState,
        upgradeStage,
        refetchState,
        isPending,
        hash,
    };
}
