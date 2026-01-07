/**
 * Unit Tests for EIP712 Types
 *
 * Tests the type definitions and domain generation for the DG withdrawal
 * EIP712 signing scheme.
 */

import {
  getWithdrawalDomain,
  WITHDRAWAL_TYPES,
  DG_CONTRACTS_BY_CHAIN,
} from "@/lib/token-withdrawal/eip712/types";

describe("EIP712 Types", () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("WITHDRAWAL_TYPES", () => {
    it("should have correct EIP712Domain structure", () => {
      expect(WITHDRAWAL_TYPES.EIP712Domain).toEqual([
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ]);
    });

    it("should have correct Withdrawal structure", () => {
      expect(WITHDRAWAL_TYPES.Withdrawal).toEqual([
        { name: "user", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ]);
    });

    it("should have exactly 2 type definitions", () => {
      expect(Object.keys(WITHDRAWAL_TYPES)).toHaveLength(2);
    });
  });

  describe("DG_CONTRACTS_BY_CHAIN", () => {
    it("should have entries for Base Mainnet and Base Sepolia", () => {
      expect(DG_CONTRACTS_BY_CHAIN).toHaveProperty("8453"); // Base Mainnet
      expect(DG_CONTRACTS_BY_CHAIN).toHaveProperty("84532"); // Base Sepolia
    });

    it("should reference environment variables for contract addresses", () => {
      // The values come from env vars, so they may be undefined in test
      // Just verify the structure exists
      expect(typeof DG_CONTRACTS_BY_CHAIN[8453]).not.toBe("number");
      expect(typeof DG_CONTRACTS_BY_CHAIN[84532]).not.toBe("number");
    });
  });

  describe("getWithdrawalDomain", () => {
    it("should throw error when contract address is not configured for chain", () => {
      // Use an unsupported chain ID
      const unsupportedChainId = 1; // Ethereum Mainnet - not supported

      expect(() => getWithdrawalDomain(unsupportedChainId)).toThrow(
        `DG token contract not configured for chainId ${unsupportedChainId}`,
      );
    });

    it("should return domain with correct name", () => {
      // Skip if env var not set
      if (!process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA) {
        process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA =
          "0x1234567890123456789012345678901234567890";
      }

      // We need to re-import to pick up the mocked env
      jest.resetModules();
      const {
        getWithdrawalDomain: getDomain,
      } = require("@/lib/token-withdrawal/eip712/types");

      const domain = getDomain(84532);
      expect(domain.name).toBe("P2E INFERNO DG PULLOUT");
    });

    it("should return domain with version 1", () => {
      if (!process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA) {
        process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA =
          "0x1234567890123456789012345678901234567890";
      }

      jest.resetModules();
      const {
        getWithdrawalDomain: getDomain,
      } = require("@/lib/token-withdrawal/eip712/types");

      const domain = getDomain(84532);
      expect(domain.version).toBe("1");
    });

    it("should include the correct chainId in domain", () => {
      if (!process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA) {
        process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA =
          "0x1234567890123456789012345678901234567890";
      }

      jest.resetModules();
      const {
        getWithdrawalDomain: getDomain,
      } = require("@/lib/token-withdrawal/eip712/types");

      const domain = getDomain(84532);
      expect(domain.chainId).toBe(84532);
    });

    it("should include verifying contract address in domain", () => {
      const mockAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
      process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_SEPOLIA = mockAddress;

      jest.resetModules();
      const {
        getWithdrawalDomain: getDomain,
      } = require("@/lib/token-withdrawal/eip712/types");

      const domain = getDomain(84532);
      expect(domain.verifyingContract).toBe(mockAddress);
    });

    it("should work for Base Mainnet when configured", () => {
      const mockAddress = "0x9999999999999999999999999999999999999999";
      process.env.NEXT_PUBLIC_DG_TOKEN_ADDRESS_BASE_MAINNET = mockAddress;

      jest.resetModules();
      const {
        getWithdrawalDomain: getDomain,
      } = require("@/lib/token-withdrawal/eip712/types");

      const domain = getDomain(8453);
      expect(domain.chainId).toBe(8453);
      expect(domain.verifyingContract).toBe(mockAddress);
    });
  });
});
