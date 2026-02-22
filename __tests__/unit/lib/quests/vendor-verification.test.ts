/**
 * TDD Tests for Vendor Verification Strategy
 *
 * These tests define the expected behavior for quest verification.
 * Tests will FAIL until lib/quests/verification/vendor-verification.ts is implemented.
 */

import { decodeEventLog, type Address, type PublicClient } from "viem";
import type { VerificationResult } from "@/lib/quests/verification/types";

type VendorVerificationStrategyCtor = new (client: PublicClient) => {
  verify: (...args: unknown[]) => Promise<VerificationResult>;
};

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

// Mock viem for decodeEventLog
jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  decodeEventLog: jest.fn(),
}));

describe("VendorVerificationStrategy", () => {
  const mockVendorAddress =
    "0x000000000000000000000000000000000000dEaD" as Address;
  const mockUserAddress =
    "0x000000000000000000000000000000000000bEEF" as Address;
  const mockTxHash =
    "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`;
  const originalVendorAddress = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS;

  // Will fail until implemented
  let VendorVerificationStrategy: VendorVerificationStrategyCtor | undefined;

  const getStrategy = (): VendorVerificationStrategyCtor => {
    if (!VendorVerificationStrategy) {
      throw new Error("VendorVerificationStrategy not loaded");
    }
    return VendorVerificationStrategy;
  };

  const createMockPublicClient = (
    overrides: Partial<PublicClient> = {},
  ): PublicClient =>
    ({
      getTransactionReceipt: jest.fn(),
      readContract: jest.fn(),
      ...overrides,
    }) as unknown as PublicClient;

  beforeAll(async () => {
    // Set env var for tests
    process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS = mockVendorAddress;

    try {
      const mod = await import("@/lib/quests/verification/vendor-verification");
      VendorVerificationStrategy =
        mod.VendorVerificationStrategy as VendorVerificationStrategyCtor;
    } catch {
      // Expected to fail until implemented
    }
  });

  afterAll(() => {
    if (originalVendorAddress === undefined) {
      delete process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS;
      return;
    }
    process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS = originalVendorAddress;
  });

  describe("Constructor", () => {
    it("should accept a PublicClient in constructor", () => {
      expect(VendorVerificationStrategy).toBeDefined();
      const client = createMockPublicClient();
      const strategy = new (getStrategy())(client);
      expect(strategy).toBeDefined();
    });
  });

  describe("verify() - vendor_buy", () => {
    it("should verify a valid buy transaction", async () => {
      (decodeEventLog as jest.Mock).mockReturnValue({
        eventName: "TokensPurchased",
        args: {
          buyer: mockUserAddress,
          baseTokenAmount: 100n,
          swapTokenAmount: 200n,
        },
      });

      const client = createMockPublicClient({
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: "success",
          to: mockVendorAddress,
          from: mockUserAddress,
          logs: [
            { address: mockVendorAddress, topics: ["0xKEY"], data: "0xDATA" },
          ],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_buy",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(true);
    });

    it("should fail if transaction hash is missing", async () => {
      const client = createMockPublicClient();
      const strategy = new (getStrategy())(client);

      const result = await strategy.verify(
        "vendor_buy",
        {},
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Transaction hash required");
    });

    it("should fail if transaction was not to vendor contract", async () => {
      const client = createMockPublicClient({
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: "success",
          to: "0x000000000000000000000000000000000000c0de",
          from: mockUserAddress,
          logs: [],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_buy",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Transaction not with Vendor contract");
    });

    it("should fail if transaction sender does not match user", async () => {
      const client = createMockPublicClient({
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: "success",
          to: mockVendorAddress,
          from: "0x000000000000000000000000000000000000c0de",
          logs: [],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_buy",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
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
          logs: [],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_buy",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Transaction failed");
    });
  });

  describe("verify() - vendor_sell", () => {
    it("should verify a valid sell transaction", async () => {
      (decodeEventLog as jest.Mock).mockReturnValue({
        eventName: "TokensSold",
        args: {
          seller: mockUserAddress,
          baseTokenAmount: 100n,
          swapTokenAmount: 200n,
        },
      });

      const client = createMockPublicClient({
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: "success",
          to: mockVendorAddress,
          from: mockUserAddress,
          logs: [
            { address: mockVendorAddress, topics: ["0xKEY"], data: "0xDATA" },
          ],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_sell",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("verify() - vendor_light_up", () => {
    it("should verify a valid light up transaction", async () => {
      (decodeEventLog as jest.Mock).mockReturnValue({
        eventName: "Lit",
        args: {
          user: mockUserAddress,
        },
      });

      const client = createMockPublicClient({
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: "success",
          to: mockVendorAddress,
          from: mockUserAddress,
          logs: [
            { address: mockVendorAddress, topics: ["0xKEY"], data: "0xDATA" },
          ],
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_light_up",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("verify() - vendor_level_up", () => {
    it("should verify user has reached target stage", async () => {
      const client = createMockPublicClient({
        readContract: jest.fn().mockResolvedValue({
          stage: 2, // target is 2
          points: 1000n,
          fuel: 500n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_level_up",
        {},
        "user-123",
        mockUserAddress,
        { taskConfig: { target_stage: 2 } },
      );

      expect(result.success).toBe(true);
    });

    it("should fail if user has not reached target stage", async () => {
      const client = createMockPublicClient({
        readContract: jest.fn().mockResolvedValue({
          stage: 1, // target is 3
          points: 500n,
          fuel: 200n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_level_up",
        {},
        "user-123",
        mockUserAddress,
        { taskConfig: { target_stage: 3 } },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Current stage 1 < Target 3");
    });

    it("should succeed if user has exceeded target stage", async () => {
      const client = createMockPublicClient({
        readContract: jest.fn().mockResolvedValue({
          stage: 3, // target is 2
          points: 2000n,
          fuel: 1000n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_level_up",
        {},
        "user-123",
        mockUserAddress,
        { taskConfig: { target_stage: 2 } },
      );

      expect(result.success).toBe(true);
    });

    it("should NOT require transaction hash for level_up verification", async () => {
      const client = createMockPublicClient({
        readContract: jest.fn().mockResolvedValue({
          stage: 2,
          points: 0n,
          fuel: 0n,
          lastStage3MaxSale: 0n,
          dailySoldAmount: 0n,
          dailyWindowStart: 0n,
        }),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_level_up",
        {}, // No transactionHash
        "user-123",
        mockUserAddress,
        { taskConfig: { target_stage: 2 } },
      );

      expect(result.success).toBe(true);
    });
  });

  describe("verify() - unsupported type", () => {
    it("should return error for unsupported task type", async () => {
      const client = createMockPublicClient();
      const strategy = new (getStrategy())(client);

      const result = await strategy.verify(
        "unsupported_type" as any,
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unsupported vendor task type");
    });
  });

  describe("Error Handling", () => {
    it("should handle RPC errors gracefully", async () => {
      const client = createMockPublicClient({
        getTransactionReceipt: jest
          .fn()
          .mockRejectedValue(new Error("RPC timeout")),
      });

      const strategy = new (getStrategy())(client);
      const result = await strategy.verify(
        "vendor_buy",
        { transactionHash: mockTxHash },
        "user-123",
        mockUserAddress,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("RPC timeout");
    });
  });
});
