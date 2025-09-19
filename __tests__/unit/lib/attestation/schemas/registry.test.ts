import {
  registerSchema,
  getAllSchemas,
  getSchemaByUid,
  updateSchema,
  deleteSchema,
  getSchemasByCategory,
} from "@/lib/attestation/schemas/registry";
import { supabase } from "@/lib/supabase";

// Mock Supabase
jest.mock("@/lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock validator
jest.mock("@/lib/attestation/utils/validator", () => ({
  isValidSchemaDefinition: jest.fn((def: string) => def !== "invalid-schema"),
}));

describe("schema registry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("registerSchema", () => {
    test("registers valid schema successfully", async () => {
      const mockSchema = {
        schema_uid: "0xtest_schema",
        name: "Test Schema",
        description: "A test schema",
        schema_definition: "address user,string name",
        category: "verification" as const,
        revocable: true,
      };

      // Mock no existing schema
      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: "new-schema-id" },
                error: null,
              }),
            }),
          }),
        });

      const result = await registerSchema(mockSchema);

      expect(result.success).toBe(true);
      expect(result.schemaId).toBe("new-schema-id");
    });

    test("rejects invalid schema definition", async () => {
      const mockSchema = {
        schema_uid: "0xtest_schema",
        name: "Test Schema",
        description: "A test schema",
        schema_definition: "invalid-schema",
        category: "verification" as const,
        revocable: true,
      };

      const result = await registerSchema(mockSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid schema definition format");
    });

    test("prevents duplicate schema UIDs", async () => {
      const mockSchema = {
        schema_uid: "0xexisting_schema",
        name: "Test Schema",
        description: "A test schema",
        schema_definition: "address user,string name",
        category: "verification" as const,
        revocable: true,
      };

      // Mock existing schema found
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: "existing-id" },
              error: null,
            }),
          }),
        }),
      });

      const result = await registerSchema(mockSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Schema with this UID already exists");
    });

    test("handles database insertion errors", async () => {
      const mockSchema = {
        schema_uid: "0xtest_schema",
        name: "Test Schema",
        description: "A test schema",
        schema_definition: "address user,string name",
        category: "verification" as const,
        revocable: true,
      };

      // Mock no existing schema but insertion fails
      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: new Error("Database error"),
              }),
            }),
          }),
        });

      const result = await registerSchema(mockSchema);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to register schema in database");
    });
  });

  describe("getAllSchemas", () => {
    test("retrieves all schemas", async () => {
      const mockSchemas = [
        { id: "1", name: "Schema 1", category: "verification" },
        { id: "2", name: "Schema 2", category: "social" },
      ];

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: mockSchemas,
            error: null,
          }),
        }),
      });

      const result = await getAllSchemas();

      expect(result).toEqual(mockSchemas);
    });

    test("filters by category when provided", async () => {
      const mockSchemas = [
        { id: "1", name: "Schema 1", category: "verification" },
      ];

      const response = { data: mockSchemas, error: null };
      const queryBuilder: any = {
        order: jest.fn().mockImplementation(() => queryBuilder),
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) => resolve?.(response)),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getAllSchemas("verification");

      expect(queryBuilder.order).toHaveBeenCalledWith("name");
      expect(queryBuilder.eq).toHaveBeenCalledWith("category", "verification");
      expect(result).toEqual(mockSchemas);
    });

    test("handles database errors", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: null,
            error: new Error("Database error"),
          }),
        }),
      });

      const result = await getAllSchemas();

      expect(result).toEqual([]);
    });
  });

  describe("getSchemaByUid", () => {
    test("retrieves schema by UID", async () => {
      const mockSchema = {
        id: "1",
        schema_uid: "0xtest_schema",
        name: "Test Schema",
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSchema,
              error: null,
            }),
          }),
        }),
      });

      const result = await getSchemaByUid("0xtest_schema");

      expect(result).toEqual(mockSchema);
    });

    test("returns null when schema not found", async () => {
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

      const result = await getSchemaByUid("0xnonexistent");

      expect(result).toBeNull();
    });
  });

  describe("updateSchema", () => {
    test("updates schema successfully", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await updateSchema("0xtest_schema", {
        name: "Updated Name",
        description: "Updated description",
      });

      expect(result.success).toBe(true);
    });

    test("validates schema definition on update", async () => {
      const result = await updateSchema("0xtest_schema", {
        schema_definition: "invalid-schema",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid schema definition format");
    });

    test("handles database update errors", async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            error: new Error("Update failed"),
          }),
        }),
      });

      const result = await updateSchema("0xtest_schema", {
        name: "Updated Name",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to update schema");
    });
  });

  describe("deleteSchema", () => {
    test("deletes schema with no existing attestations", async () => {
      // Mock no existing attestations
      (supabase.from as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        });

      const result = await deleteSchema("0xtest_schema");

      expect(result.success).toBe(true);
    });

    test("prevents deletion when attestations exist", async () => {
      // Mock existing attestations found
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [{ id: "attestation1" }],
              error: null,
            }),
          }),
        }),
      });

      const result = await deleteSchema("0xtest_schema");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Cannot delete schema with existing attestations",
      );
    });
  });

  describe("getSchemasByCategory", () => {
    test("delegates to getAllSchemas with category filter", async () => {
      const mockSchemas = [
        { id: "1", name: "Schema 1", category: "verification" },
      ];

      const response = { data: mockSchemas, error: null };
      const queryBuilder: any = {
        order: jest.fn().mockImplementation(() => queryBuilder),
        eq: jest.fn().mockImplementation(() => queryBuilder),
        then: jest.fn().mockImplementation((resolve) => resolve?.(response)),
      };

      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue(queryBuilder),
      });

      const result = await getSchemasByCategory("verification");

      expect(queryBuilder.eq).toHaveBeenCalledWith("category", "verification");
      expect(result).toEqual(mockSchemas);
    });
  });
});
