/**
 * Unit Tests for Withdrawal Types
 *
 * Tests the TypeScript type definitions and their runtime validation
 * for the DG token withdrawal feature.
 */

import type {
    WithdrawRequest,
    WithdrawSuccessResponse,
    WithdrawErrorResponse,
    WithdrawResponse,
    WithdrawalHistoryResponse,
    WithdrawalRecord,
    WalletBalanceResponse,
} from "@/lib/token-withdrawal/types";

describe("Withdrawal Types", () => {
    describe("WithdrawRequest", () => {
        it("should accept valid withdrawal request structure", () => {
            const request: WithdrawRequest = {
                walletAddress: "0x1234567890123456789012345678901234567890",
                amountDG: 1000,
                signature:
                    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
                deadline: Math.floor(Date.now() / 1000) + 900,
            };

            expect(request.walletAddress).toBeDefined();
            expect(request.amountDG).toBeGreaterThan(0);
            expect(request.signature).toMatch(/^0x[a-fA-F0-9]+$/);
            expect(request.deadline).toBeGreaterThan(Date.now() / 1000);
        });

        it("should use integer for amountDG (not wei)", () => {
            const request: WithdrawRequest = {
                walletAddress: "0x1234567890123456789012345678901234567890",
                amountDG: 5000, // 5000 DG tokens as integer
                signature: "0xabc",
                deadline: 1700000000,
            };

            // amountDG should be a simple integer, not a bigint or wei value
            expect(Number.isInteger(request.amountDG)).toBe(true);
            expect(request.amountDG).toBe(5000);
        });
    });

    describe("WithdrawSuccessResponse", () => {
        it("should have success: true", () => {
            const response: WithdrawSuccessResponse = {
                success: true,
                withdrawalId: "uuid-123",
                transactionHash: "0x123abc",
                amountDG: 1000,
            };

            expect(response.success).toBe(true);
            expect(response.withdrawalId).toBeDefined();
            expect(response.transactionHash).toBeDefined();
        });

        it("should optionally include idempotent flag", () => {
            const responseWithIdempotent: WithdrawSuccessResponse = {
                success: true,
                withdrawalId: "uuid-123",
                transactionHash: "0x123abc",
                amountDG: 1000,
                idempotent: true,
            };

            expect(responseWithIdempotent.idempotent).toBe(true);
        });
    });

    describe("WithdrawErrorResponse", () => {
        it("should have success: false and error message", () => {
            const response: WithdrawErrorResponse = {
                success: false,
                error: "Insufficient balance",
            };

            expect(response.success).toBe(false);
            expect(response.error).toBe("Insufficient balance");
        });
    });

    describe("WithdrawResponse", () => {
        it("should be discriminable by success field", () => {
            const successResponse: WithdrawResponse = {
                success: true,
                withdrawalId: "uuid-123",
                transactionHash: "0x123abc",
                amountDG: 1000,
            };

            const errorResponse: WithdrawResponse = {
                success: false,
                error: "Failed",
            };

            // Type narrowing should work
            if (successResponse.success) {
                expect(successResponse.transactionHash).toBeDefined();
            }

            if (!errorResponse.success) {
                expect(errorResponse.error).toBeDefined();
            }
        });
    });

    describe("WithdrawalRecord", () => {
        it("should represent a database withdrawal record", () => {
            const record: WithdrawalRecord = {
                id: "uuid-record-123",
                user_id: "user-uuid",
                user_profile_id: "profile-uuid",
                wallet_address: "0x1234567890123456789012345678901234567890",
                amount_dg: 1000,
                xp_balance_before: 5000,
                signature: "0xabc",
                deadline: 1700000000,
                transaction_hash: "0xdef",
                status: "completed",
                error_message: null,
                created_at: "2024-01-01T00:00:00Z",
                completed_at: "2024-01-01T00:01:00Z",
            };

            expect(record.status).toBe("completed");
            expect(record.error_message).toBeNull();
        });

        it("should support all status types", () => {
            const statuses: WithdrawalRecord["status"][] = [
                "pending",
                "completed",
                "failed",
            ];

            statuses.forEach((status) => {
                const record: WithdrawalRecord = {
                    id: "test",
                    user_id: "test",
                    user_profile_id: null,
                    wallet_address: "0x0",
                    amount_dg: 0,
                    xp_balance_before: 0,
                    signature: "0x0",
                    deadline: 0,
                    transaction_hash: null,
                    status,
                    error_message: null,
                    created_at: "",
                    completed_at: null,
                };

                expect(["pending", "completed", "failed"]).toContain(record.status);
            });
        });

        it("should allow null for optional fields", () => {
            const record: WithdrawalRecord = {
                id: "test",
                user_id: "test",
                user_profile_id: null, // Optional
                wallet_address: "0x0",
                amount_dg: 0,
                xp_balance_before: 0,
                signature: "0x0",
                deadline: 0,
                transaction_hash: null, // Null until completed
                status: "pending",
                error_message: null,
                created_at: "",
                completed_at: null, // Null until completed
            };

            expect(record.user_profile_id).toBeNull();
            expect(record.transaction_hash).toBeNull();
            expect(record.completed_at).toBeNull();
        });
    });

    describe("WithdrawalHistoryResponse", () => {
        it("should include pagination info", () => {
            const response: WithdrawalHistoryResponse = {
                success: true,
                withdrawals: [],
                total: 0,
                limit: 10,
                offset: 0,
            };

            expect(response.total).toBe(0);
            expect(response.limit).toBe(10);
            expect(response.offset).toBe(0);
        });

        it("should contain array of withdrawal records", () => {
            const mockRecord: WithdrawalRecord = {
                id: "test",
                user_id: "test",
                user_profile_id: null,
                wallet_address: "0x0",
                amount_dg: 100,
                xp_balance_before: 500,
                signature: "0x0",
                deadline: 0,
                transaction_hash: "0xabc",
                status: "completed",
                error_message: null,
                created_at: "",
                completed_at: "",
            };

            const response: WithdrawalHistoryResponse = {
                success: true,
                withdrawals: [mockRecord],
                total: 1,
                limit: 10,
                offset: 0,
            };

            expect(response.withdrawals).toHaveLength(1);
            expect(response.withdrawals[0].amount_dg).toBe(100);
        });
    });

    describe("WalletBalanceResponse", () => {
        it("should include balance information when successful", () => {
            const response: WalletBalanceResponse = {
                success: true,
                balances: {
                    dg: 1000,
                    eth: 0.5,
                    dgRaw: "1000000000000000000000",
                    ethRaw: "500000000000000000",
                },
                serverWallet: "0x1234567890123456789012345678901234567890",
            };

            expect(response.success).toBe(true);
            expect(response.balances?.dg).toBe(1000);
            expect(response.balances?.eth).toBe(0.5);
        });

        it("should include alerts for low balances", () => {
            const response: WalletBalanceResponse = {
                success: true,
                balances: {
                    dg: 100,
                    eth: 0.001,
                    dgRaw: "100000000000000000000",
                    ethRaw: "1000000000000000",
                },
                thresholds: {
                    dg: 1000,
                    eth: 0.01,
                },
                alerts: [
                    {
                        type: "low_dg_balance",
                        message: "DG balance below threshold",
                        severity: "warning",
                    },
                    {
                        type: "critically_low_eth",
                        message: "ETH balance critically low",
                        severity: "critical",
                    },
                ],
            };

            expect(response.alerts).toHaveLength(2);
            expect(response.alerts?.[0].severity).toBe("warning");
            expect(response.alerts?.[1].severity).toBe("critical");
        });

        it("should include error on failure", () => {
            const response: WalletBalanceResponse = {
                success: false,
                error: "Failed to fetch balance",
            };

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });
    });
});
