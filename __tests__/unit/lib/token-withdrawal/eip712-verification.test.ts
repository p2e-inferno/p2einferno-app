/**
 * Unit Tests for EIP712 Server Verification
 *
 * Tests the verifyWithdrawalSignature function that validates
 * user signatures on the server side.
 */

import { verifyWithdrawalSignature } from "@/lib/token-withdrawal/eip712/server-verification";
import type { WithdrawalMessage } from "@/lib/token-withdrawal/eip712/types";
import * as viem from "viem";

// Mock viem's verifyTypedData
jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  verifyTypedData: jest.fn(),
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

// Mock the types module to provide a valid domain
jest.mock("@/lib/token-withdrawal/eip712/types", () => ({
  ...jest.requireActual("@/lib/token-withdrawal/eip712/types"),
  getWithdrawalDomain: jest.fn().mockReturnValue({
    name: "P2E INFERNO DG PULLOUT",
    version: "1",
    chainId: 84532,
    verifyingContract: "0x1234567890123456789012345678901234567890",
  }),
  WITHDRAWAL_TYPES: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    Withdrawal: [
      { name: "user", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
}));

describe("EIP712 Server Verification", () => {
  const mockVerifyTypedData = viem.verifyTypedData as jest.Mock;

  const validMessage: WithdrawalMessage = {
    user: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    amount: 1000n * 10n ** 18n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
  };

  const validSignature =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" as `0x${string}`;

  const chainId = 84532; // Base Sepolia

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyWithdrawalSignature", () => {
    it("should return valid result for a correct signature", async () => {
      mockVerifyTypedData.mockResolvedValue(true);

      const result = await verifyWithdrawalSignature(
        validMessage,
        validSignature,
        chainId,
      );

      expect(result).toEqual({
        valid: true,
        recoveredAddress: validMessage.user,
      });

      expect(mockVerifyTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          address: validMessage.user,
          primaryType: "Withdrawal",
          message: validMessage,
          signature: validSignature,
        }),
      );
    });

    it("should return invalid result for incorrect signature", async () => {
      mockVerifyTypedData.mockResolvedValue(false);

      const result = await verifyWithdrawalSignature(
        validMessage,
        validSignature,
        chainId,
      );

      expect(result).toEqual({
        valid: false,
        error: "Invalid signature",
      });
    });

    it("should handle verification errors gracefully", async () => {
      mockVerifyTypedData.mockRejectedValue(new Error("Signature malformed"));

      const result = await verifyWithdrawalSignature(
        validMessage,
        validSignature,
        chainId,
      );

      expect(result).toEqual({
        valid: false,
        error: "Signature malformed",
      });
    });

    it("should handle non-Error exceptions", async () => {
      mockVerifyTypedData.mockRejectedValue("Unknown exception");

      const result = await verifyWithdrawalSignature(
        validMessage,
        validSignature,
        chainId,
      );

      expect(result).toEqual({
        valid: false,
        error: "Unknown error",
      });
    });

    it("should include chainId as BigInt in domain", async () => {
      mockVerifyTypedData.mockResolvedValue(true);

      await verifyWithdrawalSignature(validMessage, validSignature, chainId);

      expect(mockVerifyTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: expect.objectContaining({
            chainId: BigInt(84532),
          }),
        }),
      );
    });

    it("should pass the complete withdrawal message structure", async () => {
      mockVerifyTypedData.mockResolvedValue(true);

      const testMessage: WithdrawalMessage = {
        user: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`,
        amount: 5000n * 10n ** 18n,
        deadline: 1700000000n,
      };

      await verifyWithdrawalSignature(testMessage, validSignature, chainId);

      expect(mockVerifyTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          address: testMessage.user,
          message: testMessage,
        }),
      );
    });

    it("should work with different chain IDs", async () => {
      mockVerifyTypedData.mockResolvedValue(true);

      // Test with Base Mainnet
      const mainnetChainId = 8453;
      await verifyWithdrawalSignature(
        validMessage,
        validSignature,
        mainnetChainId,
      );

      expect(mockVerifyTypedData).toHaveBeenCalled();
    });
  });
});
