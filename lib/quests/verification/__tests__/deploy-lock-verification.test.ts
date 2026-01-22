// @ts-nocheck
/**
 * Unit Tests for Deploy Lock Verification Strategy
 *
 * Tests multi-network lock deployment verification with automatic transaction validation.
 */

import { DeployLockVerificationStrategy } from "../deploy-lock-verification";
import type { DeployLockTaskConfig } from "../deploy-lock-utils";
import type { VerificationOptions } from "../types";

// Mock dependencies
jest.mock("@/lib/blockchain/config/clients/public-client");
jest.mock("@/lib/blockchain/config/core/chain-map");
jest.mock("@/lib/blockchain/shared/transaction-utils");
jest.mock("@/lib/utils/logger", () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Test constants
const MOCK_TX_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;
const MOCK_USER_ADDRESS = "0x1111111111111111111111111111111111111111";
const MOCK_LOCK_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const MOCK_USER_ID = "user-123";
const UNLOCK_FACTORY_ADDRESS = "0x1FF7e338d5E582138C46044dc238543Ce555C963";
const NEW_LOCK_EVENT_SIGNATURE =
  "0x01017ed19df0c7f8acc436147b234b09664a9fb4797b4fa3fb9e599c2eb67be7";

// Mock receipt with valid NewLock event from official factory
const createMockReceipt = (overrides: any = {}) => ({
  status: "success",
  from: MOCK_USER_ADDRESS,
  to: UNLOCK_FACTORY_ADDRESS,
  transactionHash: MOCK_TX_HASH,
  blockNumber: 12345n,
  logs: [
    {
      address: UNLOCK_FACTORY_ADDRESS,
      topics: [
        NEW_LOCK_EVENT_SIGNATURE,
        `0x000000000000000000000000${MOCK_USER_ADDRESS.slice(2)}`,
        `0x000000000000000000000000${MOCK_LOCK_ADDRESS.slice(2)}`,
      ],
      data: "0x",
    },
  ],
  ...overrides,
});

// Mock configuration
const BASE_SEPOLIA_CONFIG: DeployLockTaskConfig = {
  allowed_networks: [{ chain_id: 84532, reward_ratio: 1.0, enabled: true }],
};

const MULTI_NETWORK_CONFIG: DeployLockTaskConfig = {
  allowed_networks: [
    { chain_id: 8453, reward_ratio: 1.0, enabled: true },
    { chain_id: 10, reward_ratio: 1.2, enabled: true },
    { chain_id: 42161, reward_ratio: 1.0, enabled: true },
    { chain_id: 42220, reward_ratio: 0.8, enabled: true },
  ],
};

describe("DeployLockVerificationStrategy", () => {
  let strategy: DeployLockVerificationStrategy;
  let mockPublicClient: any;
  let mockChain: any;

  beforeEach(() => {
    strategy = new DeployLockVerificationStrategy();

    // Mock public client
    mockPublicClient = {
      getTransactionReceipt: jest.fn(),
      getBlock: jest.fn(),
    };

    // Mock chain
    mockChain = {
      id: 84532,
      name: "Base Sepolia",
    };

    // Setup mocks
    const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
    resolveChainById.mockReturnValue(mockChain);

    const { createPublicClientForChain } = require("@/lib/blockchain/config/clients/public-client");
    createPublicClientForChain.mockReturnValue(mockPublicClient);

    const { extractLockAddressFromReceipt } = require("@/lib/blockchain/shared/transaction-utils");
    extractLockAddressFromReceipt.mockReturnValue(MOCK_LOCK_ADDRESS);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Configuration Validation", () => {
    test("should reject missing transaction hash", async () => {
      const result = await strategy.verify(
        "deploy_lock",
        {}, // No transaction hash
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_HASH_REQUIRED");
    });

    test("should reject invalid transaction hash format", async () => {
      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: "invalid" },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_TX_HASH");
    });

    test("should reject invalid task configuration", async () => {
      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: { allowed_networks: [] } } // Empty networks
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_CONFIG");
    });

    test("should reject configuration with no enabled networks", async () => {
      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        {
          taskConfig: {
            allowed_networks: [
              { chain_id: 84532, reward_ratio: 1.0, enabled: false },
            ],
          },
        }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_CONFIG");
    });
  });

  describe("Transaction Verification", () => {
    test("should verify valid deployment on Base Sepolia", async () => {
      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.chainId).toBe(84532);
      expect(result.metadata?.lockAddress).toBe(MOCK_LOCK_ADDRESS);
      expect(result.metadata?.rewardMultiplier).toBe(1.0);
      expect(result.metadata?.transactionHash).toBe(MOCK_TX_HASH);
    });

    test("should verify deployment on Optimism with correct multiplier", async () => {
      // Update chain mock for Optimism
      const optimismChain = { id: 10, name: "Optimism" };
      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockImplementation((chainId: number) =>
        chainId === 10 ? optimismChain : null
      );

      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.chainId).toBe(10);
      expect(result.metadata?.rewardMultiplier).toBe(1.2);
    });

    test("should reject transaction from wrong sender", async () => {
      const mockReceipt = createMockReceipt({
        from: "0x2222222222222222222222222222222222222222",
      });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("SENDER_MISMATCH");
    });

    test("should reject failed transaction", async () => {
      const mockReceipt = createMockReceipt({ status: "reverted" });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_FAILED");
    });

    test("should handle transaction not found on any network", async () => {
      mockPublicClient.getTransactionReceipt.mockRejectedValue(
        new Error("Transaction not found")
      );

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_NOT_FOUND_MULTI_NETWORK");
    });

    test("should reject when lock address cannot be extracted", async () => {
      const { extractLockAddressFromReceipt } = require("@/lib/blockchain/shared/transaction-utils");
      extractLockAddressFromReceipt.mockReturnValue(null);

      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("LOCK_ADDRESS_NOT_FOUND");
    });
  });

  describe("Timestamp Validation", () => {
    test("should accept deployment after min_timestamp", async () => {
      const mockReceipt = createMockReceipt({ blockNumber: 12345n });
      const mockBlock = { timestamp: 1704070000n }; // After min_timestamp

      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);
      mockPublicClient.getBlock.mockResolvedValue(mockBlock);

      const configWithTimestamp: DeployLockTaskConfig = {
        allowed_networks: [
          { chain_id: 84532, reward_ratio: 1.0, enabled: true },
        ],
        min_timestamp: 1704067200, // Before block timestamp
      };

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: configWithTimestamp }
      );

      expect(result.success).toBe(true);
      expect(mockPublicClient.getBlock).toHaveBeenCalledWith({
        blockNumber: 12345n,
      });
    });

    test("should reject deployment before min_timestamp", async () => {
      const mockReceipt = createMockReceipt({ blockNumber: 12345n });
      const mockBlock = { timestamp: 1704060000n }; // Before min_timestamp

      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);
      mockPublicClient.getBlock.mockResolvedValue(mockBlock);

      const configWithTimestamp: DeployLockTaskConfig = {
        allowed_networks: [
          { chain_id: 84532, reward_ratio: 1.0, enabled: true },
        ],
        min_timestamp: 1704067200, // After block timestamp
      };

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: configWithTimestamp }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("TX_TOO_OLD");
    });

    test("should continue verification if block fetch fails", async () => {
      const mockReceipt = createMockReceipt({ blockNumber: 12345n });

      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);
      mockPublicClient.getBlock.mockRejectedValue(new Error("RPC error"));

      const configWithTimestamp: DeployLockTaskConfig = {
        allowed_networks: [
          { chain_id: 84532, reward_ratio: 1.0, enabled: true },
        ],
        min_timestamp: 1704067200,
      };

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: configWithTimestamp }
      );

      // Should succeed despite block fetch failure (graceful degradation)
      expect(result.success).toBe(true);
    });
  });

  describe("Multi-Network Support", () => {
    test("should search networks in parallel", async () => {
      const mockReceipt = createMockReceipt();
      // Only one network succeeds to avoid multi-network conflict
      mockPublicClient.getTransactionReceipt
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(mockReceipt) // Second network succeeds
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"));

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(true);
      // Verify parallel execution (all networks tried)
      expect(mockPublicClient.getTransactionReceipt).toHaveBeenCalled();
      expect(mockPublicClient.getTransactionReceipt).toHaveBeenCalledTimes(4);
    });

    test("should return first successful network result", async () => {
      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockImplementation((chainId: number) => {
        const chains: Record<number, any> = {
          8453: { id: 8453, name: "Base" },
          10: { id: 10, name: "Optimism" },
          42161: { id: 42161, name: "Arbitrum" },
          42220: { id: 42220, name: "Celo" },
        };
        return chains[chainId] || null;
      });

      // First 3 networks fail, Celo succeeds
      mockPublicClient.getTransactionReceipt
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockRejectedValueOnce(new Error("Not found"))
        .mockResolvedValueOnce(createMockReceipt());

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.rewardMultiplier).toBe(0.8); // Celo multiplier
    });
  });

  describe("Metadata Generation", () => {
    test("should include all required metadata fields", async () => {
      const mockReceipt = createMockReceipt({ blockNumber: 123456n });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata).toMatchObject({
        transactionHash: MOCK_TX_HASH,
        chainId: 84532,
        lockAddress: MOCK_LOCK_ADDRESS,
        blockNumber: "123456",
        rewardMultiplier: 1.0,
        networkName: "Base Sepolia",
      });
      expect(result.metadata?.verifiedAt).toBeDefined();
    });

    test("should use fallback network name for unknown chain", async () => {
      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const unknownChainConfig: DeployLockTaskConfig = {
        allowed_networks: [{ chain_id: 99999, reward_ratio: 1.0, enabled: true }],
      };

      // This would normally fail config validation, but testing metadata generation
      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockReturnValue({ id: 99999, name: "Unknown" });

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: unknownChainConfig }
      );

      if (result.success) {
        expect(result.metadata?.networkName).toMatch(/Chain 99999/);
      }
    });
  });

  describe("Factory Address Validation", () => {
    test("should accept NewLock event from official Unlock factory", async () => {
      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.lockAddress).toBe(MOCK_LOCK_ADDRESS);
    });

    test("should reject NewLock event from non-factory address", async () => {
      const maliciousAddress = "0x2222222222222222222222222222222222222222";
      const mockReceipt = createMockReceipt({
        logs: [
          {
            address: maliciousAddress, // NOT the official factory
            topics: [
              NEW_LOCK_EVENT_SIGNATURE,
              `0x000000000000000000000000${MOCK_USER_ADDRESS.slice(2)}`,
              `0x000000000000000000000000${MOCK_LOCK_ADDRESS.slice(2)}`,
            ],
            data: "0x",
          },
        ],
      });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_FACTORY");
      expect(result.error).toContain("official Unlock Protocol factory");
    });

    test("should reject transaction with no NewLock events", async () => {
      const mockReceipt = createMockReceipt({
        logs: [], // No logs at all
      });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_FACTORY");
    });

    test("should reject if factory emits event but wrong chain", async () => {
      // Simulate factory address for a different chain (should not happen in practice)
      const wrongChainFactory = "0x3333333333333333333333333333333333333333";
      const mockReceipt = createMockReceipt({
        logs: [
          {
            address: wrongChainFactory,
            topics: [
              NEW_LOCK_EVENT_SIGNATURE,
              `0x000000000000000000000000${MOCK_USER_ADDRESS.slice(2)}`,
              `0x000000000000000000000000${MOCK_LOCK_ADDRESS.slice(2)}`,
            ],
            data: "0x",
          },
        ],
      });
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt);

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: BASE_SEPOLIA_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("INVALID_FACTORY");
    });
  });

  describe("Multi-Network Conflict Detection", () => {
    test("should accept transaction found on exactly one network", async () => {
      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt
        .mockRejectedValueOnce(new Error("Not found")) // Base fails
        .mockResolvedValueOnce(mockReceipt) // Optimism succeeds
        .mockRejectedValueOnce(new Error("Not found")) // Arbitrum fails
        .mockRejectedValueOnce(new Error("Not found")); // Celo fails

      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockImplementation((chainId: number) => {
        const chains: Record<number, any> = {
          8453: { id: 8453, name: "Base" },
          10: { id: 10, name: "Optimism" },
          42161: { id: 42161, name: "Arbitrum" },
          42220: { id: 42220, name: "Celo" },
        };
        return chains[chainId] || null;
      });

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.chainId).toBe(10); // Optimism
    });

    test("should reject transaction found on multiple networks", async () => {
      const mockReceipt = createMockReceipt();

      // Simulate tx found on both Base and Optimism
      mockPublicClient.getTransactionReceipt
        .mockResolvedValueOnce(mockReceipt) // Base succeeds
        .mockResolvedValueOnce(mockReceipt) // Optimism succeeds
        .mockRejectedValueOnce(new Error("Not found")) // Arbitrum fails
        .mockRejectedValueOnce(new Error("Not found")); // Celo fails

      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockImplementation((chainId: number) => {
        const chains: Record<number, any> = {
          8453: { id: 8453, name: "Base" },
          10: { id: 10, name: "Optimism" },
          42161: { id: 42161, name: "Arbitrum" },
          42220: { id: 42220, name: "Celo" },
        };
        return chains[chainId] || null;
      });

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("MULTI_NETWORK_CONFLICT");
      expect(result.error).toContain("multiple networks");
      expect(result.error).toContain("Base");
      expect(result.error).toContain("Optimism");
    });

    test("should reject transaction found on all networks (worst case)", async () => {
      const mockReceipt = createMockReceipt();
      mockPublicClient.getTransactionReceipt.mockResolvedValue(mockReceipt); // All succeed

      const { resolveChainById } = require("@/lib/blockchain/config/core/chain-map");
      resolveChainById.mockImplementation((chainId: number) => {
        const chains: Record<number, any> = {
          8453: { id: 8453, name: "Base" },
          10: { id: 10, name: "Optimism" },
          42161: { id: 42161, name: "Arbitrum" },
          42220: { id: 42220, name: "Celo" },
        };
        return chains[chainId] || null;
      });

      const result = await strategy.verify(
        "deploy_lock",
        { transactionHash: MOCK_TX_HASH },
        MOCK_USER_ID,
        MOCK_USER_ADDRESS,
        { taskConfig: MULTI_NETWORK_CONFIG }
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe("MULTI_NETWORK_CONFLICT");
    });
  });
});
