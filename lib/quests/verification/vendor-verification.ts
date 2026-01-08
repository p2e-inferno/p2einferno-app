/**
 * Vendor Verification Strategy
 *
 * Verifies vendor-related quest tasks by checking on-chain transactions
 * and user state in the DGTokenVendor contract.
 */

import type { PublicClient, Address } from "viem";
import { decodeEventLog } from "viem";
import type { TaskType } from "@/lib/supabase/types";
import type { VerificationStrategy, VerificationResult, VerificationOptions } from "./types";
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
        userAddress: string,
        options?: VerificationOptions
    ): Promise<VerificationResult> {
        const { transactionHash } = verificationData as {
            transactionHash?: `0x${string}`;
        };
        const taskConfig = options?.taskConfig || null;

        try {
            switch (taskType) {
                case "vendor_buy":
                case "vendor_sell":
                case "vendor_light_up":
                    if (!transactionHash) {
                        return {
                            success: false,
                            error: "Transaction hash required",
                            code: "TX_HASH_REQUIRED",
                        };
                    }
                    return await this.verifyTransaction(
                        transactionHash!,
                        taskType,
                        userAddress,
                        taskConfig
                    );

                case "vendor_level_up":
                    return await this.verifyLevel(userAddress, taskConfig);

                default:
                    return {
                        success: false,
                        error: "Unsupported vendor task type",
                        code: "INVALID_TASK_TYPE",
                    };
            }
        } catch (error: unknown) {
            log.error("Verification error", { error, taskType, userId });
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
                code: "VERIFICATION_ERROR",
            };
        }
    }

    private async verifyTransaction(
        txHash: `0x${string}`,
        type: TaskType,
        user: string,
        taskConfig: Record<string, unknown> | null
    ): Promise<VerificationResult> {
        let receipt;
        try {
            receipt = await this.client.getTransactionReceipt({ hash: txHash });
        } catch (error) {
            log.warn("Transaction receipt lookup failed", { error, txHash, type });
            const errorMessage = error instanceof Error ? error.message : "Transaction not found";
            return { success: false, error: errorMessage, code: "TX_FETCH_FAILED" };
        }

        // Verify interaction with Vendor contract
        if (receipt.to?.toLowerCase() !== VENDOR_ADDRESS.toLowerCase()) {
            return {
                success: false,
                error: "Transaction not with Vendor contract",
                code: "WRONG_CONTRACT",
            };
        }

        // Verify sender
        if (receipt.from.toLowerCase() !== user.toLowerCase()) {
            return {
                success: false,
                error: "Transaction sender mismatch",
                code: "SENDER_MISMATCH",
            };
        }

        // Check transaction status
        if (receipt.status !== "success") {
            return { success: false, error: "Transaction failed", code: "TX_FAILED" };
        }

        const eventName = this.getExpectedEvent(type);
        if (!eventName) {
            return { success: false, error: "Unsupported vendor task type", code: "INVALID_TASK_TYPE" };
        }

        const decoded = receipt.logs
            .filter((log) => log.address.toLowerCase() === VENDOR_ADDRESS.toLowerCase())
            .map((log) => this.safeDecode(log))
            .find((event) => event?.eventName === eventName);

        if (!decoded) {
            return { success: false, error: "Expected vendor event not found", code: "EVENT_NOT_FOUND" };
        }

        const userMatches = this.eventUserMatches(type, decoded.args, user);
        if (!userMatches) {
            return { success: false, error: "Event user mismatch", code: "USER_MISMATCH" };
        }

        const amount = this.getEventAmount(type, decoded.args, taskConfig);
        if (type !== "vendor_light_up") {
            const required = this.getRequiredAmount(type, taskConfig);
            if (required > 0n && amount < required) {
                return { success: false, error: "Amount below required minimum", code: "AMOUNT_TOO_LOW" };
            }
        }

        log.info("Transaction verified", { txHash, type, user, eventName });
        return {
            success: true,
            metadata: {
                txHash,
                eventName,
                amount: amount.toString(),
                logIndex: decoded.logIndex,
                blockNumber: receipt.blockNumber?.toString(),
                verifiedAt: new Date().toISOString(),
            },
        };
    }

    private async verifyLevel(
        user: string,
        taskConfig: Record<string, unknown> | null
    ): Promise<VerificationResult> {
        const targetStage = this.getTargetStage(taskConfig);
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
            return {
                success: true,
                metadata: {
                    txHash: null,
                    eventName: "StageUpgraded",
                    amount: null,
                    logIndex: null,
                    blockNumber: null,
                    verifiedAt: new Date().toISOString(),
                },
            };
        }

        return {
            success: false,
            error: `Current stage ${stage} < Target ${targetStage}`,
            code: "STAGE_TOO_LOW",
        };
    }

    private getExpectedEvent(type: TaskType): "TokensPurchased" | "TokensSold" | "Lit" | null {
        switch (type) {
            case "vendor_buy":
                return "TokensPurchased";
            case "vendor_sell":
                return "TokensSold";
            case "vendor_light_up":
                return "Lit";
            default:
                return null;
        }
    }

    private safeDecode(log: { data: `0x${string}`; topics: readonly `0x${string}`[] | readonly []; logIndex?: number }) {
        try {
            // Skip logs with no topics (shouldn't match events anyway)
            if (log.topics.length === 0) {
                return null;
            }
            const decoded = decodeEventLog({
                abi: DG_TOKEN_VENDOR_ABI,
                data: log.data,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
            });
            return { ...decoded, logIndex: log.logIndex ?? null };
        } catch {
            return null;
        }
    }

    private eventUserMatches(type: TaskType, args: Record<string, unknown>, user: string): boolean {
        const userLower = user.toLowerCase();
        if (type === "vendor_buy") {
            return (args.buyer as string)?.toLowerCase() === userLower;
        }
        if (type === "vendor_sell") {
            return (args.seller as string)?.toLowerCase() === userLower;
        }
        if (type === "vendor_light_up") {
            return (args.user as string)?.toLowerCase() === userLower;
        }
        return false;
    }

    private getEventAmount(
        type: TaskType,
        args: Record<string, unknown>,
        taskConfig: Record<string, unknown> | null
    ): bigint {
        const tokenPref = this.getRequiredToken(type, taskConfig);
        if (type === "vendor_buy") {
            const amount =
                tokenPref === "swap"
                    ? (args.swapTokenAmount ?? args.baseTokenAmount)
                    : (args.baseTokenAmount ?? args.swapTokenAmount);
            return this.toBigInt(amount);
        }
        if (type === "vendor_sell") {
            const amount =
                tokenPref === "base"
                    ? (args.baseTokenAmount ?? args.swapTokenAmount)
                    : (args.swapTokenAmount ?? args.baseTokenAmount);
            return this.toBigInt(amount);
        }
        return 0n;
    }

    private getRequiredAmount(type: TaskType, taskConfig: Record<string, unknown> | null): bigint {
        const raw = taskConfig && typeof taskConfig === "object"
            ? (taskConfig as { required_amount?: unknown }).required_amount
            : undefined;

        const required = this.toBigInt(raw);
        if (required > 0n) {
            return required;
        }

        // Defaults: allow any amount if not configured.
        if (type === "vendor_buy" || type === "vendor_sell") {
            return 0n;
        }
        return 0n;
    }

    private getRequiredToken(type: TaskType, taskConfig: Record<string, unknown> | null): "base" | "swap" {
        const raw = taskConfig && typeof taskConfig === "object"
            ? (taskConfig as { required_token?: unknown }).required_token
            : undefined;
        if (raw === "base" || raw === "swap") {
            return raw;
        }
        return type === "vendor_sell" ? "swap" : "base";
    }

    private getTargetStage(taskConfig: Record<string, unknown> | null): number {
        const raw = taskConfig && typeof taskConfig === "object"
            ? (taskConfig as { target_stage?: unknown }).target_stage
            : undefined;
        if (typeof raw === "number" && Number.isFinite(raw)) {
            return Math.max(1, Math.floor(raw));
        }
        if (typeof raw === "string" && raw.trim()) {
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isNaN(parsed)) {
                return Math.max(1, parsed);
            }
        }
        return 1;
    }

    private toBigInt(value: unknown): bigint {
        if (typeof value === "bigint") return value;
        if (typeof value === "number" && Number.isFinite(value)) {
            return BigInt(Math.floor(value));
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return 0n;
            try {
                return BigInt(trimmed);
            } catch {
                return 0n;
            }
        }
        return 0n;
    }
}
