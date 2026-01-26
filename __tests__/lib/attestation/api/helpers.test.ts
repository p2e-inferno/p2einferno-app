/**
 * Unit tests for handleGaslessAttestation helper
 *
 * Tests the generic API helper for server-side attestation handling
 */

import { handleGaslessAttestation } from "@/lib/attestation/api/helpers";

// Mock dependencies
jest.mock("@/lib/attestation/core/delegated", () => ({
  createDelegatedAttestation: jest.fn(),
}));

jest.mock("@/lib/attestation/core/config", () => ({
  isEASEnabled: jest.fn(),
}));

jest.mock("@/lib/attestation/schemas/network-resolver", () => ({
  resolveSchemaUID: jest.fn(),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  getDefaultNetworkName: jest.fn(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const {
  createDelegatedAttestation,
} = require("@/lib/attestation/core/delegated");
const { isEASEnabled } = require("@/lib/attestation/core/config");
const {
  resolveSchemaUID,
} = require("@/lib/attestation/schemas/network-resolver");
const {
  getDefaultNetworkName,
} = require("@/lib/attestation/core/network-config");

describe("handleGaslessAttestation", () => {
  const mockSignature = {
    signature: "0xSignature",
    deadline: 1234567890n,
    attester: "0xAttester",
    recipient: "0xRecipient",
    schemaUid: "0xSchemaUID",
    data: "0xEncodedData",
    expirationTime: 0n,
    revocable: false,
    refUID:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    chainId: 84532,
    network: "base-sepolia",
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    getDefaultNetworkName.mockReturnValue("base-sepolia");
    isEASEnabled.mockReturnValue(true);
    resolveSchemaUID.mockResolvedValue("0xResolvedSchemaUID");

    // Reset environment variables
    delete process.env.EAS_GRACEFUL_DEGRADE;
  });

  describe("when EAS is disabled", () => {
    it("should return success without creating attestation", async () => {
      isEASEnabled.mockReturnValue(false);

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });
  });

  describe("when EAS is enabled but no signature provided", () => {
    it("should return success with graceful degradation enabled", async () => {
      process.env.EAS_GRACEFUL_DEGRADE = "true";

      const result = await handleGaslessAttestation({
        signature: null,
        schemaKey: "milestone_achievement",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });

    it("should return error with graceful degradation disabled", async () => {
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: null,
        schemaKey: "quest_completion",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Attestation signature is required",
      });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });

    it("should use custom gracefulDegrade parameter over env variable", async () => {
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: null,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
        gracefulDegrade: true, // Override env
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe("signature validation", () => {
    it("should reject signature with mismatched recipient", async () => {
      const result = await handleGaslessAttestation({
        signature: { ...mockSignature, recipient: "0xWrongRecipient" },
        schemaKey: "dg_withdrawal",
        recipient: "0xExpectedRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Signature recipient mismatch",
      });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });

    it("should accept signature with matching recipient (case-insensitive)", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: true,
        uid: "0xAttestationUID",
        txHash: "0xTxHash",
      });

      const result = await handleGaslessAttestation({
        signature: { ...mockSignature, recipient: "0xRECIPIENT" }, // Different case
        schemaKey: "xp_renewal",
        recipient: "0xrecipient", // Different case
      });

      expect(result.success).toBe(true);
      expect(createDelegatedAttestation).toHaveBeenCalled();
    });
  });

  describe("schema UID resolution", () => {
    it("should return error when schema UID not found (no graceful degradation)", async () => {
      resolveSchemaUID.mockResolvedValue(null);
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "unknown_schema" as any, // Testing error handling for unknown schema
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Schema UID not configured",
      });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });

    it("should return success when schema UID not found (graceful degradation)", async () => {
      resolveSchemaUID.mockResolvedValue(null);
      process.env.EAS_GRACEFUL_DEGRADE = "true";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "unknown_schema" as any, // Testing error handling for unknown schema
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
      expect(createDelegatedAttestation).not.toHaveBeenCalled();
    });

    it("should use custom network if provided", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: true,
        uid: "0xUID",
        txHash: "0xTx",
      });

      await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
        network: "base-mainnet",
      });

      expect(resolveSchemaUID).toHaveBeenCalledWith(
        "xp_renewal",
        "base-mainnet",
      );
    });
  });

  describe("successful attestation creation", () => {
    it("should create delegated attestation and return UID", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: true,
        uid: "0xAttestationUID",
        txHash: "0xTransactionHash",
      });

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "milestone_task_reward_claim",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: true,
        uid: "0xAttestationUID",
        txHash: "0xTransactionHash",
      });

      expect(createDelegatedAttestation).toHaveBeenCalledWith({
        schemaUid: "0xResolvedSchemaUID",
        recipient: mockSignature.recipient,
        data: mockSignature.data,
        signature: mockSignature.signature,
        deadline: mockSignature.deadline,
        chainId: mockSignature.chainId,
        expirationTime: mockSignature.expirationTime,
        revocable: mockSignature.revocable,
        refUID: mockSignature.refUID,
      });
    });

    it("should handle all signature parameters correctly", async () => {
      const customSignature = {
        ...mockSignature,
        expirationTime: 9999999999n,
        revocable: true,
        refUID: "0xCustomRefUID",
      };

      createDelegatedAttestation.mockResolvedValue({
        success: true,
        uid: "0xUID",
        txHash: "0xTx",
      });

      await handleGaslessAttestation({
        signature: customSignature,
        schemaKey: "quest_task_reward_claim",
        recipient: "0xRecipient",
      });

      expect(createDelegatedAttestation).toHaveBeenCalledWith(
        expect.objectContaining({
          expirationTime: 9999999999n,
          revocable: true,
          refUID: "0xCustomRefUID",
        }),
      );
    });
  });

  describe("failed attestation creation", () => {
    it("should return error when attestation fails (no graceful degradation)", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: false,
        error: "Transaction reverted",
      });
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "dg_config_change",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Transaction reverted",
      });
    });

    it("should return success when attestation fails (graceful degradation)", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: false,
        error: "Gas estimation failed",
      });
      process.env.EAS_GRACEFUL_DEGRADE = "true";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "bootcamp_completion",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
    });

    it("should use default error message if none provided", async () => {
      createDelegatedAttestation.mockResolvedValue({
        success: false,
      });
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Failed to create delegated attestation",
      });
    });
  });

  describe("exception handling", () => {
    it("should catch and return error on exception (no graceful degradation)", async () => {
      createDelegatedAttestation.mockRejectedValue(new Error("Network error"));
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Network error",
      });
    });

    it("should return success on exception (graceful degradation)", async () => {
      createDelegatedAttestation.mockRejectedValue(new Error("RPC timeout"));
      process.env.EAS_GRACEFUL_DEGRADE = "true";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "milestone_achievement",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
    });

    it("should use default error message for exceptions without message", async () => {
      createDelegatedAttestation.mockRejectedValue({});
      process.env.EAS_GRACEFUL_DEGRADE = "false";

      const result = await handleGaslessAttestation({
        signature: mockSignature,
        schemaKey: "quest_completion",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({
        success: false,
        error: "Exception during attestation creation",
      });
    });
  });

  describe("schema-specific graceful degradation", () => {
    it("should use schema-specific flag over global flag", async () => {
      process.env.EAS_GRACEFUL_DEGRADE = "false";
      process.env.XP_RENEWAL_EAS_GRACEFUL_DEGRADE = "true";

      const result = await handleGaslessAttestation({
        signature: null,
        schemaKey: "xp_renewal",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
    });

    it("should fall back to global flag if schema-specific not set", async () => {
      process.env.EAS_GRACEFUL_DEGRADE = "true";
      delete process.env.MILESTONE_ACHIEVEMENT_EAS_GRACEFUL_DEGRADE;

      const result = await handleGaslessAttestation({
        signature: null,
        schemaKey: "milestone_achievement",
        recipient: "0xRecipient",
      });

      expect(result).toEqual({ success: true });
    });
  });
});
