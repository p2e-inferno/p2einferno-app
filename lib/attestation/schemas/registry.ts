/**
 * Schema registry management utilities
 */

import { supabase } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";
import { AttestationSchema } from "../core/types";
import { isValidSchemaDefinition } from "../utils/validator";

const log = getLogger("lib:attestation:schemas");

const getDefaultNetworkName = (): string =>
  process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia";

const resolveNetwork = (network?: string): string =>
  network || getDefaultNetworkName();

/**
 * Register a new attestation schema
 */
export const registerSchema = async (
  schema: Omit<AttestationSchema, "id" | "created_at" | "updated_at">,
  network?: string,
): Promise<{ success: boolean; error?: string; schemaId?: string }> => {
  try {
    const resolvedNetwork = schema.network || resolveNetwork(network);
    // Validate schema definition
    if (!isValidSchemaDefinition(schema.schema_definition)) {
      return {
        success: false,
        error: "Invalid schema definition format",
      };
    }

    // Check if schema with same UID already exists
    const { data: existingSchema } = await supabase
      .from("attestation_schemas")
      .select("id")
      .eq("schema_uid", schema.schema_uid)
      .eq("network", resolvedNetwork)
      .single();

    if (existingSchema) {
      return {
        success: false,
        error: "Schema with this UID already exists",
      };
    }

    // Insert new schema
    const { data, error } = await supabase
      .from("attestation_schemas")
      .insert({
        ...schema,
        network: resolvedNetwork,
      })
      .select("id")
      .single();

    if (error) {
      log.error("Error registering schema", { error });
      return {
        success: false,
        error: "Failed to register schema in database",
      };
    }

    return {
      success: true,
      schemaId: data.id,
    };
  } catch (error) {
    log.error("Error registering schema", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Get all attestation schemas
 */
export const getAllSchemas = async (
  category?: string,
  network?: string,
): Promise<AttestationSchema[]> => {
  try {
    let query = supabase.from("attestation_schemas").select("*").order("name");
    const resolvedNetwork = resolveNetwork(network);
    query = query.eq("network", resolvedNetwork);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      log.error("Error fetching schemas", { error });
      return [];
    }

    return data || [];
  } catch (error) {
    log.error("Error fetching schemas", { error });
    return [];
  }
};

/**
 * Get schema by UID
 */
export const getSchemaByUid = async (
  schemaUid: string,
  network?: string,
): Promise<AttestationSchema | null> => {
  try {
    const resolvedNetwork = resolveNetwork(network);
    const { data, error } = await supabase
      .from("attestation_schemas")
      .select("*")
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .single();

    if (error || !data) {
      log.error("Schema not found", { error });
      return null;
    }

    return data;
  } catch (error) {
    log.error("Error fetching schema", { error });
    return null;
  }
};

/**
 * Update an existing schema
 */
export const updateSchema = async (
  schemaUid: string,
  updates: Partial<
    Omit<AttestationSchema, "id" | "schema_uid" | "created_at" | "updated_at">
  >,
  network?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const resolvedNetwork = resolveNetwork(network);
    // Validate schema definition if being updated
    if (
      updates.schema_definition &&
      !isValidSchemaDefinition(updates.schema_definition)
    ) {
      return {
        success: false,
        error: "Invalid schema definition format",
      };
    }

    const { error } = await supabase
      .from("attestation_schemas")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork);

    if (error) {
      log.error("Error updating schema", { error });
      return {
        success: false,
        error: "Failed to update schema",
      };
    }

    return { success: true };
  } catch (error) {
    log.error("Error updating schema", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Delete a schema (soft delete by setting inactive)
 */
export const deleteSchema = async (
  schemaUid: string,
  network?: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const resolvedNetwork = resolveNetwork(network);
    // Check if schema has existing attestations
    const { data: attestations } = await supabase
      .from("attestations")
      .select("id")
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .limit(1);

    if (attestations && attestations.length > 0) {
      return {
        success: false,
        error: "Cannot delete schema with existing attestations",
      };
    }

    // Delete the schema
    const { error } = await supabase
      .from("attestation_schemas")
      .delete()
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork);

    if (error) {
      log.error("Error deleting schema", { error });
      return {
        success: false,
        error: "Failed to delete schema",
      };
    }

    return { success: true };
  } catch (error) {
    log.error("Error deleting schema", { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

/**
 * Get schemas by category
 */
export const getSchemasByCategory = async (
  category: string,
  network?: string,
): Promise<AttestationSchema[]> => {
  return getAllSchemas(category, network);
};
