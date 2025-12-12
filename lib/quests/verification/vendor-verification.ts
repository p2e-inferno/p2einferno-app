/**
 * Vendor Verification Strategy
 *
 * Verifies vendor-related quest tasks by checking on-chain transactions
 * and user state in the DGTokenVendor contract.
 */

import type { PublicClient, Address } from "viem";
import type { TaskType } from "@/lib/supabase/types";
import type { VerificationStrategy, VerificationResult } from "./types";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("vendor-verification");

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export class VendorVerificationStrategy implements VerificationStrategy {
    constructor(private readonly client: PublicClient) { }

    async verify(
        taskType: TaskType,
        verificationData: Record<string, unknown>,
        userId: string,
        userAddress: string
    ): Promise<VerificationResult> {
        const { transactionHash, targetStage } = verificationData as {
            transactionHash?: `0x${string}`;
            targetStage?: number;
        };

        // vendor_level_up doesn't require a transaction hash
        if (!transactionHash && taskType !== "vendor_level_up") {
            return { success: false, error: "Transaction hash required" };
        }

        try {
            switch (taskType) {
                case "vendor_buy":
                case "vendor_sell":
                case "vendor_light_up":
                    return await this.verifyTransaction(
                        transactionHash!,
                        taskType,
                        userAddress
                    );

                case "vendor_level_up":
                    return await this.verifyLevel(userAddress, targetStage || 1);

                default:
                    return { success: false, error: "Unsupported vendor task type" };
            }
        } catch (error: unknown) {
            log.error("Verification error", { error, taskType, userId });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }

    private async verifyTransaction(
        txHash: `0x${string}`,
        type: TaskType,
        user: string
    ): Promise<VerificationResult> {
        const receipt = await this.client.getTransactionReceipt({ hash: txHash });

        // Verify interaction with Vendor contract
        if (receipt.to?.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()) {
            return { success: false, error: "Transaction not with Vendor contract" };
        }

        // Verify sender
        if (receipt.from.toLowerCase() !== user.toLowerCase()) {
            return { success: false, error: "Transaction sender mismatch" };
        }

        // Check transaction status
        if (receipt.status !== "success") {
            return { success: false, error: "Transaction failed" };
        }

        log.info("Transaction verified", { txHash, type, user });
        return { success: true };
    }

    private async verifyLevel(
        user: string,
        targetStage: number
    ): Promise<VerificationResult> {
        const userState = await this.client.readContract({
            address: VENDOR_ADDRESS as Address,
            abi: DG_TOKEN_VENDOR_ABI,
            functionName: "getUserState",
            args: [user as `0x${string}`],
        });

        // userState follows the tuple layout defined in the ABI:
        // [stage, points, fuel, lastStage3MaxSale, dailySoldAmount, dailyWindowStart]
        const tuple = userState as unknown as readonly [number, ...unknown[]];
        const stage = tuple[0];

        if (stage >= targetStage) {
            log.info("Level verified", { user, stage, targetStage });
            return { success: true };
        }

        return {
            success: false,
            error: `Current stage ${stage} < Target ${targetStage}`,
        };
    }
}
