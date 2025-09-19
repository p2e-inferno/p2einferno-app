import { AttestationService } from "@/lib/attestation/core/service";
import { supabase } from "@/lib/supabase";

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn(),
      })),
    })),
  },
}));

// Mock EAS SDK
jest.mock("@ethereum-attestation-service/eas-sdk", () => ({
  EAS: jest.fn().mockImplementation(() => ({
    connect: jest.fn(),
    attest: jest.fn().mockResolvedValue("0x123456789"),
  })),
  SchemaEncoder: jest.fn().mockImplementation(() => ({
    encodeData: jest.fn().mockReturnValue("0xencodeddata"),
  })),
}));

// Mock ethers
jest.mock("ethers", () => {
  const mockAbiCoder = {
    encode: jest.fn().mockReturnValue("0xencodeddata"),
  };

  return {
    ethers: {
      BrowserProvider: jest.fn().mockImplementation(() => ({
        getSigner: jest.fn().mockResolvedValue({}),
      })),
      Contract: jest.fn().mockImplementation(() => ({
        revoke: jest.fn().mockResolvedValue({
          hash: "0xrevokehash",
          wait: jest.fn().mockResolvedValue({ status: 1 }),
        }),
        attest: jest.fn().mockResolvedValue({
          hash: "0xattesthash",
        }),
      })),
      AbiCoder: {
        defaultAbiCoder: jest.fn(() => mockAbiCoder),
      },
      ZeroAddress: "0x0000000000000000000000000000000000000000",
    },
  };
});

describe("AttestationService", () => {
  let service: AttestationService;
  let mockWallet: any;

  beforeEach(() => {
    service = new AttestationService();
    mockWallet = {
      address: "0x1234567890123456789012345678901234567890",
      getEthereumProvider: jest.fn().mockResolvedValue({}),
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe("createAttestation", () => {
    test("creates attestation successfully", async () => {
      // Mock schema retrieval
      const mockSchema = {
        schema_definition:
          "address walletAddress,string greeting,uint256 timestamp",
        revocable: true,
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockResolvedValue({ data: mockSchema, error: null }),
          }),
        }),
      });

      // Mock existing attestation check (none found)
      const mockFrom = jest.fn();
      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest
                .fn()
                .mockResolvedValue({ data: mockSchema, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest
                    .fn()
                    .mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({ error: null }),
        });

      (supabase.from as jest.Mock) = mockFrom;

      const params = {
        schemaUid: "0xtest_schema",
        recipient: "0x1234567890123456789012345678901234567890",
        data: {
          walletAddress: "0x1234567890123456789012345678901234567890",
          greeting: "GM",
          timestamp: 1234567890,
        },
        wallet: mockWallet,
      };

      const result = await service.createAttestation(params);

      expect(result.success).toBe(true);
      expect(result.attestationUid).toBeDefined();
      expect(result.transactionHash).toBeDefined();
    });

    test("fails when wallet is not connected", async () => {
      const params = {
        schemaUid: "0xtest_schema",
        recipient: "0x1234567890123456789012345678901234567890",
        data: {},
        wallet: null,
      };

      const result = await service.createAttestation(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Wallet not connected");
    });

    test("fails when schema is not found", async () => {
      // Mock schema not found
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest
              .fn()
              .mockResolvedValue({ data: null, error: new Error("Not found") }),
          }),
        }),
      });

      const params = {
        schemaUid: "0xnonexistent_schema",
        recipient: "0x1234567890123456789012345678901234567890",
        data: {},
        wallet: mockWallet,
      };

      const result = await service.createAttestation(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Schema not found");
    });

    test("prevents duplicate attestations", async () => {
      // Mock schema retrieval
      const mockSchema = {
        schema_definition: "address walletAddress,string greeting",
        revocable: true,
      };

      // Mock existing attestation found
      const mockFrom = jest.fn();
      mockFrom
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest
                .fn()
                .mockResolvedValue({ data: mockSchema, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: "existing" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

      (supabase.from as jest.Mock) = mockFrom;

      const params = {
        schemaUid: "0xtest_schema",
        recipient: "0x1234567890123456789012345678901234567890",
        data: {},
        wallet: mockWallet,
      };

      const result = await service.createAttestation(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "You have already created an attestation for this schema",
      );
    });
  });

  describe("revokeAttestation", () => {
    test("revokes attestation successfully", async () => {
      // Mock successful database update
      (supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ error: null }),
        }),
      });

      const params = {
        schemaUid: "0xtest_schema",
        attestationUid: "0xtest_attestation",
        wallet: mockWallet,
      };

      const result = await service.revokeAttestation(params);

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe("0xrevokehash");
    });

    test("fails when wallet is not connected", async () => {
      const params = {
        schemaUid: "0xtest_schema",
        attestationUid: "0xtest_attestation",
        wallet: null,
      };

      const result = await service.revokeAttestation(params);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Wallet not connected");
    });
  });

  describe("getAttestations", () => {
    test("retrieves attestations for recipient", async () => {
      const mockAttestations = [
        {
          id: "1",
          attestation_uid: "0xuid1",
          recipient: "0x1234567890123456789012345678901234567890",
          attestation_schemas: { name: "Test Schema" },
        },
      ];

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: mockAttestations,
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await service.getAttestations(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual(mockAttestations);
    });

    test("handles database errors gracefully", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({
                data: null,
                error: new Error("Database error"),
              }),
            }),
          }),
        }),
      });

      const result = await service.getAttestations(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual([]);
    });

    test("filters by schema UID when provided", async () => {
      const response = { data: [], error: null };
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) => resolve?.(response)),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await service.getAttestations(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(queryBuilder.eq).toHaveBeenNthCalledWith(
        1,
        "recipient",
        "0x1234567890123456789012345678901234567890",
      );
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(2, "is_revoked", false);
      expect(queryBuilder.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(
        3,
        "schema_uid",
        "0xtest_schema",
      );
    });
  });
});
