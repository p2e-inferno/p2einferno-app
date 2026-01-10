import {
  getUserAttestations,
  getAttestationsBySchema,
  getAttestationByUid,
  hasUserAttestation,
  hasUserAttestationBySchemaKey,
  getUserDailyCheckinStreak,
  getUserAttestationCount,
  getRecentAttestations,
  getSchemaStatistics,
} from "@/lib/attestation/database/queries";
import { supabase } from "@/lib/supabase";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock resolveSchemaUID for dynamic schema lookup tests
jest.mock("@/lib/attestation/schemas/network-resolver", () => ({
  resolveSchemaUID: jest.fn(),
}));

describe("attestation database queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUserAttestations", () => {
    test("retrieves user attestations with default options", async () => {
      const mockAttestations = [
        {
          id: "1",
          attestation_uid: "0xuid1",
          recipient: "0x1234567890123456789012345678901234567890",
          attestation_schemas: { name: "Daily Checkin" },
        },
      ];

      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: mockAttestations,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestations(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual(mockAttestations);
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("filters by schema UID when provided", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        then: jest
          .fn()
          .mockImplementation((resolve) => resolve({ data: [], error: null })),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getUserAttestations("0x1234567890123456789012345678901234567890", {
        schemaUid: "0xtest_schema",
      });

      expect(queryBuilder.eq).toHaveBeenCalledWith(
        "schema_uid",
        "0xtest_schema",
      );
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("applies limit and offset when provided", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        limit: jest.fn().mockImplementation(() => queryBuilder),
        range: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getUserAttestations("0x1234567890123456789012345678901234567890", {
        limit: 10,
        offset: 20,
      });

      expect(queryBuilder.range).toHaveBeenCalledWith(20, 29);
    });

    test("handles database errors gracefully", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Database error"),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestations(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual([]);
    });
  });

  describe("getAttestationsBySchema", () => {
    test("retrieves attestations by schema UID", async () => {
      const mockAttestations = [
        {
          id: "1",
          schema_uid: "0xtest_schema",
          attestation_schemas: { name: "Test Schema" },
        },
      ];

      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: mockAttestations,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getAttestationsBySchema("0xtest_schema");

      expect(result).toEqual(mockAttestations);
      expect(queryBuilder.eq).toHaveBeenCalledWith(
        "schema_uid",
        "0xtest_schema",
      );
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("applies limit when provided", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getAttestationsBySchema("0xtest_schema", { limit: 5 });

      expect(queryBuilder.limit).toHaveBeenCalledWith(5);
    });
  });

  describe("getAttestationByUid", () => {
    test("retrieves single attestation by UID", async () => {
      const mockAttestation = {
        id: "1",
        attestation_uid: "0xtest_uid",
        attestation_schemas: { name: "Test Schema" },
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockAttestation,
              error: null,
            }),
          }),
        }),
      });

      const result = await getAttestationByUid("0xtest_uid");

      expect(result).toEqual(mockAttestation);
    });

    test("returns null when attestation not found", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: new Error("Not found"),
            }),
          }),
        }),
      });

      const result = await getAttestationByUid("0xnonexistent");

      expect(result).toBeNull();
    });
  });

  describe("hasUserAttestation", () => {
    test("returns true when user has attestation", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        single: jest.fn().mockResolvedValue({
          data: { id: "exists" },
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await hasUserAttestation(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(true);
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("returns false when user has no attestation", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Not found"),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await hasUserAttestation(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(false);
    });
  });

  describe("getUserDailyCheckinStreak", () => {
    const mockSchemaUid = "0x" + "a".repeat(64);

    beforeEach(() => {
      // Mock resolveSchemaUID to return a valid schema UID
      (resolveSchemaUID as jest.Mock).mockResolvedValue(mockSchemaUid);
    });

    test("resolves schema UID before querying", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        gte: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(resolveSchemaUID).toHaveBeenCalledWith(
        "daily_checkin",
        "base-sepolia",
      );
      expect(queryBuilder.eq).toHaveBeenCalledWith("schema_uid", mockSchemaUid);
    });

    test("calculates streak correctly for consecutive days", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const mockCheckins = [
        { created_at: now.toISOString() },
        { created_at: yesterday.toISOString() },
        { created_at: twoDaysAgo.toISOString() },
      ];

      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        gte: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: mockCheckins,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(3);
    });

    test("returns 0 for no check-ins", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        gte: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(0);
    });

    test("handles database errors gracefully", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        gte: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("Database error"),
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(0);
    });
  });

  describe("getUserAttestationCount", () => {
    test("returns total count for user", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest
          .fn()
          .mockImplementation((resolve) => resolve({ count: 5, error: null })),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestationCount(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(5);
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("filters by schema UID when provided", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest
          .fn()
          .mockImplementation((resolve) => resolve({ count: 3, error: null })),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestationCount(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(3);
      expect(queryBuilder.eq).toHaveBeenCalledWith(
        "schema_uid",
        "0xtest_schema",
      );
    });

    test("handles null count gracefully", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest
          .fn()
          .mockImplementation((resolve) =>
            resolve({ count: null, error: null }),
          ),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestationCount(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(0);
    });
  });

  describe("getRecentAttestations", () => {
    test("retrieves recent attestations for schema", async () => {
      const mockAttestations = [
        {
          id: "1",
          schema_uid: "0xtest_schema",
          created_at: new Date().toISOString(),
        },
      ];

      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        limit: jest.fn().mockResolvedValue({
          data: mockAttestations,
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getRecentAttestations("0xtest_schema", 10);

      expect(result).toEqual(mockAttestations);
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("uses default limit when not provided", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        limit: jest.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getRecentAttestations("0xtest_schema");

      expect(queryBuilder.limit).toHaveBeenCalledWith(10); // default limit
    });
  });

  describe("getSchemaStatistics", () => {
    test("calculates comprehensive statistics", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        gte: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) =>
          resolve({
            count: 100,
            data: [
              { recipient: "0xuser1" },
              { recipient: "0xuser2" },
              { recipient: "0xuser1" },
            ],
            error: null,
          }),
        ),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getSchemaStatistics("0xtest_schema");

      expect(result).toEqual({
        totalCount: 100,
        uniqueUsers: 2,
        todayCount: 100, // Mock returns 100 for all counts in this simplified mock
        thisWeekCount: 100,
      });
      expect(queryBuilder.eq).toHaveBeenCalledWith("network", "base-sepolia");
    });

    test("handles database errors gracefully", async () => {
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest
          .fn()
          .mockImplementation((resolve) =>
            resolve({ count: null, error: new Error("Database error") }),
          ),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getSchemaStatistics("0xtest_schema");

      expect(result).toEqual({
        totalCount: 0,
        uniqueUsers: 0,
        todayCount: 0,
        thisWeekCount: 0,
      });
    });
  });

  describe("hasUserAttestationBySchemaKey", () => {
    const mockSchemaUid = "0x" + "b".repeat(64);

    beforeEach(() => {
      (resolveSchemaUID as jest.Mock).mockResolvedValue(mockSchemaUid);
    });

    test("resolves schema UID and calls hasUserAttestation", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { id: "exists" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasUserAttestationBySchemaKey(
        "0x1234567890123456789012345678901234567890",
        "daily_checkin",
      );

      expect(resolveSchemaUID).toHaveBeenCalledWith(
        "daily_checkin",
        "base-sepolia",
      );
      expect(result).toBe(true);
    });

    test("returns false when user has no attestation", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: null,
                    error: new Error("Not found"),
                  }),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasUserAttestationBySchemaKey(
        "0x1234567890123456789012345678901234567890",
        "quest_completion",
      );

      expect(result).toBe(false);
    });
  });
});
