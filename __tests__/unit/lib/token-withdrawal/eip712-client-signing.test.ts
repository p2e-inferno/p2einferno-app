/**
 * Unit Tests for EIP712 Client Signing
 *
 * Tests the signWithdrawalMessage function that generates
 * EIP712 signatures on the client side.
 */

import { signWithdrawalMessage } from "@/lib/token-withdrawal/eip712/client-signing";

// Mock the types module
jest.mock("@/lib/token-withdrawal/eip712/types", () => ({
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

describe("EIP712 Client Signing", () => {
  const mockWalletAddress =
    "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const mockAmountDG = 1000;
  const mockDeadline = BigInt(Math.floor(Date.now() / 1000) + 900);
  const mockSignature =
    "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

  const mockDomain = {
    name: "P2E INFERNO DG PULLOUT",
    version: "1",
    chainId: 84532,
    verifyingContract:
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.ethereum mock
    (global as any).window = undefined;
  });

  afterEach(() => {
    (global as any).window = undefined;
  });

  describe("signWithdrawalMessage", () => {
    it("should sign with native signTypedData when available on provider", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      const result = await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      expect(result).toBe(mockSignature);
      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith({
        domain: mockDomain,
        types: expect.any(Object),
        primaryType: "Withdrawal",
        message: expect.objectContaining({
          user: mockWalletAddress,
          amount: BigInt(mockAmountDG) * BigInt(10 ** 18),
          deadline: mockDeadline,
        }),
      });
    });

    it("should convert DG amount to wei (18 decimals)", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      const expectedAmountWei = BigInt(mockAmountDG) * BigInt(10 ** 18);
      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            amount: expectedAmountWei,
          }),
        }),
      );
    });

    it("should include user address in message", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            user: mockWalletAddress,
          }),
        }),
      );
    });

    it("should include deadline in message", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            deadline: mockDeadline,
          }),
        }),
      );
    });

    it("should prioritize provider.signTypedData over window.ethereum fallback", async () => {
      // If both are available, provider.signTypedData should be used
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      const result = await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      // Provider's signTypedData should be called
      expect(mockSignerProvider.signTypedData).toHaveBeenCalled();
      expect(result).toBe(mockSignature);
    });

    it("should throw error when provider signTypedData fails", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockRejectedValue(new Error("User rejected")),
      };

      await expect(
        signWithdrawalMessage(
          mockWalletAddress,
          mockAmountDG,
          mockDeadline,
          mockSignerProvider,
          mockDomain,
        ),
      ).rejects.toThrow("User rejected");
    });

    it("should use correct domain structure", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      await signWithdrawalMessage(
        mockWalletAddress,
        mockAmountDG,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: mockDomain,
        }),
      );
    });

    it("should handle large DG amounts correctly", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      const largeAmount = 1000000; // 1 million DG

      await signWithdrawalMessage(
        mockWalletAddress,
        largeAmount,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      const expectedAmountWei = BigInt(largeAmount) * BigInt(10 ** 18);
      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            amount: expectedAmountWei,
          }),
        }),
      );
    });

    it("should handle zero DG amount", async () => {
      const mockSignerProvider = {
        signTypedData: jest.fn().mockResolvedValue(mockSignature),
      };

      await signWithdrawalMessage(
        mockWalletAddress,
        0,
        mockDeadline,
        mockSignerProvider,
        mockDomain,
      );

      expect(mockSignerProvider.signTypedData).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            amount: 0n,
          }),
        }),
      );
    });
  });
});
