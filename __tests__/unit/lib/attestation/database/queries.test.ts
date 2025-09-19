import {
  getUserAttestations,
  getAttestationsBySchema,
  getAttestationByUid,
  hasUserAttestation,
  getUserDailyCheckinStreak,
  getUserAttestationCount,
  getRecentAttestations,
  getSchemaStatistics,
} from "@/lib/attestation/database/queries";
import { supabase } from "@/lib/supabase";

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
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

      const result = await getUserAttestations(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toEqual(mockAttestations);
    });

    test("filters by schema UID when provided", async () => {
      const response = { data: [], error: null };
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        order: jest.fn().mockImplementation(() => queryBuilder),
        limit: jest.fn().mockImplementation(() => queryBuilder),
        range: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) => resolve?.(response)),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      await getUserAttestations("0x1234567890123456789012345678901234567890", {
        schemaUid: "0xtest_schema",
      });

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

    test("applies limit and offset when provided", async () => {
      const mockRange = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  range: mockRange,
                }),
              }),
            }),
          }),
        }),
      });

      await getUserAttestations("0x1234567890123456789012345678901234567890", {
        limit: 10,
        offset: 20,
      });

      expect(mockRange).toHaveBeenCalledWith(20, 29); // offset to offset + limit - 1
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

      const result = await getAttestationsBySchema("0xtest_schema");

      expect(result).toEqual(mockAttestations);
    });

    test("applies limit when provided", async () => {
      const mockLimit = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: mockLimit,
              }),
            }),
          }),
        }),
      });

      await getAttestationsBySchema("0xtest_schema", { limit: 5 });

      expect(mockLimit).toHaveBeenCalledWith(5);
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
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
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
      });

      const result = await hasUserAttestation(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(true);
    });

    test("returns false when user has no attestation", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
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
      });

      const result = await hasUserAttestation(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(false);
    });
  });

  describe("getUserDailyCheckinStreak", () => {
    test("calculates streak correctly for consecutive days", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const mockCheckins = [
        { created_at: now.toISOString() },
        { created_at: yesterday.toISOString() },
        { created_at: twoDaysAgo.toISOString() },
      ];

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: mockCheckins,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(3);
    });

    test("returns 0 for no check-ins", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(0);
    });

    test("handles database errors gracefully", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                  data: null,
                  error: new Error("Database error"),
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getUserDailyCheckinStreak(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(0);
    });
  });

  describe("getUserAttestationCount", () => {
    test("returns total count for user", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 5,
              error: null,
            }),
          }),
        }),
      });

      const result = await getUserAttestationCount(
        "0x1234567890123456789012345678901234567890",
      );

      expect(result).toBe(5);
    });

    test("filters by schema UID when provided", async () => {
      const response = { count: 3, error: null };
      const queryBuilder: any = {
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) => resolve?.(response)),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getUserAttestationCount(
        "0x1234567890123456789012345678901234567890",
        "0xtest_schema",
      );

      expect(result).toBe(3);
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(
        1,
        "recipient",
        "0x1234567890123456789012345678901234567890",
      );
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(2, "is_revoked", false);
      expect(queryBuilder.eq).toHaveBeenNthCalledWith(
        3,
        "schema_uid",
        "0xtest_schema",
      );
    });

    test("handles null count gracefully", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: null,
              error: null,
            }),
          }),
        }),
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

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue({
                  data: mockAttestations,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getRecentAttestations("0xtest_schema", 10);

      expect(result).toEqual(mockAttestations);
    });

    test("uses default limit when not provided", async () => {
      const mockLimit = jest.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockReturnValue({
                limit: mockLimit,
              }),
            }),
          }),
        }),
      });

      await getRecentAttestations("0xtest_schema");

      expect(mockLimit).toHaveBeenCalledWith(10); // default limit
    });
  });

  describe("getSchemaStatistics", () => {
    test("calculates comprehensive statistics", async () => {
      // Mock multiple database calls
      const mockFrom = jest.fn();

      // Total count
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: 100,
              error: null,
            }),
          }),
        }),
      });

      // Unique users
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [
                { recipient: "0xuser1" },
                { recipient: "0xuser2" },
                { recipient: "0xuser1" }, // duplicate
              ],
              error: null,
            }),
          }),
        }),
      });

      // Today's count
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({
                count: 5,
                error: null,
              }),
            }),
          }),
        }),
      });

      // This week's count
      mockFrom.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              gte: jest.fn().mockResolvedValue({
                count: 25,
                error: null,
              }),
            }),
          }),
        }),
      });

      (supabase.from as jest.Mock) = mockFrom;

      const result = await getSchemaStatistics("0xtest_schema");

      expect(result).toEqual({
        totalCount: 100,
        uniqueUsers: 2, // user1 and user2 (deduplicated)
        todayCount: 5,
        thisWeekCount: 25,
      });
    });

    test("handles database errors gracefully", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              count: null,
              error: new Error("Database error"),
            }),
          }),
        }),
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
});
