/**
 * Unit tests for useGaslessAttestation hook
 *
 * Tests the generic gasless attestation signing hook
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useGaslessAttestation } from "@/hooks/attestation/useGaslessAttestation";
import { EAS } from "@ethereum-attestation-service/eas-sdk";

// Mock dependencies
let __MOCK_SCHEMA_DEFINITION__: string | null = null;
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: __MOCK_SCHEMA_DEFINITION__
                    ? { schema_definition: __MOCK_SCHEMA_DEFINITION__ }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

jest.mock("@privy-io/react-auth", () => ({
  useWallets: jest.fn(),
}));

jest.mock("ethers", () => ({
  ethers: {
    BrowserProvider: jest.fn(),
    Signature: {
      from: jest.fn(),
    },
  },
}));

jest.mock("@ethereum-attestation-service/eas-sdk", () => ({
  EAS: jest.fn(),
  SchemaEncoder: jest.fn(),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  resolveNetworkConfig: jest.fn(),
  getDefaultNetworkName: jest.fn(),
}));

jest.mock("@/lib/attestation/schemas/network-resolver", () => ({
  resolveSchemaUID: jest.fn(),
}));

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const { useWallets } = require("@privy-io/react-auth");
const {
  resolveNetworkConfig,
  getDefaultNetworkName,
} = require("@/lib/attestation/core/network-config");
const {
  resolveSchemaUID,
} = require("@/lib/attestation/schemas/network-resolver");

describe("useGaslessAttestation", () => {
  const mockSchemaData = [
    { name: "userAddress", value: "0x123", type: "address" as const },
    { name: "amount", value: "100", type: "uint256" as const },
  ];

  const mockNetworkConfig = {
    chainId: 84532,
    easContractAddress: "0xEASContract",
  };

  const mockWallet = {
    getEthereumProvider: jest.fn(),
  };

  const mockSigner = {
    getAddress: jest
      .fn()
      .mockResolvedValue("0x1234567890123456789012345678901234567890"),
  };

  const mockProvider = {};

  const mockEthersProvider = {
    getSigner: jest.fn().mockResolvedValue(mockSigner),
  };

  const mockDelegated = {
    signDelegatedAttestation: jest.fn(),
  };

  const mockEASInstance = {
    connect: jest.fn(),
    getDelegated: jest.fn().mockResolvedValue(mockDelegated),
  };

  const mockSchemaEncoder = {
    encodeData: jest.fn().mockReturnValue("0xEncodedData"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __MOCK_SCHEMA_DEFINITION__ = null;

    // Setup default mocks
    getDefaultNetworkName.mockReturnValue("base-sepolia");
    resolveNetworkConfig.mockResolvedValue(mockNetworkConfig);
    resolveSchemaUID.mockResolvedValue("0xSchemaUID123");

    mockWallet.getEthereumProvider.mockResolvedValue(mockProvider);
    (EAS as jest.MockedClass<typeof EAS>).mockImplementation(
      () => mockEASInstance as any,
    );

    // Mock ethers - already mocked at module level, just set up return values
    const { ethers } = require("ethers");
    ethers.BrowserProvider = jest
      .fn()
      .mockImplementation(() => mockEthersProvider);
    ethers.Signature.from = jest
      .fn()
      .mockReturnValue({ serialized: "0xSignatureSerialized" });

    // Mock SchemaEncoder
    const { SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
    (SchemaEncoder as jest.Mock).mockImplementation(() => mockSchemaEncoder);
  });

  describe("when wallet is connected", () => {
    beforeEach(() => {
      useWallets.mockReturnValue({ wallets: [mockWallet] });
    });

    it("should successfully sign attestation with string signature", async () => {
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: "0xStringSignature",
      });

      const { result } = renderHook(() => useGaslessAttestation());

      let signatureResult: any;

      await act(async () => {
        signatureResult = await result.current.signAttestation({
          schemaKey: "xp_renewal",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
        });
      });

      expect(signatureResult).toMatchObject({
        signature: "0xStringSignature",
        attester: "0x1234567890123456789012345678901234567890",
        recipient: "0xRecipient",
        schemaUid: "0xSchemaUID123",
        data: "0xEncodedData",
        chainId: 84532,
        network: "base-sepolia",
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should successfully sign attestation with {v,r,s} signature format", async () => {
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: { v: 27, r: "0xR", s: "0xS" },
      });

      const { result } = renderHook(() => useGaslessAttestation());

      let signatureResult: any;

      await act(async () => {
        signatureResult = await result.current.signAttestation({
          schemaKey: "milestone_achievement",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
          deadlineSecondsFromNow: 7200,
          expirationTime: 0n,
          revocable: false,
        });
      });

      expect(signatureResult.signature).toBe("0xSignatureSerialized");
      expect(result.current.isSigning).toBe(false);
    });

    it("should set isSigning to true during signing", async () => {
      let resolveSign: any;
      const signPromise = new Promise((resolve) => {
        resolveSign = resolve;
      });

      mockDelegated.signDelegatedAttestation.mockReturnValue(signPromise);

      const { result } = renderHook(() => useGaslessAttestation());

      act(() => {
        result.current.signAttestation({
          schemaKey: "quest_completion",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
        });
      });

      // Wait a bit for the promise to start
      await waitFor(() => {
        expect(result.current.isSigning).toBe(true);
      });

      // Resolve the signing
      await act(async () => {
        resolveSign({ signature: "0xSig" });
        await signPromise;
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should encode schema data correctly", async () => {
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: "0xSig",
      });
      __MOCK_SCHEMA_DEFINITION__ = "address userAddress,uint256 amount";

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await result.current.signAttestation({
          schemaKey: "dg_withdrawal",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
        });
      });

      const {
        SchemaEncoder,
      } = require("@ethereum-attestation-service/eas-sdk");
      expect(SchemaEncoder).toHaveBeenCalledWith(
        "address userAddress,uint256 amount",
      );
      expect(mockSchemaEncoder.encodeData).toHaveBeenCalledWith([
        { name: "userAddress", value: "0x123", type: "address" },
        { name: "amount", value: "100", type: "uint256" },
      ]);
    });

    it("should throw when schemaData does not match DB schema_definition", async () => {
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: "0xSig",
      });
      __MOCK_SCHEMA_DEFINITION__ =
        "address userAddress,uint256 amount,uint256 extra";

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "dg_withdrawal",
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
          }),
        ).rejects.toThrow(
          "Schema definition mismatch for 'dg_withdrawal' on 'base-sepolia'",
        );
      });
    });
  });

  describe("error handling", () => {
    it("should throw error when no wallet is connected", async () => {
      useWallets.mockReturnValue({ wallets: [] });

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "xp_renewal",
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
          }),
        ).rejects.toThrow("No wallet connected");
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should throw error when network config is not found", async () => {
      useWallets.mockReturnValue({ wallets: [mockWallet] });
      resolveNetworkConfig.mockResolvedValue(null);

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "xp_renewal",
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
            network: "invalid-network",
          }),
        ).rejects.toThrow("Network invalid-network not configured");
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should throw error when schema UID is not found", async () => {
      useWallets.mockReturnValue({ wallets: [mockWallet] });
      resolveSchemaUID.mockResolvedValue(null);

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "unknown_schema" as any, // Testing error handling for unknown schema
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
          }),
        ).rejects.toThrow(
          "Schema UID not found for key 'unknown_schema' on network 'base-sepolia'",
        );
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should throw error when provider is not available", async () => {
      const walletNoProvider = {
        getEthereumProvider: jest.fn().mockResolvedValue(null),
      };
      useWallets.mockReturnValue({ wallets: [walletNoProvider] });

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "xp_renewal",
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
          }),
        ).rejects.toThrow("Failed to get Ethereum provider from wallet");
      });

      expect(result.current.isSigning).toBe(false);
    });

    it("should throw error on unexpected signature format", async () => {
      useWallets.mockReturnValue({ wallets: [mockWallet] });
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: 12345, // Invalid format
      });

      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await expect(
          result.current.signAttestation({
            schemaKey: "xp_renewal",
            recipient: "0xRecipient",
            schemaData: mockSchemaData,
          }),
        ).rejects.toThrow("Unexpected signature format from EAS SDK");
      });

      expect(result.current.isSigning).toBe(false);
    });
  });

  describe("custom parameters", () => {
    beforeEach(() => {
      useWallets.mockReturnValue({ wallets: [mockWallet] });
      mockDelegated.signDelegatedAttestation.mockResolvedValue({
        signature: "0xSig",
      });
    });

    it("should use custom deadline", async () => {
      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await result.current.signAttestation({
          schemaKey: "xp_renewal",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
          deadlineSecondsFromNow: 7200,
        });
      });

      const callArgs = mockDelegated.signDelegatedAttestation.mock.calls[0][0];
      expect(callArgs.deadline).toBeDefined();
    });

    it("should use custom expiration time and revocable flag", async () => {
      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await result.current.signAttestation({
          schemaKey: "xp_renewal",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
          expirationTime: 1234567890n,
          revocable: true,
        });
      });

      const callArgs = mockDelegated.signDelegatedAttestation.mock.calls[0][0];
      expect(callArgs.expirationTime).toBe(1234567890n);
      expect(callArgs.revocable).toBe(true);
    });

    it("should use custom refUID", async () => {
      const customRefUID = "0xCustomRefUID123";
      const { result } = renderHook(() => useGaslessAttestation());

      await act(async () => {
        await result.current.signAttestation({
          schemaKey: "xp_renewal",
          recipient: "0xRecipient",
          schemaData: mockSchemaData,
          refUID: customRefUID,
        });
      });

      const callArgs = mockDelegated.signDelegatedAttestation.mock.calls[0][0];
      expect(callArgs.refUID).toBe(customRefUID);
    });
  });
});
