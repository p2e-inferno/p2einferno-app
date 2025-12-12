/**
 * TDD Tests for Vendor Verification Strategy
 *
 * These tests define the expected behavior for quest verification.
 * Tests will FAIL until lib/quests/verification/vendor-verification.ts is implemented.
 */

import type { PublicClient, Address } from "viem";

// Mock the ABI - will be replaced when vendor-abi.ts is implemented
jest.mock("@/lib/blockchain/shared/vendor-abi", () => ({
    DG_TOKEN_VENDOR_ABI: [],
}));

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
    getLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

describe("VendorVerificationStrategy", () => {
    const mockVendorAddress = "0xVENDOR0000000000000000000000000000000000" as Address;
    const mockUserAddress = "0xUSER00000000000000000000000000000000000" as Address;
    const mockTxHash = "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;

    // Will fail until implemented
    let VendorVerificationStrategy: any;

    const createMockPublicClient = (overrides: Partial<PublicClient> = {}): PublicClient =>
    ({
        getTransactionReceipt: jest.fn(),
        readContract: jest.fn(),
        ...overrides,
    } as unknown as PublicClient);

    beforeAll(async () => {
        // Set env var for tests
        process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS = mockVendorAddress;

        try {
            const module = await import("@/lib/quests/verification/vendor-verification");
            VendorVerificationStrategy = module.VendorVerificationStrategy;
        } catch {
            // Expected to fail until implemented
        }
    });

    describe("Constructor", () => {
        it("should accept a PublicClient in constructor", () => {
            expect(VendorVerificationStrategy).toBeDefined();
            const client = createMockPublicClient();
            const strategy = new VendorVerificationStrategy(client);
            expect(strategy).toBeDefined();
        });
    });

    describe("verify() - vendor_buy", () => {
        it("should verify a valid buy transaction", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "success",
                    to: mockVendorAddress,
                    from: mockUserAddress,
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_buy",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });

        it("should fail if transaction hash is missing", async () => {
            const client = createMockPublicClient();
            const strategy = new VendorVerificationStrategy(client);

            const result = await strategy.verify(
                "vendor_buy",
                {},
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Transaction hash required");
        });

        it("should fail if transaction was not to vendor contract", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "success",
                    to: "0xWRONGCONTRACT000000000000000000000000",
                    from: mockUserAddress,
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_buy",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Transaction not with Vendor contract");
        });

        it("should fail if transaction sender does not match user", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "success",
                    to: mockVendorAddress,
                    from: "0xDIFFERENTUSER000000000000000000000000",
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_buy",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Transaction sender mismatch");
        });

        it("should fail if transaction reverted", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "reverted",
                    to: mockVendorAddress,
                    from: mockUserAddress,
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_buy",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Transaction failed");
        });
    });

    describe("verify() - vendor_sell", () => {
        it("should verify a valid sell transaction", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "success",
                    to: mockVendorAddress,
                    from: mockUserAddress,
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_sell",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });
    });

    describe("verify() - vendor_light_up", () => {
        it("should verify a valid light up transaction", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockResolvedValue({
                    status: "success",
                    to: mockVendorAddress,
                    from: mockUserAddress,
                }),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_light_up",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });
    });

    describe("verify() - vendor_level_up", () => {
        it("should verify user has reached target stage", async () => {
            const client = createMockPublicClient({
                readContract: jest.fn().mockResolvedValue([
                    2, // stage (target is 2)
                    1000n, // points
                    500n, // fuel
                    0n, // lastStage3MaxSale
                    0n, // dailySoldAmount
                    0n, // dailyWindowStart
                ]),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_level_up",
                { targetStage: 2 },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });

        it("should fail if user has not reached target stage", async () => {
            const client = createMockPublicClient({
                readContract: jest.fn().mockResolvedValue([
                    1, // stage (target is 3)
                    500n,
                    200n,
                    0n,
                    0n,
                    0n,
                ]),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_level_up",
                { targetStage: 3 },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain("Current stage 1 < Target 3");
        });

        it("should succeed if user has exceeded target stage", async () => {
            const client = createMockPublicClient({
                readContract: jest.fn().mockResolvedValue([
                    3, // stage (target is 2)
                    2000n,
                    1000n,
                    0n,
                    0n,
                    0n,
                ]),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_level_up",
                { targetStage: 2 },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });

        it("should NOT require transaction hash for level_up verification", async () => {
            const client = createMockPublicClient({
                readContract: jest.fn().mockResolvedValue([2, 0n, 0n, 0n, 0n, 0n]),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_level_up",
                { targetStage: 2 }, // No transactionHash
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(true);
        });
    });

    describe("verify() - unsupported type", () => {
        it("should return error for unsupported task type", async () => {
            const client = createMockPublicClient();
            const strategy = new VendorVerificationStrategy(client);

            const result = await strategy.verify(
                "unsupported_type" as any,
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("Unsupported vendor task type");
        });
    });

    describe("Error Handling", () => {
        it("should handle RPC errors gracefully", async () => {
            const client = createMockPublicClient({
                getTransactionReceipt: jest.fn().mockRejectedValue(new Error("RPC timeout")),
            });

            const strategy = new VendorVerificationStrategy(client);
            const result = await strategy.verify(
                "vendor_buy",
                { transactionHash: mockTxHash },
                "user-123",
                mockUserAddress
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("RPC timeout");
        });
    });
});
