/**
 * Unit Tests for DG Token Transfer Service
 *
 * Tests the pure functions in dg-transfer-service.ts:
 * - transferDGTokens
 * - getTokenBalance
 * - hasValidDGNationKey
 */

import type { PublicClient, WalletClient, Address } from "viem";
import {
    transferDGTokens,
    getTokenBalance,
    hasValidDGNationKey,
    type DGTransferParams,
} from "@/lib/token-withdrawal/functions/dg-transfer-service";

// Mock logger to avoid console output in tests
jest.mock("@/lib/utils/logger", () => ({
    getLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

describe("dg-transfer-service", () => {
    const mockRecipient = "0x1234567890123456789012345678901234567890" as Address;
    const mockTokenAddress =
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
    const mockLockAddress =
        "0x5678567856785678567856785678567856785678" as Address;
    const mockTxHash =
        "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;

    describe("transferDGTokens", () => {
        const createMockWalletClient = (
            overrides: Partial<WalletClient> = {}
        ): WalletClient =>
        ({
            account: {
                address: "0x0000000000000000000000000000000000000001" as Address,
            },
            writeContract: jest.fn().mockResolvedValue(mockTxHash),
            ...overrides,
        } as unknown as WalletClient);

        const createMockPublicClient = (
            status: "success" | "reverted" = "success"
        ): PublicClient =>
        ({
            waitForTransactionReceipt: jest.fn().mockResolvedValue({
                status,
                blockNumber: 12345n,
            }),
        } as unknown as PublicClient);

        const defaultParams: DGTransferParams = {
            recipientAddress: mockRecipient,
            amount: 1000n * 10n ** 18n, // 1000 DG tokens
            tokenAddress: mockTokenAddress,
        };

        it("should return error when wallet client is null", async () => {
            const result = await transferDGTokens(
                null as unknown as WalletClient,
                createMockPublicClient(),
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Server wallet not configured",
            });
        });

        it("should return error when wallet account is missing", async () => {
            const walletClient = createMockWalletClient({ account: undefined });

            const result = await transferDGTokens(
                walletClient,
                createMockPublicClient(),
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Wallet account not available",
            });
        });

        it("should successfully transfer tokens and return transaction hash", async () => {
            const walletClient = createMockWalletClient();
            const publicClient = createMockPublicClient("success");

            const result = await transferDGTokens(
                walletClient,
                publicClient,
                defaultParams
            );

            expect(result).toEqual({
                success: true,
                transactionHash: mockTxHash,
                blockNumber: 12345n,
            });

            expect(walletClient.writeContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: mockTokenAddress,
                    functionName: "transfer",
                    args: [mockRecipient, defaultParams.amount],
                })
            );

            expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
                hash: mockTxHash,
                confirmations: 2,
            });
        });

        it("should return error when transaction reverts", async () => {
            const walletClient = createMockWalletClient();
            const publicClient = createMockPublicClient("reverted");

            const result = await transferDGTokens(
                walletClient,
                publicClient,
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Transaction reverted on-chain",
            });
        });

        it("should handle writeContract errors gracefully", async () => {
            const walletClient = createMockWalletClient();
            (walletClient.writeContract as jest.Mock).mockRejectedValue(
                new Error("Insufficient funds")
            );

            const result = await transferDGTokens(
                walletClient,
                createMockPublicClient(),
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Insufficient funds",
            });
        });

        it("should handle receipt waiting errors gracefully", async () => {
            const walletClient = createMockWalletClient();
            const publicClient = createMockPublicClient();
            (publicClient.waitForTransactionReceipt as jest.Mock).mockRejectedValue(
                new Error("Network timeout")
            );

            const result = await transferDGTokens(
                walletClient,
                publicClient,
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Network timeout",
            });
        });

        it("should handle non-Error exceptions", async () => {
            const walletClient = createMockWalletClient();
            (walletClient.writeContract as jest.Mock).mockRejectedValue(
                "string error"
            );

            const result = await transferDGTokens(
                walletClient,
                createMockPublicClient(),
                defaultParams
            );

            expect(result).toEqual({
                success: false,
                error: "Unknown error",
            });
        });
    });

    describe("getTokenBalance", () => {
        const createMockPublicClient = (balance: bigint = 5000n): PublicClient =>
        ({
            readContract: jest.fn().mockResolvedValue(balance),
        } as unknown as PublicClient);

        it("should return token balance for a wallet", async () => {
            const expectedBalance = 5000n * 10n ** 18n;
            const publicClient = createMockPublicClient(expectedBalance);

            const result = await getTokenBalance(
                publicClient,
                mockTokenAddress,
                mockRecipient
            );

            expect(result).toBe(expectedBalance);
            expect(publicClient.readContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: mockTokenAddress,
                    functionName: "balanceOf",
                    args: [mockRecipient],
                })
            );
        });

        it("should return 0n when readContract fails", async () => {
            const publicClient = {
                readContract: jest.fn().mockRejectedValue(new Error("RPC error")),
            } as unknown as PublicClient;

            const result = await getTokenBalance(
                publicClient,
                mockTokenAddress,
                mockRecipient
            );

            expect(result).toBe(0n);
        });

        it("should return 0n for wallets with zero balance", async () => {
            const publicClient = createMockPublicClient(0n);

            const result = await getTokenBalance(
                publicClient,
                mockTokenAddress,
                mockRecipient
            );

            expect(result).toBe(0n);
        });
    });

    describe("hasValidDGNationKey", () => {
        const createMockPublicClient = (hasKey: boolean = true): PublicClient =>
        ({
            readContract: jest.fn().mockResolvedValue(hasKey),
        } as unknown as PublicClient);

        it("should return true when user has valid key", async () => {
            const publicClient = createMockPublicClient(true);

            const result = await hasValidDGNationKey(
                publicClient,
                mockRecipient,
                mockLockAddress
            );

            expect(result).toBe(true);
            expect(publicClient.readContract).toHaveBeenCalledWith(
                expect.objectContaining({
                    address: mockLockAddress,
                    functionName: "getHasValidKey",
                    args: [mockRecipient],
                })
            );
        });

        it("should return false when user has no valid key", async () => {
            const publicClient = createMockPublicClient(false);

            const result = await hasValidDGNationKey(
                publicClient,
                mockRecipient,
                mockLockAddress
            );

            expect(result).toBe(false);
        });

        it("should return false when readContract fails", async () => {
            const publicClient = {
                readContract: jest.fn().mockRejectedValue(new Error("Contract error")),
            } as unknown as PublicClient;

            const result = await hasValidDGNationKey(
                publicClient,
                mockRecipient,
                mockLockAddress
            );

            expect(result).toBe(false);
        });

        it("should convert truthy values to boolean", async () => {
            const publicClient = {
                readContract: jest.fn().mockResolvedValue(1), // Truthy but not boolean
            } as unknown as PublicClient;

            const result = await hasValidDGNationKey(
                publicClient,
                mockRecipient,
                mockLockAddress
            );

            expect(result).toBe(true);
        });

        it("should convert falsy values to boolean", async () => {
            const publicClient = {
                readContract: jest.fn().mockResolvedValue(0), // Falsy but not boolean
            } as unknown as PublicClient;

            const result = await hasValidDGNationKey(
                publicClient,
                mockRecipient,
                mockLockAddress
            );

            expect(result).toBe(false);
        });
    });
});
